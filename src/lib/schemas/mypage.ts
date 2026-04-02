import { z } from "zod";

import { userTpValues } from "@/lib/schemas/common";
import { validatePasswordPolicy } from "@/lib/schemas/signup";

// ─── 프로필 수정 요청 ───

export const profileUpdateSchema = z.object({
  sei: z.string().min(1, "姓は必須です").max(50),
  mei: z.string().min(1, "名は必須です").max(50),
  seiKana: z.string().min(1, "姓(カナ)は必須です").max(50),
  meiKana: z.string().min(1, "名(カナ)は必須です").max(50),
  compNm: z.string().min(1, "会社名は必須です").max(100),
  compNmKana: z.string().max(100).optional().default(""),
  zipcode: z.string().min(1, "郵便番号は必須です").max(10),
  address1: z.string().min(1, "住所は必須です").max(255),
  address2: z.string().max(255).optional().default(""),
  telNo: z.string().min(1, "電話番号は必須です").max(100),
  fax: z.string().max(100).optional().default(""),
  department: z.string().max(50).optional().default(""),
  jobTitle: z.string().max(50).optional().default(""),
  corporateNo: z.string().max(50).optional().default(""),
  newsRcptYn: z.enum(["Y", "N"], {
    message: "ニュースレター受信はYまたはNです",
  }),
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
  });

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
  compTelNo: z.string().nullable(),
  compFaxNo: z.string().nullable(),
  deptNm: z.string().nullable(),
  pstnNm: z.string().nullable(),
  corporateNo: z.string().nullable(),
  newsRcptYn: z.enum(["Y", "N"]).nullable(),
  newsRcptDate: z.string().nullable(),
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
