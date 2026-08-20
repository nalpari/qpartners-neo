"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { isAxiosError } from "axios";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import api from "@/lib/axios";
import { DataGrid } from "@/components/ag-grid";
import { MobileCardList } from "@/components/common/mobile-card-list";
import type { MobileCardField } from "@/components/common/mobile-card-list";
import { Button } from "@/components/common";
import { useAlertStore } from "@/lib/store";
import { parseContentDispositionFilename } from "@/lib/content-disposition";

/**
 * 마이페이지 「施工ID情報」 카드 데이터 — `GET /api/mypage/profile` 의 `sekoConstruction`.
 * AS-IS Connector getUserInfo(No.3) 응답에서 시공ID 관련 필드만 추린 것이다.
 *
 * `sekoStatus` 는 **표시에 사용하지 않는다**. 코드값 의미가 AS-IS 측에서 확정되지 않아
 * TO-BE 가 자체 판정하면 본가 화면과 어긋날 수 있어, 회신 전까지는 받은 값을 그대로 둔다.
 */
export interface SekoConstruction {
  sekoId: string | null;
  sekoIssueDate: string | null;
  sekoLimit: string | null;
  sekoStatus: number | null;
  supplierKind: number | null;
  deltaStatus: number | null;
  availableFileTypes: readonly string[];
  /**
   * 자동로그인 후 이동할 AS-IS 화면 주소. 서버가 커넥터 호스트에서 파생해 내려준다 —
   * 자동로그인 쿠키가 그 호스트에만 유효하므로 화면 URL 을 클라이언트에 하드코딩하면
   * 환경이 갈리는 순간 비로그인 상태로 도착한다.
   */
  asIsLinks: { seminar: string; mypage: string };
}

interface ConstructionRow {
  id: string;
  acquiredDate: string;
  expiryDate: string;
  note: string;
  fileTypes: readonly string[];
}

// supplierKind(4~7) → 備考 라벨 (사양서: 4=시공점 / 5=델타 / 6=스미토모 / 7=델타 SAVeR-H2)
const SUPPLIER_KIND_LABEL: Record<number, string> = {
  4: "施工店",
  5: "施工店 (デルタ)",
  6: "施工店 (スミトモ)",
  7: "施工店 (デルタ SAVeR-H2)",
};

// 다운로드 가능한 문서 종류 → 표시명. CERT2 는 미사용(QA#12)이라 매핑을 두지 않는다.
const FILE_TYPE_LABEL: Record<string, string> = {
  RECEIPT: "受講料領収書",
  CERT1: "施工証明書1",
};

const EMPTY_MESSAGE = "施工ID情報がありません";

/**
 * 자동로그인이 끝나기를 기다리는 시간(ms).
 *
 * 실측 왕복은 1초 내외다. 짧으면 세션이 심어지기 전에 이동해 **비로그인 상태로 도착**하고,
 * 길면 사용자가 AS-IS 홈을 그만큼 오래 보게 된다. 2배 여유로 2초를 잡았다.
 * 비로그인 도착 사례가 보고되면 이 값부터 올릴 것.
 */
const AUTOLOGIN_SETTLE_MS = 2000;

/** AS-IS 는 `YYYY-MM-DD` 로 내려준다. 화면 표기는 도트 구분자로 통일. */
function formatDate(value: string | null): string {
  if (!value) return "-";
  return value.replace(/-/g, ".");
}

function toRows(data: SekoConstruction | null): ConstructionRow[] {
  // 시공ID 미보유 회원은 빈 목록. AS-IS 응답은 시공ID 단건이므로 최대 1행이다.
  if (!data?.sekoId) return [];
  return [
    {
      id: data.sekoId,
      acquiredDate: formatDate(data.sekoIssueDate),
      expiryDate: formatDate(data.sekoLimit),
      note:
        data.supplierKind != null
          ? (SUPPLIER_KIND_LABEL[data.supplierKind] ?? "施工店")
          : "-",
      // 라벨이 정의된 종류만 노출 — AS-IS 가 CERT2 를 실어 보내도 화면에는 나오지 않는다.
      fileTypes: data.availableFileTypes.filter((t) => t in FILE_TYPE_LABEL),
    },
  ];
}

function DownloadLinks({
  fileTypes,
  onDownload,
  downloading,
}: {
  fileTypes: readonly string[];
  onDownload: (fileType: string) => void;
  downloading: string | null;
}) {
  if (fileTypes.length === 0) {
    return <span className="text-[#999]">-</span>;
  }
  return (
    <div className="flex items-center gap-[16px]">
      {fileTypes.map((fileType) => (
        <button
          key={fileType}
          type="button"
          disabled={downloading != null}
          onClick={() => onDownload(fileType)}
          className="flex items-center gap-[8px] cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Image
            src="/asset/images/layout/download_icon.svg"
            alt=""
            width={16}
            height={18}
          />
          <span>
            {downloading === fileType
              ? "ダウンロード中…"
              : FILE_TYPE_LABEL[fileType]}
          </span>
        </button>
      ))}
    </div>
  );
}

/** ag-grid 셀은 컴포넌트 밖에서 정의되므로 핸들러/상태는 grid `context` 로 전달받는다. */
function DocumentCell(params: ICellRendererParams<ConstructionRow>) {
  const row = params.data;
  if (!row) return null;
  const ctx = params.context;
  const onDownload =
    ctx &&
    typeof ctx === "object" &&
    "onDownload" in ctx &&
    typeof ctx.onDownload === "function"
      ? (ctx.onDownload as (fileType: string) => void)
      : () => {};
  const downloading =
    ctx &&
    typeof ctx === "object" &&
    "downloading" in ctx &&
    typeof ctx.downloading === "string"
      ? ctx.downloading
      : null;

  return (
    <DownloadLinks
      fileTypes={row.fileTypes}
      onDownload={onDownload}
      downloading={downloading}
    />
  );
}

const columnDefs: ColDef<ConstructionRow>[] = [
  { headerName: "施工ID", field: "id", flex: 1 },
  {
    headerName: "施工ID取得日",
    field: "acquiredDate",
    flex: 1,
    cellStyle: { justifyContent: "center" },
  },
  {
    headerName: "建設IDの有効期限",
    field: "expiryDate",
    flex: 1,
    cellStyle: { justifyContent: "center" },
  },
  {
    headerName: "ドキュメントダウンロード",
    // `field` 를 주면 ag-grid 가 배열 값에 값 포매터를 추론하려다 warning #48 을 낸다.
    // 이 컬럼은 셀 렌더러가 행 전체를 읽어 버튼을 그리므로 필드 바인딩 자체가 불필요하다.
    colId: "documents",
    sortable: false,
    flex: 1,
    cellRendererSelector: () => ({ component: DocumentCell }),
  },
  {
    headerName: "備考",
    field: "note",
    flex: 1,
    cellStyle: { justifyContent: "center" },
  },
];

export function MypageInfoConstruction({
  data,
}: {
  data: SekoConstruction | null;
}) {
  const { openAlert } = useAlertStore();
  const [downloading, setDownloading] = useState<string | null>(null);
  const rows = toRows(data);

  // ag-grid 셀 렌더러는 부모 리렌더만으로 갱신되지 않는다. 두 가지 결과가 따라온다:
  //  1) 셀이 붙잡고 있는 핸들러가 옛 렌더의 `downloading` 을 보므로 state 기반 중복 클릭 가드가
  //     동작하지 않는다 → ref 로 판정한다(렌더와 무관하게 항상 최신).
  //  2) 「ダウンロード中…」 표시도 자동으로 바뀌지 않는다 → 아래 effect 에서 명시적으로 refresh.
  // 모바일(MobileCardList)은 일반 React 트리라 state 만으로 정상 동작한다.
  const inFlightRef = useRef(false);
  const gridApiRef = useRef<GridApi<ConstructionRow> | null>(null);
  const navigatingRef = useRef(false);

  /**
   * AS-IS Q.Partners 로 **자동로그인 후 지정 화면 이동** (No.1).
   *
   * 새 창을 열어 2단계로 처리한다:
   *  1) `/api/auth/seko/autologin` → AS-IS 자동로그인 → AS-IS 가 세션 쿠키를 심고 **홈으로** 보냄
   *  2) 잠시 뒤 그 창을 목적 화면으로 다시 이동
   *
   * 2단계가 필요한 이유: AS-IS 자동로그인은 착지 화면을 지정할 수 없다. 요청 본문 파라미터도
   * URL 쿼리도 200 으로 받아주기만 하고 전부 루트로 보낸다(preview 실측). AS-IS 가 착지 경로를
   * 지원하면 이 대기 로직은 통째로 사라진다.
   *
   * 대기 시간이 고정값인 이유: 다른 오리진 창이라 로드 완료를 감지할 수 없다. iframe `onload`
   * 로 감지하는 방법은 서드파티 쿠키 차단에 걸려 **테스트 환경에서만 실패**하므로 검증이
   * 불가능하다 — 어디서나 같게 동작하는 타이머를 택했다. 자동로그인 왕복은 실측 1초 내외다.
   *
   * `fetch` 가 아니라 창 이동인 이유, `<a href>` 를 쓰지 않는 이유는 같다: 발급 URL 이
   * **1회·1분** 유효라 미리 받아두거나 프리페치되면 그대로 소진되어 사용자는
   * 「このリンクは無効か、有効期限が切れています」를 보게 된다.
   */
  const handleAutoLogin = (target: string | undefined) => {
    if (!target) {
      // 서버가 링크를 못 내려준 경우(커넥터 base URL 미설정 등).
      openAlert({
        type: "alert",
        message: "リンク情報を取得できませんでした。ページを再読み込みしてください。",
      });
      return;
    }
    // 창이 뜨기까지 수백 ms — 그 사이 재클릭하면 자동로그인 URL 이 한 번 더 발급되어
    // 앞의 URL 이 버려진다.
    if (navigatingRef.current) return;
    navigatingRef.current = true;

    // `noopener` 를 주면 window.open 이 null 을 반환해 창 제어권이 사라진다 — 2단계 이동을
    // 해야 하므로 핸들을 유지한다. 여는 대상이 우리 라우트(→ AS-IS)라 신뢰 범위 안이다.
    const opened = window.open("/api/auth/seko/autologin", "_blank");
    if (!opened) {
      navigatingRef.current = false;
      openAlert({
        type: "alert",
        message: "ポップアップがブロックされました。ブラウザの設定をご確認ください。",
      });
      return;
    }

    window.setTimeout(() => {
      navigatingRef.current = false;
      // 사용자가 이미 닫았으면 건드리지 않는다.
      if (!opened.closed) opened.location.href = target;
    }, AUTOLOGIN_SETTLE_MS);
  };

  useEffect(() => {
    gridApiRef.current?.refreshCells({ force: true });
  }, [downloading]);

  const handleDownload = async (fileType: string) => {
    // 다운로드는 AS-IS 왕복 2회(메타 + 바이너리)라 응답이 느릴 수 있다 — 중복 클릭 차단.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setDownloading(fileType);
    try {
      const res = await api.get<Blob>(
        `/mypage/seko-file?fileType=${encodeURIComponent(fileType)}`,
        { responseType: "blob" },
      );
      // blob URL 다운로드는 Content-Disposition 이 무시되므로 파일명을 직접 파싱해 넘긴다.
      const dispo =
        (res.headers["content-disposition"] as string | undefined) ?? null;
      const fileName = parseContentDispositionFilename(dispo) ?? fileType;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error("[MypageInfoConstruction] 다운로드 실패:", err);
      const status = isAxiosError(err) ? err.response?.status : undefined;
      openAlert({
        type: "alert",
        message:
          status === 404
            ? "ファイルが見つかりません。"
            : "ファイルのダウンロードに失敗しました。しばらくしてからお試しください。",
      });
    } finally {
      inFlightRef.current = false;
      setDownloading(null);
    }
  };

  const mobileFields: MobileCardField<ConstructionRow>[] = [
    { label: "施工ID", key: "id" },
    { label: "施工ID取得日", key: "acquiredDate" },
    { label: "建設IDの有効期限", key: "expiryDate" },
    {
      label: "ドキュメントダウンロード",
      key: "fileTypes",
      render: (item) => (
        <DownloadLinks
          fileTypes={item.fileTypes}
          onDownload={(fileType) => void handleDownload(fileType)}
          downloading={downloading}
        />
      ),
    },
    { label: "備考", key: "note" },
  ];

  return (
    <section className="bg-white lg:rounded-[12px] lg:shadow-[0px_6px_32px_-8px_rgba(0,0,0,0.05)] w-full lg:max-w-[1440px]">
      {/* 헤더 */}
      <div className="px-[24px] pt-[34px] pb-[18px] lg:px-[42px] lg:pb-[14px]">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-[18px] lg:gap-[14px] w-full">
          <h3 className="font-['Noto_Sans_JP'] font-medium text-[16px] leading-[1.5] text-[#45576f] w-[82px]">
            施工ID情報
          </h3>
          <div className="flex gap-[6px] w-full lg:w-auto lg:ml-auto">
            <Button
              variant="primary"
              className="flex-1 lg:flex-none lg:w-[113px]"
              onClick={() => handleAutoLogin(data?.asIsLinks?.seminar)}
            >
              WEB研修申請
            </Button>
            <Button
              variant="secondary"
              className="flex-1 lg:flex-none lg:w-[160px]"
              onClick={() => handleAutoLogin(data?.asIsLinks?.mypage)}
            >
              施工ID情報詳細確認
            </Button>
          </div>
        </div>
      </div>

      {/* PC: DataGrid */}
      <div className="hidden lg:block px-[42px] pb-[42px]">
        <DataGrid
          columnDefs={columnDefs}
          rowData={rows}
          emptyMessage={EMPTY_MESSAGE}
          onGridReady={(event) => {
            gridApiRef.current = event.api;
          }}
          context={{
            onDownload: (fileType: string) => {
              void handleDownload(fileType);
            },
            downloading,
          }}
        />
      </div>

      {/* 모바일: MobileCardList */}
      <div className="lg:hidden bg-[#F7F9FB] pb-[10px]">
        {rows.length === 0 ? (
          <p className="bg-white px-6 py-[34px] font-['Noto_Sans_JP'] text-[14px] leading-[1.5] text-[#45576f] text-center">
            {EMPTY_MESSAGE}
          </p>
        ) : (
          <MobileCardList
            data={rows}
            fields={mobileFields}
            keyExtractor={(item) => item.id}
          />
        )}
      </div>
    </section>
  );
}
