/**
 * Types for the Jest matchers that `expo-router/testing-library` registers at runtime
 * (node_modules/expo-router/build/testing-library/expect.js) but ships no declaration
 * for. Used by src/__tests__/app-routes.test.tsx.
 */
export {};

declare global {
  namespace jest {
    interface Matchers<R> {
      toHavePathname(pathname: string): R;
      toHavePathnameWithParams(pathnameWithParams: string): R;
      toHaveSegments(segments: string[]): R;
      toHaveSearchParams(params: Record<string, string | string[]>): R;
      toHaveRouterState(state: unknown): R;
    }
  }
}
