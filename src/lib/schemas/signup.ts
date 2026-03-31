import { z } from "zod";

// ─── 비밀번호 정책 ───

/** 비밀번호 정책: 영문대문자 + 영문소문자 + 숫자 조합, 8자 이상 */
export function validatePasswordPolicy(password: string): boolean {
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return password.length >= 8 && hasUpperCase && hasLowerCase && hasNumber;
}

// ─── 회원가입 요청 ───

export const signupRequestSchema = z
  .object({
    email: z.string().email("유효한 이메일 주소를 입력해주세요").max(100),
    pwd: z.string().min(8, "비밀번호는 8자 이상이어야 합니다").max(100),
    confirmPwd: z.string().min(1, "비밀번호 확인은 필수입니다"),
    user1stNm: z.string().min(1, "이름은 필수입니다").max(50),
    user2ndNm: z.string().min(1, "성은 필수입니다").max(50),
    user1stNmKana: z.string().min(1, "이름(카나)은 필수입니다").max(50),
    user2ndNmKana: z.string().min(1, "성(카나)은 필수입니다").max(50),
    compNm: z.string().min(1, "회사명은 필수입니다").max(100),
    compNmKana: z.string().min(1, "회사명(카나)은 필수입니다").max(100),
    compPostCd: z.string().min(1, "우편번호는 필수입니다").max(10),
    compAddr: z.string().min(1, "주소는 필수입니다").max(255),
    compAddr2: z.string().min(1, "주소2는 필수입니다").max(255),
    compTelNo: z.string().min(1, "전화번호는 필수입니다").max(100),
    compFaxNo: z.string().max(100).optional().default(""),
    deptNm: z.string().max(50).optional().default(""),
    pstnNm: z.string().max(50).optional().default(""),
    newsRcptYn: z.enum(["Y", "N"], {
      message: "뉴스레터 수신 여부는 Y 또는 N입니다",
    }),
  })
  .refine((data) => data.pwd === data.confirmPwd, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["confirmPwd"],
  })
  .refine((data) => validatePasswordPolicy(data.pwd), {
    message:
      "비밀번호는 영문대문자, 영문소문자, 숫자를 조합하여 8자 이상이어야 합니다",
    path: ["pwd"],
  });

export type SignupRequestInput = z.infer<typeof signupRequestSchema>;

// ─── 이메일 검증 ───

export const emailSchema = z.string().email("유효한 이메일 주소를 입력해주세요");

// ─── QSP 공용 응답 스키마 ───

/** QSP API 공통 응답 구조 (newUserReq, userDetail 등 공용)
 *  QSP I/F v1.0 기준: code(int, 필수), message(string, 필수), resultCode(string, 필수), resultMsg(string, 선택) */
export const qspResponseSchema = z.object({
  data: z.unknown().nullable(),
  result: z.object({
    code: z.number(),
    message: z.string(),
    resultCode: z.string(),
    resultMsg: z.string(),
  }),
});

export type QspResponse = z.infer<typeof qspResponseSchema>;

