import { z } from "zod";

import { userTpValues } from "@/lib/schemas/common";
import { validatePasswordPolicy } from "@/lib/schemas/signup";

// ─── 프로필 수정 요청 ───

/** 프로필 수정 스키마 (userType에 따라 회사 필드 필수/선택 분기) */
export const profileUpdateSchema = z.object({
  userType: z.enum(userTpValues).optional(),
  sei: z.string().min(1, "姓は必須です").max(50),
  mei: z.string().min(1, "名は必須です").max(50),
  seiKana: z.string().min(1, "姓(カナ)は必須です").max(50),
  meiKana: z.string().min(1, "名(カナ)は必須です").max(50),
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
  // ADMIN은 회사 정보가 없을 수 있으므로 필수 검증 제외
  if (data.userType === "ADMIN") return;

  if (!data.compNm) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "会社名は必須です", path: ["compNm"] });
  }
  if (!data.zipcode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "郵便番号は必須です", path: ["zipcode"] });
  }
  if (!data.address1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "住所は必須です", path: ["address1"] });
  }
  if (!data.telNo) {
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

export const withdrawSchema = z.object({
  reason: z.string().min(1, "退会理由は必須です").max(1000),
});

export type WithdrawInput = z.infer<typeof withdrawSchema>;

// ─── QSP userDetail 응답 (프로필 조회용) ───

export const qspUserDetailSchema = z.object({
  userId: z.string(),
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
