export interface RichEditorProps {
  /**
   * 초기 HTML 값. 마운트 시점에만 사용되며 이후는 에디터 내부 상태가 source of truth.
   * 외부에서 폼을 reset하려면 부모에서 컴포넌트 트리를 리마운트(`key` prop 변경)해야 한다.
   */
  defaultValue: string;
  /** 본문이 변경될 때마다 호출. 인자는 에디터가 출력한 풀 HTML 문자열. */
  onChange: (html: string) => void;
  /**
   * 마운트 시점 초기 HTML을 에디터 노드로 파싱하다 실패한 경우 호출.
   * 호출되면 에디터는 빈 상태로 시작하므로, 호출자는 사용자에게 알려 원본 덮어쓰기로 인한 데이터 손실을 방지해야 한다.
   */
  onParseError?: (error: unknown) => void;
  /** 비어 있을 때 표시할 안내 문구. */
  placeholder?: string;
  /** false면 readonly. */
  editable?: boolean;
  /** 외곽 컨테이너에 부여할 aria-label. */
  ariaLabel?: string;
  /**
   * 본문 임베드 이미지 업로드 실패 시 호출.
   * 호출자에서 사용자 노출 alert(일본어)을 띄워 데이터 손실 가능성을 안내해야 한다.
   */
  onUploadError?: (error: unknown) => void;
  /**
   * YouTube 임베드 허용 여부 (기본 false).
   *
   * true 이면 Youtube extension 이 등록되어 URL 붙여넣기로 임베드가 생성되고,
   * HTML 소스 모드의 sanitize 도 iframe 을 통과시킨다.
   *
   * 대량메일 폼에서는 켜지 말 것 — 저장 시 서버 sanitize(allowYoutubeEmbed 미적용)가
   * iframe 을 제거하므로, 작성자가 넣은 동영상이 조용히 사라진다.
   */
  allowYoutubeEmbed?: boolean;
}
