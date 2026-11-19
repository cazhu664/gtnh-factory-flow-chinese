import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  getLocale,
  subscribeLocale,
  translate,
  type Locale,
  type TranslateParams,
} from "./core";

export { LOCALE_STORAGE_KEY } from "@/lib/i18n-boot";
export * from "./core";
export * from "./dataset-names";

/**
 * The language's React hooks. Everything else lives in `./core`, which has no
 * hook import so server-side modules may call `t` without pulling React into
 * the server graph. Client components may import either module; the hooks are
 * here, and `useLocale`/`useT` subscribes so a `React.memo` component still
 * re-renders when the language changes.
 */

/** The current language, reactive. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, () => DEFAULT_LOCALE);
}

/** A `t` bound to the current language, reactive. */
export function useT(): (key: string, params?: TranslateParams) => string {
  const locale = useLocale();
  return useCallback((key: string, params?: TranslateParams) => translate(locale, key, params), [locale]);
}
