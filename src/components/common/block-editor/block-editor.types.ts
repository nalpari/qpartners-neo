export interface BlockEditorProps {
  /** 초기 HTML 값. 마운트 시점에만 사용되며 이후는 BlockNote 내부 상태가 source of truth. */
  value: string;
  /** 본문이 변경될 때마다 호출. 인자는 BlockNote가 출력한 풀 HTML 문자열. */
  onChange: (html: string) => void;
  /** 비어 있을 때 표시할 안내 문구 (BlockNote는 첫 paragraph에 표시). */
  placeholder?: string;
  /** false면 readonly. */
  editable?: boolean;
  /** 외곽 컨테이너에 부여할 aria-label. */
  ariaLabel?: string;
}
