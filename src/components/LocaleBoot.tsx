"use client";

import { useEffect } from "react";
import { initLocale } from "@/lib/i18n";

/**
 * Applies the saved language once the app is running. The boot script in
 * layout.tsx only stamps `lang`; the visible text switches here, after
 * hydration, which is what keeps the hydrated markup matching the server's
 * English. Runs again on a back-forward-cache restore, where no script runs.
 */
export function LocaleBoot() {
  useEffect(() => {
    initLocale();
    const restore = () => initLocale();
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  return null;
}
