import { z } from "zod";

import { userTpValues } from "@/lib/schemas/common";
import { validatePasswordPolicy } from "@/lib/schemas/signup";

// ─── 프로필 수정 요청 ───

/**
 * 프로필 수정 스키마.
 * 마이페이지 수정 정책:
 *   GENERAL — 전체 수정 가능 (이름, 회사, 뉴스레터)
 *   ADMIN/STORE — 뉴스레터만 수정 가능 (패스워드는 별도 API)
 *   SEKO — 이 API 사용 불가 (route에서 400 early return, /api/mypage/seko-info 사용)
 */
export const profileUpdateSchema = z.object({
  userType: z.enum(userTpValues).optional(),
  sei: z.string().max(50).optional().default(""),
  mei: z.string().max(50).optional().default(""),
  seiKana: z.string().max(50).optional().default(""),
  meiKana: z.string().max(50).optional().default(""),
  compNm: z.string().max(100).optional().default(""),
  compNmKana: z.string().max(100).optional().default(""),
  zipcode: z.string().max(10).optional().default(""),
  address1: z.string().max(255).optional().default(""),
  address2: z.string().max(255).optional().default(""),
  telNo: z.string().max(100).optional().default(""),
  fax: z.string().max(100).optional().default(""),
  department: z.string().max(50).optional().default(""),
  jobTitle: z.string().max(50).optional().default(""),
  corporateNo: z.string().max(50).optional().default(""),
  newsRcptYn: z.enum(["Y", "N"], {
    message: "ニュースレター受信はYまたはNです",
  }),
}).superRefine((data, ctx) => {
  // ADMIN/STORE는 뉴스레터만 수정 가능 → 다른 필드 검증 불필요
  if (data.userType === "ADMIN" || data.userType === "STORE") return;

  // GENERAL: 이름 + 회사 정보 필수 (공백만으로 구성된 값도 빈 값 취급)
  if (!data.sei?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "姓は必須です", path: ["sei"] });
  }
  if (!data.mei?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "名は必須です", path: ["mei"] });
  }
  if (!data.seiKana?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "姓(カナ)は必須です", path: ["seiKana"] });
  }
  if (!data.meiKana?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "名(カナ)は必須です", path: ["meiKana"] });
  }
  if (!data.compNm?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "会社名は必須です", path: ["compNm"] });
  }
  if (!data.zipcode?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "郵便番号は必須です", path: ["zipcode"] });
  }
  if (!data.address1?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "住所は必須です", path: ["address1"] });
  }
  if (!data.telNo?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "電話番号は必須です", path: ["telNo"] });
  }
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// ─── 비밀번호 변경 요청 ───

export const changePasswordSchema = z
  .object({
    currentPwd: z.string().min(1, "現在のパスワードは必須です"),
    newPwd: z.string().min(8, "パスワードは8文字以上必要です").max(100),
    confirmPwd: z.string().min(1, "パスワード確認は必須です"),
  })
  .refine((data) => data.newPwd === data.confirmPwd, {
    message: "パスワードが一致しません",
    path: ["confirmPwd"],
  })
  .refine((data) => data.newPwd !== data.currentPwd, {
    message: "現在のパスワードと同じパスワードには変更できません",
    path: ["newPwd"],
  })
  .refine((data) => validatePasswordPolicy(data.newPwd), {
    message:
      "パスワードは英大文字・英小文字・数字を組み合わせて8文字以上にしてください",
    path: ["newPwd"],
  })
  .transform((data) => ({ currentPwd: data.currentPwd, newPwd: data.newPwd }));

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ─── 회원탈퇴 요청 ───

// QSP saveResignReq 의 resignRemark 필드는 최대 500자 (사양서 No.8).
// 사양서보다 관대한 상한을 허용하면 QSP 측에서 500 초과분이 silently truncate 되거나
// 저장 실패가 뒤늦게 감지되므로, 입력 단계에서 동일 제약으로 막는다.
export const withdrawSchema = z.object({
  reason: z.string().trim().min(1, "退会理由は必須です").max(500, "退会理由は500文字以内で入力してください"),
});

export type WithdrawInput = z.infer<typeof withdrawSchema>;

// ─── QSP userDetail 응답 (프로필 조회용) ───

export const qspUserDetailSchema = z.object({
  userId: z.string(),
  userNm: z.string().nullable(),
  userNmKana: z.string().nullable(),
  user1stNm: z.string().nullable(),
  user2ndNm: z.string().nullable(),
  user1stNmKana: z.string().nullable(),
  user2ndNmKana: z.string().nullable(),
  email: z.string().nullable(),
  compNm: z.string().nullable(),
  compNmKana: z.string().nullable(),
  compPostCd: z.string().nullable(),
  compAddr: z.string().nullable(),
  compAddr2: z.string().nullable(),
  // QSP 응답에서 필드 자체가 omit될 수 있어 nullish 사용
  // (qspLoginUserSchema.compTelNo와 동일)
  compTelNo: z.string().nullish(),
  compFaxNo: z.string().nullable(),
  deptNm: z.string().nullable(),
  pstnNm: z.string().nullable(),
  corporateNo: z.string().nullish(),
  newsRcptYn: z.enum(["Y", "N"]).nullable(),
  newsRcptDate: z.string().nullish(),
  // QSP 과도기: DEALER → STORE 호환 매핑 (qspLoginUserSchema와 동일 로직)
  userTp: z.string().nullable().transform((val) => {
    if (val === "DEALER") return "STORE" as const;
    return val;
  }).pipe(z.enum(userTpValues).nullable()),
  storeLvl: z.string().nullable(),
});

export type QspUserDetail = z.infer<typeof qspUserDetailSchema>;

// ─── 시공점 파일 다운로드 쿼리 ───

export const sekoFileTypes = ["RECEIPT", "CERT1", "CERT2"] as const;

export const sekoFileQuerySchema = z.object({
  fileType: z.enum(sekoFileTypes, {
    message: "fileTypeはRECEIPT, CERT1, CERT2のいずれかです",
  }),
});

export const qspUserDetailResponseSchema = z.object({
  data: qspUserDetailSchema.nullable(),
  result: z.object({
    code: z.number(),
    message: z.string(),
    resultCode: z.string(),
    resultMsg: z.string(),
  }),
});
