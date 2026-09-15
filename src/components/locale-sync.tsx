"use client";

import { useEffect } from "react";

/**
 * Guarantees that <html lang dir> always matches the active locale,
 * even when Next.js reuses the <html> element during client-side
 * navigation between locales instead of re-rendering the root layout.
 */
export function LocaleSync({ locale }: { locale: string }) {
  useEffect(() => {
    const dir = locale === "ar" ? "rtl" : "ltr";
    if (document.documentElement.dir !== dir) {
      document.documentElement.dir = dir;
    }
    if (document.documentElement.lang !== locale) {
      document.documentElement.lang = locale;
    }
  }, [locale]);
  return null;
}
