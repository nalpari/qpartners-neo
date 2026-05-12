/**
 * Google Analytics 4 (gtag.js) 전역 타입 선언.
 *
 * `src/app/layout.tsx` 에서 `next/script` 로 gtag.js 를 로드하므로
 * 브라우저 전역 `window.gtag` 와 `window.dataLayer` 가 존재한다.
 * 클라이언트 컴포넌트에서 타입 안전하게 사용하기 위한 선언.
 *
 * Why narrow overloads only:
 *   catch-all `(command, ...args: unknown[])` 시그니처를 두면 위쪽 좁은
 *   overload 가 사실상 무력화되어 `gtag("event", 123, "wrong")` 같은
 *   잘못된 호출도 컴파일 단계에서 잡히지 않는다. 좁은 시그니처만 유지해
 *   타입 안전성을 확보한다.
 */
export {};

type GtagFn = {
  (command: "js", value: Date): void;
  (command: "config", measurementId: string, params?: Record<string, unknown>): void;
  (command: "event", eventName: string, params?: Record<string, unknown>): void;
  (command: "set", params: Record<string, unknown>): void;
  (command: "set", target: string, params: Record<string, unknown>): void;
  (command: "consent", action: string, params: Record<string, unknown>): void;
};

declare global {
  interface Window {
    gtag?: GtagFn;
    /**
     * 외부 스크립트가 직접 push 하지 못하도록 readonly 로 노출.
     * gtag() 내부 구현만 push 를 수행한다. 향후 third-party 추가 또는 stored XSS 시
     * `dataLayer.push()` 로 임의 이벤트 주입을 차단하기 위한 타입 가드.
     */
    dataLayer?: readonly unknown[];
  }
}
