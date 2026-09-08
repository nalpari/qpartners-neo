import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConfigError } from "@/lib/errors";
import { getUserFromRequest, sessionInvalidResponse } from "@/lib/jwt";
import { sekoFileQuerySchema } from "@/lib/schemas/mypage";
import { sekoFileDownload } from "@/lib/seko-connector";
import { ensureFileExtension, inlineSekoReceiptHtml } from "@/lib/seko-receipt-inline";

// GET /api/mypage/seko-file — 시공점 첨부파일 다운로드 (No.5 fileDownload 프록시)
//
// AS-IS 는 파일 바이너리를 바로 주지 않고 Bearer 가 필요한 `fileUrl` 을 준다. 브라우저를 그리로
// 리다이렉트하면 토큰이 노출되는 데다 도메인이 달라 인증도 붙지 않으므로, TO-BE 서버가 대신
// 받아서 스트리밍한다 (커넥터 `sekoFileDownload` 가 2단계를 담당).
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      );
    }
    if (!user.twoFactorVerified) {
      return NextResponse.json(
        { error: "2段階認証が必要です" },
        { status: 403 },
      );
    }

    // 시공점 회원 전용
    if (user.userTp !== "SEKO") {
      return NextResponse.json(
        { error: "施工店会員のみ利用可能です" },
        { status: 403 },
      );
    }

    if (!user.sekoToken) {
      console.error("[GET /api/mypage/seko-file] SEKO 세션 토큰 없음 — 재로그인 필요");
      return sessionInvalidResponse("セッションが無効です。再度ログインしてください");
    }
    // 시공점 loginId = email (사양). profile 라우트와 동일하게 userId 로 대체 전송하지 않는다.
    if (!user.email) {
      console.error("[GET /api/mypage/seko-file] SEKO email(=loginId) 누락 — 재로그인 필요");
      return sessionInvalidResponse("セッション情報が不完全です。再度ログインしてください");
    }

    const queryResult = sekoFileQuerySchema.safeParse({
      fileType: request.nextUrl.searchParams.get("fileType"),
    });
    if (!queryResult.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: queryResult.error.issues },
        { status: 400 },
      );
    }
    const { fileType } = queryResult.data;

    // 문서는 세션 주인(userId·loginId)의 것으로 고정한다. sekoId 를 쿼리로 받으면 세션 JWT 에
    // 시공ID 가 없어 소유권 검증이 불가능한 채로 AS-IS 에 실려 나가고, 타 시공점 시공증명서를
    // 받아갈 수 있다. 화면도 fileType 만 보내므로 제거해도 기능 손실이 없다.
    const result = await sekoFileDownload(
      { userId: user.userId, loginId: user.email, fileType },
      user.sekoToken,
      "[GET /api/mypage/seko-file]",
    );
    if (!result.ok) {
      // Connector 인증 실패(토큰 만료)는 profile 과 동일하게 세션을 종료한다 —
      // 쿠키를 남기면 middleware 는 통과시키고 SEKO 호출만 반복 401 이 되어 세션이 고착된다.
      if (result.error.status === 401) {
        return sessionInvalidResponse(result.error.error);
      }
      return NextResponse.json(
        { error: result.error.error },
        { status: result.error.status },
      );
    }

    // RECEIPT(text/html)만 자산을 인라인해 자기완결 문서로 만든다. AS-IS 가 주는 원본은 4KB
    // HTML 조각이고 CSS·로고·도장이 AS-IS 서버에 남아 있어, 그대로 저장하면 사용자 PC 에서
    // 스타일 없이 열린다(Redmine #2481). CERT1(application/pdf)은 손대지 않는다.
    //
    // 실패 시 원본 바이트를 그대로 내려보낸다 — 보기 좋아지는 것보다 다운로드가 되는 것이 우선.
    let responseBody: ArrayBuffer | string = result.body;
    let contentType = result.contentType;
    if (contentType.split(";")[0].trim().toLowerCase() === "text/html") {
      const inlined = await inlineSekoReceiptHtml(
        result.body,
        user.sekoToken,
        "[GET /api/mypage/seko-file]",
      );
      if (inlined) {
        responseBody = inlined;
        // 원본 contentType 에는 charset 이 없다. 일본어 본문이므로 명시하지 않으면 브라우저가
        // 로컬 파일을 열 때 인코딩을 잘못 추정해 글자가 깨진다.
        contentType = "text/html; charset=utf-8";
      }
    }

    // 바이너리 프록시 스트리밍.
    // RECEIPT 는 text/html 로 내려오므로 attachment + nosniff 가 필수다 — 없으면 AS-IS 가 만든
    // HTML 이 우리 오리진에서 렌더되어 XSS 경로가 된다.
    // 파일명은 콘텐츠 다운로드 라우트와 동일 패턴(ASCII fallback + RFC5987 filename*).
    // AS-IS 의 RECEIPT fileName 에는 확장자가 없어 저장 후 열리지 않으므로 여기서 보정한다.
    const fileName = ensureFileExtension(result.fileName, contentType);
    const contentDisposition = `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // SEKO 커넥터는 SEKO_CONNECTOR_BASE_URL 미설정 시 ConfigError 를 던진다.
    // 500 으로 접으면 운영자가 env 누락을 코드 버그와 구분할 수 없어 별도 로그를 남긴다.
    if (error instanceof ConfigError) {
      console.error(
        "[GET /api/mypage/seko-file] 설정 에러:",
        error.name,
        "— SEKO_CONNECTOR_BASE_URL 설정 확인 필요",
      );
    } else {
      console.error("[GET /api/mypage/seko-file]", error);
    }
    return NextResponse.json(
      { error: "施工店ファイルダウンロード中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
