// 더미 테이블 데이터 (기획서 image01.png 기준)

export interface ContentItem {
  id: string;
  infoType: string;
  target: string;
  title: string;
  hasAttachment: boolean;
  createdAt: string;
  updatedAt: string | null;
  postTarget: string;
  department: string;
  approver: string;
}

export const DUMMY_CONTENTS: ContentItem[] = [
  {
    id: "1",
    infoType: "記事, FAQ",
    target: "BtoB, BtoC",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.03.18",
    updatedAt: "2026.03.18",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
  {
    id: "2",
    infoType: "記事",
    target: "BtoB",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.03.17",
    updatedAt: "2026.03.19",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
  {
    id: "3",
    infoType: "記事",
    target: "BtoB",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.02.16",
    updatedAt: "2026.02.16",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
  {
    id: "4",
    infoType: "記事",
    target: "BtoB",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.02.16",
    updatedAt: "2026.02.16",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
  {
    id: "5",
    infoType: "記事",
    target: "BtoB",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.02.16",
    updatedAt: "2026.02.16",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
  {
    id: "6",
    infoType: "記事",
    target: "BtoB",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.02.16",
    updatedAt: "2026.02.16",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
  {
    id: "7",
    infoType: "記事",
    target: "BtoB",
    title: "オンライン保証システム 保証申請期限の施行について",
    hasAttachment: true,
    createdAt: "2026.02.16",
    updatedAt: "2026.02.16",
    postTarget: "2次以降の販売店",
    department: "技術施工",
    approver: "事業部長",
  },
];

// NEW: 등록일부터 5일간
export function isNew(createdAt: string): boolean {
  const date = new Date(createdAt.replace(/\./g, "-"));
  const diff = Date.now() - date.getTime();
  return diff <= 5 * 24 * 60 * 60 * 1000;
}

// UPDATE: 갱신일부터 5일간
export function isUpdated(updatedAt: string | null): boolean {
  if (!updatedAt) return false;
  const date = new Date(updatedAt.replace(/\./g, "-"));
  const diff = Date.now() - date.getTime();
  return diff <= 5 * 24 * 60 * 60 * 1000;
}
