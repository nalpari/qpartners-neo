/**
 * 일본 도도부현 코드(JIS X 0401) → 명칭 매핑.
 *
 * AS-IS Q.Partners 시공점 커넥터(`getUserInfo`)는 주소를 **도도부현 코드(숫자) + 시구읍면
 * 이하 문자열**로 나누어 내려준다(실측: `pref: 13`, `address1: "港区"`). 코드를 명칭으로
 * 풀지 않으면 화면 주소에서 도도부현이 통째로 빠진다(Redmine #2480).
 *
 * 값이 47개 고정이고 국가 표준(총무성 JIS X 0401)이라 공통코드가 아닌 상수로 둔다 —
 * 운영자가 바꿀 성질의 데이터가 아니다.
 */
const JP_PREFECTURE_NAMES: Record<number, string> = {
  1: "北海道",
  2: "青森県",
  3: "岩手県",
  4: "宮城県",
  5: "秋田県",
  6: "山形県",
  7: "福島県",
  8: "茨城県",
  9: "栃木県",
  10: "群馬県",
  11: "埼玉県",
  12: "千葉県",
  13: "東京都",
  14: "神奈川県",
  15: "新潟県",
  16: "富山県",
  17: "石川県",
  18: "福井県",
  19: "山梨県",
  20: "長野県",
  21: "岐阜県",
  22: "静岡県",
  23: "愛知県",
  24: "三重県",
  25: "滋賀県",
  26: "京都府",
  27: "大阪府",
  28: "兵庫県",
  29: "奈良県",
  30: "和歌山県",
  31: "鳥取県",
  32: "島根県",
  33: "岡山県",
  34: "広島県",
  35: "山口県",
  36: "徳島県",
  37: "香川県",
  38: "愛媛県",
  39: "高知県",
  40: "福岡県",
  41: "佐賀県",
  42: "長崎県",
  43: "熊本県",
  44: "大分県",
  45: "宮崎県",
  46: "鹿児島県",
  47: "沖縄県",
};

/**
 * 도도부현 코드를 명칭으로 변환한다. 범위 밖(1~47 외)·null 은 `null`.
 *
 * 미지의 코드에 대해 코드값을 그대로 노출하지 않는다 — 화면에 「13」 같은 숫자가 주소로
 * 찍히는 것보다 도도부현이 비는 편이 오인 소지가 적다.
 */
export function getPrefectureName(code: number | null | undefined): string | null {
  if (code == null) return null;
  return JP_PREFECTURE_NAMES[code] ?? null;
}

/**
 * 도도부현 코드와 시구읍면 이하 주소를 하나의 주소 문자열로 합친다.
 *
 * AS-IS 표기(`東京都港区`)에 맞춰 **구분자 없이** 이어 붙인다. 코드를 풀지 못하면 기존
 * 주소를 그대로 돌려주어, 매핑 실패가 주소 자체를 잃는 결과로 번지지 않게 한다.
 */
export function joinAddressWithPrefecture(
  code: number | null | undefined,
  address: string | null | undefined,
): string {
  const pref = getPrefectureName(code);
  const rest = address ?? "";
  if (!pref) return rest;
  return `${pref}${rest}`;
}
