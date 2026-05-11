import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireMenuPermission } from "@/lib/auth";
import { QSP_API, SITE_DEFAULTS } from "@/lib/config";
import { fetchWithLog, maskUserId } from "@/lib/interface-logger";
import { qspDeptListResponseSchema } from "@/lib/schemas/master";

// GET /api/master/deptList — QSP 担当部門 목록 (콘텐츠 검색 필터의 부서 dropdown)
//
// 권한: CONT_LIST.canRead 매트릭스 가드 — 콘텐츠 목록 화면에 종속된 부서 dropdown 이므로
// 콘텐츠 목록 read 권한을 그대로 따른다. 종전 requireAdmin 하드코딩 분기는 폐지
// (2026-05-08 정책 — 권한관리 매트릭스 단일 진실).
// loginId 는 클라이언트 페이로드가 아닌 인증 세션의 userId 를 그대로 QSP 에 전달 — 위조 불가.
// 응답은 `/codes/lookup` 패턴과 일관된 `{ data: [{ deptCd, deptNm }] }` 형태로 정규화하여,
// QSP 의 `result` envelope (외부 시스템 헬스 정보) 가 클라이언트로 누출되지 않도록 한다.

const LOG = "[GET /api/master/deptList]";
const QSP_TIMEOUT_MS = 10_000;

export async function GET(request: NextRequest) {
  try {
    // 1) 매트릭스 가드 — CONT_LIST.canRead 보유자만 QSP 부서 목록 조회 허용 (fail-closed)
    const auth = await requireMenuPermission(request.headers, "CONT_LIST", "read");
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
