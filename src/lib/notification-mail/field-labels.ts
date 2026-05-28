/**
 * 속성 변경 알림 메일에서 표시할 필드 라벨 매핑.
 *
 * AS-IS oldQpartners `sitemanage/ini/dbword.ini` 의 일본어 필드 라벨을
 * TO-BE `profileUpdateSchema` (src/lib/schemas/mypage.ts) 필드명 기준으로 재매핑.
 *
 * 분류 (본문 섹션 헤더 기준):
 *   - COMPANY_FIELD_LABELS: 본문 `●法人情報変更` 섹션 (AS-IS edit_user.txt 의 `●会社情報変更` 에서 라벨 변경)
 *   - USER_FIELD_LABELS: 본문 `●会員情報変更` 섹션
 *
 * 신규 필드 (AS-IS 미존재): department, jobTitle, corporateNo, newsRcptYn 은
 * 적절한 일본어 라벨을 신규 부여.
 *
 * 매핑 누락 필드는 본문에 포함하지 않고 `console.warn` 으로 추적
 * (attr-change-mail.ts diffFields 내부).
 */

/** 회사정보 변경 항목 (본문 ●法人情報変更 섹션) */
export const COMPANY_FIELD_LABELS: Record<string, string> = {
  compNm: "会社名",
  compNmKana: "会社名フリガナ",
  zipcode: "郵便番号",
  address1: "市区町村",
  address2: "以降の住所",
  telNo: "電話番号",
  fax: "FAX番号",
  corporateNo: "法人番号",
};

/** 회원정보 변경 항목 (●会員情報変更 섹션) */
export const USER_FIELD_LABELS: Record<string, string> = {
  sei: "氏名(姓)",
  mei: "氏名(名)",
  seiKana: "フリガナ(姓)",
  meiKana: "フリガナ(名)",
  department: "部署",
  jobTitle: "役職",
  newsRcptYn: "ニュースレター受信",
};
