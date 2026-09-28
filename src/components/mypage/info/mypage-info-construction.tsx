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
import {
  SEKO_AUTOLOGIN_FAILURE_MESSAGE,
  SEKO_AUTOLOGIN_RELOGIN_REASON,
  parseSekoAutoLoginFailure,
} from "@/lib/seko-autologin-result";
/**
 * 착지 화면 식별자는 커넥터 타입을 그대로 쓴다 — 여기서 다시 선언하면 허용값이 라우트·
 * 커넥터와 조용히 갈라진다. 화면 URL 이 아니라 식별자를 넘기고, 경로 매핑은 서버가 쥔다.
 * (타입 전용 import 라 서버 전용 모듈이 클라이언트 번들에 들어가지 않는다.)
 */
import type { SekoRedirectPath } from "@/lib/seko-connector";

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
}

interface ConstructionRow {
  id: string;
  acquiredDate: string;
  expiryDate: string;
  note: string;
  fileTypes: readonly string[];
}

/**
 * supplierKind → 備考 라벨.
 *
 * 화면설계서 기준: **5·6·7 만 시공점명을 표시하고 그 외(4=일반 시공점)는 빈값**이다
 * (Redmine #2472). 4 도 "施工店" 으로 채우면 설계서와 어긋나므로 매핑에 두지 않는다 —
 * 여기 없는 값은 아래 `toRows` 에서 빈 문자열이 된다.
 */
const SUPPLIER_KIND_LABEL: Record<number, string> = {
  5: "施工店(デルタ)",
  6: "施工店(住友)",
  7: "施工店(デルタ SAVeR-H2)",
};

// 다운로드 가능한 문서 종류 → 표시명 (Redmine #2482).
// CERT2 는 미사용(QA#12)이라 매핑을 두지 않는다.
const FILE_TYPE_LABEL: Record<string, string> = {
  RECEIPT: "領収証",
  CERT1: "施工証明書 (A4サイズ)",
};

const EMPTY_MESSAGE = "施工ID情報がありません";

/** 자동로그인 창이 AS-IS 로 넘어갔는지(=성공) 확인하는 폴링 주기(ms). */
const AUTOLOGIN_POLL_MS = 200;

/**
 * 자동로그인 전체 대기 상한(ms). 이동도 실패 통지도 없이 이 시간을 넘기면 일반 실패로 안내한다.
 *
 * 커넥터 타임아웃(`seko-connector.ts` 의 `SEKO_TIMEOUT_MS` = 10초)에 라우트 왕복·결과 페이지
 * 로드 여유를 더한 값이다. 이보다 짧게 잡으면 커넥터가 제때 실패를 돌려주는 정상 경로까지
 * 상한에 먼저 걸려, 사유별 안내가 일반 실패 문구로 뭉개진다.
 */
const AUTOLOGIN_DEADLINE_MS = 15_000;

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
      // 매핑에 없는 종류(4=일반 시공점, null 등)는 빈값 — 설계서 요건(#2472).
      // "-" 를 쓰지 않는 것은 「값이 없음」이 아니라 「표시 대상이 아님」이기 때문이다.
      note:
        data.supplierKind != null
          ? (SUPPLIER_KIND_LABEL[data.supplierKind] ?? "")
          : "",
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
  // 첨부파일은 줄바꿈하여 세로로 표시한다 (Redmine #2473 / 화면설계서).
  // 가로 배치는 파일 종류가 늘면 컬럼 폭을 넘겨 잘린다.
  // `autoHeight` 컬럼이라 이 셀 높이가 곧 행 높이다 — 여백을 최소로 잡는다.
  // 각 줄의 높이는 아이콘(18px)이 결정하므로(`leading-none` 으로 텍스트 행간 제거),
  // 2줄 36px + 줄간격 2px ≒ 38px 이 실질 하한이다. 더 줄이려면 아이콘 크기를 손대야 한다.
  return (
    <div className="flex flex-col items-start gap-[2px]">
      {fileTypes.map((fileType) => (
        <button
          key={fileType}
          type="button"
          disabled={downloading != null}
          onClick={() => onDownload(fileType)}
          className="flex items-center gap-[8px] leading-none whitespace-nowrap cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
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
  // 施工ID 는 가운데정렬 — 다른 컬럼과 정렬을 맞춘다 (Redmine #2473).
  {
    headerName: "施工ID",
    field: "id",
    flex: 1,
    cellStyle: { justifyContent: "center" },
  },
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
    // 다른 컬럼보다 넓게 — 「施工証明書 (A4サイズ)」 + 아이콘이 한 줄에 들어가야 한다.
    // 폭이 모자라 라벨이 줄바꿈되면 셀이 한 줄 더 늘어난다.
    flex: 1.4,
    /**
     * 첨부파일을 세로로 쌓으므로(#2473) 셀 높이가 공통 행 높이(57px)를 넘는다.
     * `autoHeight` 를 주면 AG Grid 가 **이 셀의 실제 높이에 맞춰 행을 늘린다** —
     * 행 높이를 숫자로 지정하는 방식은 테마가 셀에 거는 CSS 높이를 이기지 못해
     * 내용이 행 경계를 넘쳐 잘렸다.
     */
    autoHeight: true,
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
  // 진행 중인 자동로그인 1건의 정리 함수(타이머 해제 + 리스너 제거). 실패 통지가 오거나
  // 언마운트될 때 호출한다.
  const autoLoginCleanupRef = useRef<(() => void) | null>(null);

  // 언마운트 시 남은 타이머·리스너 정리 — 마이페이지를 떠난 뒤 창이 이동하거나
  // 사라진 컴포넌트가 alert 를 띄우는 것을 막는다.
  useEffect(() => () => autoLoginCleanupRef.current?.(), []);

  /**
   * AS-IS Q.Partners 로 **자동로그인 후 지정 화면 이동** (No.1).
   *
   * 새 창으로 `/api/auth/seko/autologin?target=…` 에 진입하면, 라우트가 커넥터에
   * `redirectPath` 를 실어 보내고 AS-IS 가 **목적 화면으로 직접** 착지시킨다
   * (Redmine #1750 note-80, 2026-09-24 사양 확정). 종전에는 착지 화면을 지정할 수 없어
   * TOP 착지 후 창을 다시 이동시켰는데, 그 우회는 제거했다 — 두 버튼 모두 preview 에서
   * 직접 착지를 확인했다(2026-09-27, `qp_interface_log` 84041~84049).
   *
   * 폴백이 없으므로 **AS-IS 가 착지 지정을 지원하지 않는 환경에서는 조용히 TOP 에 떨어진다.**
   * 운영 AS-IS 반영 확인이 배포 전제인 이유다(`sekoAutoLogin` JSDoc 참조).
   *
   * **실패는 결과 페이지가 알린다.** 라우트가 창을 동일 오리진 결과 페이지로 보내고
   * 그 페이지가 `postMessage` 로 사유를 넘긴다. 성공에는 신호가 없다 — 그때 창은 이미
   * AS-IS(다른 오리진)로 넘어가 있다.
   *
   * 그래서 **오리진 이탈 폴링은 남겨 둔다.** 재이동이 아니라 「성공했다」는 유일한 관측
   * 수단이기 때문이다. 이것으로 `AUTOLOGIN_DEADLINE_MS` 상한을 해제하지 않으면, 성공한
   * 창을 상한이 닫고 실패로 안내하게 된다. 다른 오리진 문서는 `location` 접근이
   * SecurityError 로 막히며, 그 차단이 곧 신호다.
   *
   * `fetch` 가 아니라 창 이동인 이유, `<a href>` 를 쓰지 않는 이유는 같다: 발급 URL 이
   * **1회·1분** 유효라 미리 받아두거나 프리페치되면 그대로 소진되어 사용자는
   * 「このリンクは無効か、有効期限が切れています」를 보게 된다.
   */
  const handleAutoLogin = (target: SekoRedirectPath) => {
    // 창이 뜨기까지 수백 ms — 그 사이 재클릭하면 자동로그인 URL 이 한 번 더 발급되어
    // 앞의 URL 이 버려진다.
    if (navigatingRef.current) return;
    navigatingRef.current = true;

    // `noopener` 를 주면 window.open 이 null 을 반환해 창 제어권이 사라진다 — 상한 만료 시
    // 창 정리와 실패 통지(결과 페이지가 `window.opener` 로 보낸다) 모두 핸들·opener 가
    // 있어야 한다. 여는 대상이 우리 라우트(→ AS-IS)라 신뢰 범위 안이다.
    const opened = window.open(`/api/auth/seko/autologin?target=${target}`, "_blank");
    if (!opened) {
      navigatingRef.current = false;
      openAlert({
        type: "alert",
        message: "ポップアップがブロックされました。ブラウザの設定をご確認ください。",
      });
      return;
    }

    // 창이 우리 오리진을 벗어났는가 = 발급된 자동로그인 URL 로 이동했는가.
    const hasLeftOurOrigin = () => {
      try {
        const href = opened.location.href;
        // 아직 문서가 커밋되지 않은 창은 `about:blank` 이거나 빈 문자열로 관측된다.
        // 빈 값을 걸러내지 않으면 `!"".startsWith(origin)` 이 true 라 커넥터 응답 전에
        // 이동으로 오판하고, 상한이 먼저 해제되어 무응답이 무음으로 끝난다.
        if (!href || href === "about:blank") return false;
        return !href.startsWith(window.location.origin);
      } catch {
        return true;
      }
    };

    // 이동도 실패 통지도 없이 상한을 넘긴 경우 — 커넥터 무응답, 게이트웨이 지연 등.
    // 무음으로 두면 사용자는 빈 창만 남고 아무 안내도 받지 못한다.
    const deadlineTimer = window.setTimeout(() => {
      autoLoginCleanupRef.current?.();
      if (!opened.closed) opened.close();
      openAlert({
        type: "alert",
        message: SEKO_AUTOLOGIN_FAILURE_MESSAGE.failed,
      });
    }, AUTOLOGIN_DEADLINE_MS);

    const pollTimer = window.setInterval(() => {
      // 사용자가 직접 닫았으면 더 볼 것이 없다 — 안내 없이 정리만 한다.
      if (opened.closed) {
        autoLoginCleanupRef.current?.();
        return;
      }
      if (!hasLeftOurOrigin()) return;
      // AS-IS 로 넘어갔다 = 성공. 상한을 해제하지 않으면 성공한 창을 상한이 닫는다.
      autoLoginCleanupRef.current?.();
    }, AUTOLOGIN_POLL_MS);

    const handleMessage = (event: MessageEvent) => {
      // 오리진과 발신 창을 함께 본다 — 오리진만 보면 같은 사이트의 다른 탭·iframe 이 보낸
      // 메시지로도 이동을 취소시킬 수 있다.
      if (event.origin !== window.location.origin) return;
      if (event.source !== opened) return;
      const failure = parseSekoAutoLoginFailure(event.data);
      if (!failure) return;

      autoLoginCleanupRef.current?.();
      if (!opened.closed) opened.close();

      // 서버가 인증 쿠키를 이미 지운 상태 — 부모 탭도 로그인 화면으로 보내지 않으면
      // 로그인된 UI 를 띄운 채 이후 모든 요청이 401 로 실패한다.
      // 확인·바깥클릭(취소) 어느 쪽으로 닫아도 이동해야 한다 — 한쪽만 걸면 빠져나갈 구멍이 남는다.
      const toLogin =
        failure.reason === SEKO_AUTOLOGIN_RELOGIN_REASON
          ? () => {
              window.location.href = "/login";
            }
          : undefined;
      openAlert({
        type: "alert",
        message: SEKO_AUTOLOGIN_FAILURE_MESSAGE[failure.reason],
        onConfirm: toLogin,
        onCancel: toLogin,
      });
    };

    window.addEventListener("message", handleMessage);
    autoLoginCleanupRef.current = () => {
      window.clearInterval(pollTimer);
      window.clearTimeout(deadlineTimer);
      window.removeEventListener("message", handleMessage);
      navigatingRef.current = false;
      autoLoginCleanupRef.current = null;
    };
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
              onClick={() => handleAutoLogin("seminar")}
            >
              WEB研修申請
            </Button>
            <Button
              variant="secondary"
              className="flex-1 lg:flex-none lg:w-[160px]"
              onClick={() => handleAutoLogin("mypage")}
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
