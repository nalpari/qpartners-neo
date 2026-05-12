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
     * gtag.js 가 내부적으로 `push` 를 호출하므로 mutable 배열로 선언한다.
     * `readonly` 로 두면 런타임 보호 효과는 없으면서 TS 코드에서
     * `window.dataLayer.push(...)` 호출 시 컴파일 에러를 유발한다.
     * 외부 스크립트 / Stored XSS 의 dataLayer.push 주입은 타입이 아니라
     * CSP(`script-src 'strict-dynamic'` + nonce) 또는 GA Server-Side Tagging
     * 으로 차단해야 한다.
     */
    dataLayer?: unknown[];
  }
}
