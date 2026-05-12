/**
 * Google Analytics 4 (gtag.js) 전역 타입 선언.
 *
 * `src/app/layout.tsx` 에서 `next/script` 로 gtag.js 를 로드하므로
 * 브라우저 전역 `window.gtag` 와 `window.dataLayer` 가 존재한다.
 * 클라이언트 컴포넌트에서 타입 안전하게 사용하기 위한 선언.
 */
export {};

type GtagCommand = "config" | "event" | "set" | "consent" | "js";

type GtagFn = {
  (command: "js", value: Date): void;
  (command: "config", measurementId: string, params?: Record<string, unknown>): void;
  (command: "event", eventName: string, params?: Record<string, unknown>): void;
  (command: "set", params: Record<string, unknown>): void;
  (command: "set", target: string, params: Record<string, unknown>): void;
  (command: "consent", action: string, params: Record<string, unknown>): void;
  (command: GtagCommand, ...args: unknown[]): void;
};

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}
