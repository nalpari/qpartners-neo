import { z } from "zod";

import { userTpValues } from "@/lib/schemas/common";

// ─── QSP 로그인 요청 ───

export const loginRequestSchema = z.object({
  loginId: z.string().min(1, "ログインIDは必須です"),
  pwd: z.string().min(1, "パスワードは必須です"),
  userTp: z.enum(userTpValues).default("GENERAL"),
});

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;

// ─── QSP 로그인 응답 ───

export const qspLoginUserSchema = z.object({
  userId: z.string(),
  userNm: z.string().nullable(),
  userNmKana: z.string().nullable(),
  // QSP 외부 시스템이므로 미지의 userTp 대비 — DEALER→STORE 과도기 호환 + 미지 값은 파싱 실패
  userTp: z.string().transform((val, ctx) => {
    // QSP 과도기: DEALER → STORE 호환 매핑
    if (val === "DEALER") return "STORE" as const;
    const parsed = z.enum(userTpValues).safeParse(val);
    if (parsed.success) return parsed.data;
    // unknown userTp → 파싱 실패 (caller에서 502 반환, GENERAL 폴백으로 잘못된 권한 부여 방지)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown userTp: ${val}` });
    return z.NEVER;
  }).pipe(z.enum(userTpValues)),
  compCd: z.string().nullable(),
  compNm: z.string().nullable(),
  compNmKana: z.string().nullable(),
  // QSP 응답에서 필드 자체가 omit될 수 있어 nullish 사용 (다른 형제 필드와 다름)
  compTelNo: z.string().nullish(),
  email: z.string().nullable(),
  deptNm: z.string().nullable(),
  pstnNm: z.string().nullable(),
  authCd: z.string().nullable(),
  storeLvl: z.string().nullable(),
  statCd: z.string().nullable(),
  secAuthYn: z.enum(["Y", "N"]).nullable(),
  secAuthDt: z.string().nullable(),
  loginFailCnt: z.number().nullable(),
  pwdInitYn: z.enum(["Y", "N"]).nullable(),
  // 로그인 알림 사용 여부 (회원관리 p.47 #6) — Y 면 로그인 성공 시 알림 메일 발송 (Redmine #2125).
  // QSP 응답에서 필드 자체가 omit 될 수 있으므로 nullish (regDt/compTelNo 와 동일 정책).
  loginNotiYn: z.enum(["Y", "N"]).nullish(),
  // QSP 가입일 ("YYYY.MM.DD" 또는 "YYYY.MM.DD HH:mm:ss"). 로그인 응답에서 누락될 수 있으므로
  // nullish. 2FA 유예기간(신규가입 후 validityDays) 판정에 사용 — 누락 시 유예 스킵 후
  // secAuthDt 기반 판정으로 폴백.
  regDt: z.string().nullish(),
});

export type QspLoginUser = z.infer<typeof qspLoginUserSchema>;

export const qspLoginResponseSchema = z.object({
  code: z.number().nullable(),
  data: qspLoginUserSchema.nullable(),
  data2: z.unknown().nullable(),
  result: z.object({
    code: z.number(),
    resultCode: z.string(),
    message: z.string(),
    resultMsg: z.string(),
  }),
});

export type QspLoginResponse = z.infer<typeof qspLoginResponseSchema>;

// ─── 클라이언트에 전달할 로그인 사용자 정보 ───

export const loginUserSchema = qspLoginUserSchema
  .pick({
    userId: true,
    userNm: true,
    userTp: true,
    compCd: true,
    compNm: true,
    email: true,
    deptNm: true,
    authCd: true,
    storeLvl: true,
    statCd: true,
  })
  .extend({
    /**
     * authRole 동적 권한 코드 — 6 기본 + 운영자 정의 추가 권한 모두 허용 (Target Dynamic from Role 후).
     * 형식 제약은 schemas/common.ts roleCodeFormatSchema 와 동일 (영대문자/숫자/언더스코어 50자).
     * 활성/비활성 검증은 resolveMenuPermission 의 role.isActive 분기에서 수행 — DB 단일 진실 원천.
     *
     * optional: 배포 전 발급된 JWT(authRole 없음)와의 호환성 유지
     * TODO: 과도기 제거 — 전체 사용자 재로그인 후 optional 제거하고 required로 전환
     */
    authRole: z.string().min(1).max(50).regex(/^[A-Z0-9][A-Z0-9_]*$/).optional(),
    twoFactorVerified: z.boolean(),
    // 전화번호 — 현재는 QSP compTelNo(회사 전화번호) 단일 매핑
    // nullish: 기존 JWT 호환 (undefined, 재로그인 전까지) + QSP 응답 null 허용
    // TODO: SEKO 사용자는 개인 전화번호(telNo) 별도 처리 필요
    telNo: z.string().nullish(),
    // 최초 로그인(N) 시 회원정보 설정 popup 우선 표시 — 2FA 분기보다 우선.
    // nullish 폴백 정책 (auto-login/inbound 와 동일):
    //   - 본 필드 추가 이전에 발급된 구 JWT (필드 자체 미존재 → undefined) → 2FA 분기로 정상 폴백 (popup 미진입)
    //   - QSP 응답 null (필드 미설정/이관 잔재) → 동일하게 2FA 분기로 폴백
    //   - 클라이언트 분기 `userData.pwdInitYn === "N"` 가 false 가 되어 personal-info popup 미표시
    pwdInitYn: z.enum(["Y", "N"]).nullish(),
    // 로그인 알림 사용 여부 — Redmine #2214 후속.
    // 2FA 필요 사용자(ADMIN/SUPER_ADMIN 등)의 경우 1차 로그인 시점에 발송하면
    // 사용자가 "인증도 안 끝났는데 로그인 성공 메일이 왔다" 고 인지하므로
    // 2FA 검증 성공(verify) 시점에 발송한다. verify route 에서 발송 조건 판별을 위해
    // JWT 페이로드에 포함. nullish 폴백: 구 JWT 호환 (필드 부재 → 발송 안 함).
    loginNotiYn: z.enum(["Y", "N"]).nullish(),
  });

export type LoginUser = z.infer<typeof loginUserSchema>;
