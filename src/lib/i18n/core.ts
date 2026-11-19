import { LOCALE_STORAGE_KEY } from "@/lib/i18n-boot";
import { ZH_DICTIONARY } from "./zh";

/**
 * The planner's language, as a setting. This is the React-free half: server
 * modules (the solver, the dataset pipeline) call `t` and must not drag React
 * into the server graph, so the hooks live in `./index.ts`, which re-exports
 * everything here. Mirrors the ui-scale / ui-scale-boot split.
 *
 * English is the source language: the keys ARE the English strings, so an
 * untranslated key falls through to itself and English needs no dictionary.
 * The Chinese dictionary lives in `./zh`, split into one shard per area and
 * merged in `./zh/index.ts`.
 *
 * Two places must stay in step with `LOCALES`:
 * - `setLocale` persists the choice and stamps `lang` on <html>,
 * - the no-flash boot script in layout.tsx reads the same storage key before
 *   first paint (see `localeBootScript` in `@/lib/i18n-boot`).
 *
 * Reactivity: `useLocale`/`useT` (in `./index.ts`) subscribe through
 * `useSyncExternalStore`, so a component behind `React.memo` still re-renders
 * when the language changes. Non-React modules may call `t` during render
 * (menus built inside a render), but must not translate module-scope
 * constants: those would freeze the language at import time.
 */

export type Locale = "en" | "zh";

export interface LocaleOption {
  id: Locale;
  /** The language named in its own tongue. */
  label: string;
}

export const LOCALES: readonly LocaleOption[] = [
  { id: "en", label: "English" },
  { id: "zh", label: "中文" },
];

/** English is the source language, so it is the default and the fallback. */
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh";
}

/** The `lang` attribute an <html> wears for a locale. */
export function htmlLangOf(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

// The live locale. Starts at the default so the first client render (and the
// server markup) is English; `initLocale` applies the saved choice after
// hydration, which is what lets React hydrate without a mismatch.
let currentLocale: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

function stampLang(locale: Locale): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", htmlLangOf(locale));
  }
}

/**
 * Applies a language and remembers it. The default (English) carries no
 * storage entry, so a fresh profile and a reset one are the same state.
 */
export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  stampLang(locale);
  try {
    if (locale === DEFAULT_LOCALE) {
      window.localStorage.removeItem(LOCALE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  } catch {
    // Storage refused (private mode, quota): the page still changes.
  }
  emit();
}

/**
 * Applies the saved language once the app is running. Called from a client
 * effect (LocaleBoot), never at module load, so the hydrated markup matches
 * the server's English.
 */
export function initLocale(): void {
  if (typeof window === "undefined") return;
  let stored: unknown;
  try {
    stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return;
  }
  if (isLocale(stored) && stored !== currentLocale) {
    currentLocale = stored;
    stampLang(stored);
    emit();
  }
}

export type TranslateParams = Record<string, string | number>;

function interpolate(text: string, params?: TranslateParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );
}

/** The pure translation: `key` is the English source, looked up per locale. */
export function translate(locale: Locale, key: string, params?: TranslateParams): string {
  const text =
    locale === "zh" && Object.prototype.hasOwnProperty.call(ZH_DICTIONARY, key) ? ZH_DICTIONARY[key] : key;
  return interpolate(text, params);
}

/** Translate with the live locale (non-reactive; see the file note). */
export function t(key: string, params?: TranslateParams): string {
  return translate(currentLocale, key, params);
}
