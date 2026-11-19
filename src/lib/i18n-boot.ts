/**
 * The language's storage key and no-flash boot script. Split from
 * `i18n/index.ts`, which imports React hooks: Next refuses a hook-importing
 * module in the server layout, and the layout is where the boot script is
 * inlined. See `i18n/index.ts` for the model.
 */

/** Shared with the i18n store, which reads and writes the same entry. */
export const LOCALE_STORAGE_KEY = "gtnh-app-locale";

/**
 * The inline script layout.tsx runs before first paint: stamps `lang` so the
 * document's language is right even though the visible text switches after
 * hydration.
 */
export function localeBootScript(): string {
  return `try{var l=localStorage.getItem(${JSON.stringify(
    LOCALE_STORAGE_KEY,
  )});if(l==="zh")document.documentElement.lang="zh-CN"}catch(e){}`;
}
