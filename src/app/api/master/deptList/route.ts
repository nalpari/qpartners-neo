import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { QSP_API, SITE_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskUserId } from "@/lib/interface-logger";
import { qspDeptListResponseSchema } from "@/lib/schemas/master";

// GET /api/master/deptList — QSP 担当部門 목록 (관리자 전용 콘텐츠 검색 필터)
//
// middleware 가 X-User-* 헤더를 주입한 뒤 requireAdmin 으로 SUPER_ADMIN || ADMIN 만 통과시킨다.
// loginId 는 클라이언트 페이로드가 아닌 인증 세션의 userId 를 그대로 QSP 에 전달 — 위조 불가.
// 응답은 `/codes/lookup` 패턴과 일관된 `{ data: [{ deptCd, deptNm }] }` 형태로 정규화하여,
// QSP 의 `result` envelope (외부 시스템 헬스 정보) 가 클라이언트로 누출되지 않도록 한다.

const LOG = "[GET /api/master/deptList]";
const QSP_TIMEOUT_MS = 10_000;

export async function GET(request: NextRequest) {
  try {
    // 1) 관리자 인증 — UI 가 isInternal 로 가드되지만 서버 재검증 (fail-closed)
    const auth = requireAdmin(request.headers);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    // 2) QSP 부서 목록 조회
    const params = new URLSearchParams({
      loginId: user.userId,
      accsSiteCd: SITE_DEFAULTS.accsSiteCd,
    });

    let qspResponse: Response;
    try {
      qspResponse = await fetchWithLog(
        `${QSP_API.deptList}?${params.toString()}`,
        {
          method: "GET",
          signal: AbortSignal.timeout(QSP_TIMEOUT_MS),
        },
        {
          system: "QSP",
          direction: "OUTBOUND",
          apiName: "deptList",
          callerRoute: LOG,
          userId: maskUserId(user.userId),
          userType: user.userType,
        },
      );
    } catch (error) {
      console.error(`${LOG} QSP 호출 실패:`, error);
      return NextResponse.json(
        { error: "外部サーバーに接続できません" },
        { status: 502 },
      );
    }

    if (!qspResponse.ok) {
      console.error(`${LOG} QSP 비정상 응답:`, qspResponse.status);
      return NextResponse.json(
        { error: "外部サーバーエラーが発生しました" },
        { status: 502 },
      );
    }

    let qspBody: unknown;
    try {
      qspBody = await qspResponse.json();
    } catch (error) {
      console.error(`${LOG} QSP 응답 파싱 실패:`, error);
      return NextResponse.json(
        { error: "外部サーバーの応答を処理できません" },
        { status: 502 },
      );
    }

    const parsed = qspDeptListResponseSchema.safeParse(qspBody);
    if (!parsed.success) {
      console.error(`${LOG} QSP 응답 스키마 불일치:`, parsed.error.issues);
      return NextResponse.json(
        { error: "外部サーバーの応答形式が正しくありません" },
        { status: 502 },
      );
    }

    if (parsed.data.result.resultCode !== "S") {
      console.error(
        `${LOG} QSP 비즈니스 에러 (resultCode: ${parsed.data.result.resultCode})`,
      );
      return NextResponse.json(
        { error: "部署一覧の取得に失敗しました" },
        { status: 502 },
      );
    }

    // QSP 가 빈 결과를 data: null 로 내려보내는 케이스 대응 — 항상 배열로 정규화
    return NextResponse.json({ data: parsed.data.data ?? [] });
  } catch (error) {
    console.error(LOG, error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
