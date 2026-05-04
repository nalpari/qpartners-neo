import { MAIL_FOOTER_TEXT } from "@/lib/mail-templates/footer";
import type { QspMemberDetail } from "@/lib/qsp-member";
import type { ProfileUpdateInput } from "@/lib/schemas/mypage";

import { ATTR_CHANGE_MAIL_SUBJECT, SITE_URL_FALLBACK } from "./constants";
import { COMPANY_FIELD_LABELS, USER_FIELD_LABELS } from "./field-labels";
import { sendNotificationMail } from "./send-notification";

/**
 * QSP 가 user2ndNm/user1stNm 을 null 로 주고 userNm("姓 名") 만 내려주는 케이스 fallback.
 * 마이페이지 GET (`/api/mypage/profile`) 의 splitName 과 동일 로직 — 공백/전각공백 기준 2-split.
 */
function splitName(nm: string | null | undefined): [string | null, string | null] {
  if (!nm) return [null, null];
  const parts = nm.split(/[\s　]+/, 2);
  if (parts.length < 2) return [null, null];
  return [parts[0], parts[1]];
}

/**
 * 속성 변경 알림 메일 빌더 + 발송 헬퍼.
 *
 * AS-IS oldQpartners `mypage/profile/index.php:530-553` 미러링.
 * 본문 양식은 `sitemanage/templates/_mail/edit_user.txt` 그대로.
 *
 * 발송 조건은 호출부에서 `attrChgYn === "Y"` 확인 후 진입.
 * 변경 항목 0건이면 본 함수 내 가드로 발송 스킵.
 */

export interface AttrChangeMailContext {
  /** 회원 본인 이메일 */
  to: string;
  /** 본문 인사말에 사용할 성/이름 */
  recipientName: { sei: string; mei: string };
  /** 변경 직전 QSP userDetail */
  preDetail: QspMemberDetail;
  /** 마이페이지 수정 요청 값 */
  request: ProfileUpdateInput;
  /** 호출부 식별 prefix — 로깅용 */
  callerRoute: string;
}

/**
 * TO-BE 필드명 → preDetail 의 QSP 필드명 매핑.
 * QSP user1stNm/user2ndNm 는 명/성 순서로 저장됨 (sei=user2ndNm, mei=user1stNm).
 * 마이페이지 GET/PUT 처리 (route.ts) 와 일관되게 매핑.
 */
function mapPreFieldValue(preDetail: QspMemberDetail, toBeField: string): unknown {
  switch (toBeField) {
    // 성명 4필드: QSP 가 user1stNm/user2ndNm 을 null 로 주고 userNm 합본만 내려주는 케이스를 위해
    // splitName fallback 적용 (Redmine #2171 — "수정 안 했는데 성명 4행 표시" 버그 픽스).
    // GET 응답이 splitName 결과로 sei/mei 를 채워서 프론트로 보내고, 사용자가 그대로 [저장]하면
    // request.sei 와 preDetail.user2ndNm(null) 비교에서 mismatch → 변경됐다고 잘못 판정되는 문제.
    case "sei": return preDetail.user2ndNm ?? splitName(preDetail.userNm)[0];
    case "mei": return preDetail.user1stNm ?? splitName(preDetail.userNm)[1];
    case "seiKana": return preDetail.user2ndNmKana ?? splitName(preDetail.userNmKana)[0];
    case "meiKana": return preDetail.user1stNmKana ?? splitName(preDetail.userNmKana)[1];
    case "compNm": return preDetail.compNm;
    case "compNmKana": return preDetail.compNmKana;
    case "zipcode": return preDetail.compPostCd;
    case "address1": return preDetail.compAddr;
    case "address2": return preDetail.compAddr2;
    case "telNo": return preDetail.compTelNo;
    case "fax": return preDetail.compFaxNo;
    case "department": return preDetail.deptNm;
    case "jobTitle": return preDetail.pstnNm;
    case "corporateNo": return preDetail.corporateNo;
    case "newsRcptYn": return preDetail.newsRcptYn;
    default:
      console.warn(`[attr-change-mail] preDetail 매핑 누락: ${toBeField}`);
      return undefined;
  }
}

function normalizeValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  return escapeHtml(String(v));
}

/**
 * 변경된 필드 추출.
 * preDetail 과 request 비교 후 다른 항목만 `라벨 : 값` 형식 1줄로 반환.
 *
 * 매핑 규칙:
 *   - request 값이 undefined/null → 변경 의도 없음 (스킵)
 *   - request 값과 preDetail 값이 normalize 후 동일 → 실질 변경 없음 (스킵)
 *   - 그 외 → 변경 1줄 추가
 */
function diffFields(
  preDetail: QspMemberDetail,
  request: ProfileUpdateInput,
  labelMap: Record<string, string>,
): string[] {
  const lines: string[] = [];

  for (const [fieldName, label] of Object.entries(labelMap)) {
    const requestValue = (request as Record<string, unknown>)[fieldName];
    if (requestValue === undefined || requestValue === null || requestValue === "") continue;

    const preValue = mapPreFieldValue(preDetail, fieldName);
    if (normalizeValue(preValue) === normalizeValue(requestValue)) continue;

    lines.push(`${label} : ${formatValue(requestValue)}`);
  }

  return lines;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * AS-IS edit_user.txt 양식 그대로 HTML 본문 생성.
 * Plain text 양식을 `<pre>` 로 래핑 (mailer.ts 가 HTML 필수).
 * 모든 동적 값은 escapeHtml 적용.
 */
function buildBodyHtml(args: {
  recipientName: { sei: string; mei: string };
  companyChanges: string[];
  userChanges: string[];
  siteUrl: string;
}): string {
  const lines: string[] = [
    "※本メールは「Q.PARTNERS」をご利用いただく際の重要な情報を記載しておりますので、大切に保存していただきますようお願いいたします。",
    "",
    `${escapeHtml(args.recipientName.sei)}　${escapeHtml(args.recipientName.mei)}様`,
    "",
    "いつも「Q.PARTNERS」をご利用いただきまして、誠にありがとうございます。",
    "以下の登録情報の変更が完了しましたので、以下にご連絡いたします。",
    "",
    "●会社情報変更",
    ...args.companyChanges,
    "",
    "",
    "●会員情報変更",
    ...args.userChanges,
    "",
    "もし本メールの内容に心当たりが無い場合は、大変お手数ですがその旨ご明記のうえ、本メールの内容とともにご返信ください。",
    "",
    "お客様の登録情報は、ログイン後「マイページ」にてご確認いただけます。",
    `マイページ(URL)：${escapeHtml(args.siteUrl)}/mypage/`,
    "",
    "--------------------------------------------------------------------------------",
    "このメールは、ご登録されたメールアドレス宛に自動的に送信されています。",
    "本メールに心あたりが無い場合には、お手数ですがメールの件名もしくは本文の始めに",
    "「登録の記憶無し」と記載し、本メールに返信(q-partners@hqj.co.jp)してください。",
    "--------------------------------------------------------------------------------",
    "",
    MAIL_FOOTER_TEXT,
  ];

  return `<pre style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; white-space: pre-wrap;">${lines.join("\n")}</pre>`;
}

/**
 * 속성 변경 알림 발송.
 * 호출부 패턴:
 *   if (preDetail?.attrChgYn === "Y") {
 *     void sendAttrChangeNotification({ to, recipientName, preDetail, request, callerRoute });
 *   }
 */
export async function sendAttrChangeNotification(ctx: AttrChangeMailContext): Promise<void> {
  const companyChanges = diffFields(ctx.preDetail, ctx.request, COMPANY_FIELD_LABELS);
  const userChanges = diffFields(ctx.preDetail, ctx.request, USER_FIELD_LABELS);

  if (companyChanges.length === 0 && userChanges.length === 0) {
    console.log(`${ctx.callerRoute} 변경 항목 없음 — 알림 메일 발송 스킵`);
    return;
  }

  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    console.warn(`${ctx.callerRoute} SITE_URL 환경변수 미설정 — fallback(${SITE_URL_FALLBACK}) 사용`);
  }

  const html = buildBodyHtml({
    recipientName: ctx.recipientName,
    companyChanges,
    userChanges,
    siteUrl: siteUrl ?? SITE_URL_FALLBACK,
  });

  await sendNotificationMail({
    to: ctx.to,
    subject: ATTR_CHANGE_MAIL_SUBJECT,
    html,
    callerRoute: ctx.callerRoute,
  });
}
