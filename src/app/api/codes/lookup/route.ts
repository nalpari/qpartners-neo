import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// 비인증 공개 조회 허용 화이트리스트 — 신규 공개 코드 추가 시 본 목록에 반드시 등록
// (middleware.ts의 PUBLIC_GET_PATTERNS와 짝을 이룸)
const ALLOWED_PUBLIC_HEADER_CODES = new Set<string>([
  "INQUIRY_TYPE", // 문의하기 문의 유형
  "PAGE_SIZE", // 목록 페이지 사이즈 옵션
  "APPROVER", // 컨텐츠 상세 최종승인자 라벨 (비회원 접근 가능)
  "USER_TYPE", // 회원유형 검색 SelectBox + reverseMap 소스 (회원관리)
]);

// GET /api/codes/lookup?headerCode=INQUIRY_TYPE — 공통코드 공개 조회 (headerCode 기반)
export async function GET(request: NextRequest) {
  try {
    const headerCode = request.nextUrl.searchParams.get("headerCode");

    if (!headerCode || !/^[A-Z0-9_]{1,50}$/.test(headerCode)) {
      console.warn("[GET /api/codes/lookup] headerCode 파라미터 누락 또는 형식 불일치:", headerCode);
      return NextResponse.json(
        { error: "headerCodeパラメータが不正です" },
        { status: 400 },
      );
    }

    // 공개 화이트리스트에 등록되지 않은 headerCode는 404로 응답 (enumeration 방어)
    // — 401/403으로 응답하면 "존재하지만 비공개"가 노출되므로 404로 통일
    if (!ALLOWED_PUBLIC_HEADER_CODES.has(headerCode)) {
      console.warn("[GET /api/codes/lookup] 공개 화이트리스트 미등록 headerCode:", headerCode);
      return NextResponse.json(
        { error: "該当するコードが見つかりません" },
        { status: 404 },
      );
    }

    // 선택적 필터 — 화면별 노출 대상을 코드관리(rel_code1)로 제어하기 위한 파라미터.
    // 미전달 시 조건 미적용(전체 조회)이라 기존 호출부 동작은 그대로다.
    // 예) USER_TYPE&relCode1=Y — 회원관리 검색 SelectBox 노출 대상만 (시공점은 "N" 이라 제외)
    // 값 자체는 로그에 남기지 않는다 (민감값이 들어올 수 있는 파라미터).
    const relCode1 = request.nextUrl.searchParams.get("relCode1");

    const header = await prisma.codeHeader.findFirst({
      where: { headerCode, isActive: true },
      select: { id: true, headerCode: true, headerName: true },
    });

    if (!header) {
      console.warn("[GET /api/codes/lookup] 해당 코드 없음:", headerCode);
      return NextResponse.json(
        { error: "該当するコードが見つかりません" },
        { status: 404 },
      );
    }

    // 공개 응답 projection — code/codeName 만 내려보냄.
    // displayCode/codeNameEtc/sortOrder 등 내부 운영 필드 제외 (조직구조·순서 유출 방어).
    // sortOrder 는 서버 정렬에만 사용, 클라이언트엔 노출 안 함.
    // 보조 정렬: id asc — 동일 sortOrder 가 둘 이상일 때 결정적 순서 보장
    // (신규 추가 시 기존 항목과 sortOrder 충돌하더라도 등록 순서대로 안정 정렬).
    const details = await prisma.codeDetail.findMany({
      where: { headerId: header.id, isActive: true, ...(relCode1 ? { relCode1 } : {}) },
      select: { code: true, codeName: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });

    return NextResponse.json({ data: details });
  } catch (error) {
    console.error("[GET /api/codes/lookup] 공통코드 조회 실패", error);
    return NextResponse.json(
      { error: "コードの取得に失敗しました" },
      { status: 500 },
    );
  }
}
