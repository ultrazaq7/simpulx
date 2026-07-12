"use client";
/**
 * Enterprise i18n — JSON locale files + React Context.
 *
 * Usage:
 *   1. Wrap your app with <I18nProvider>
 *   2. In any component: const { t, lang, setLang } = useI18n()
 *   3. t("nav.dashboard") → resolved from locales/{lang}.json
 *   4. Interpolation: t("greeting", { name: "Fachmi" })
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import { getAppLang } from "./api";

// ── Static imports of locale JSON ──
import en from "@/locales/en.json";
import id from "@/locales/id.json";

type Dict = Record<string, any>;
const locales: Record<string, Dict> = { en, id };

// ── Flatten nested JSON into dot-notation ──
function flatten(obj: Dict, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === "object" && obj[key] !== null) {
      Object.assign(result, flatten(obj[key], path));
    } else {
      result[path] = String(obj[key]);
    }
  }
  return result;
}

// Pre-flatten all locales at module load time for O(1) lookup
const flatLocales: Record<string, Record<string, string>> = {};
for (const lang of Object.keys(locales)) {
  flatLocales[lang] = flatten(locales[lang]);
}

// Reverse index: English display text -> key. Lets t() accept the English
// source string itself (gettext-style), which module-scope constant arrays
// (nav items, option lists, meta configs) use as their msgid.
const enTextToKey: Record<string, string> = {};
for (const [key, value] of Object.entries(flatLocales.en)) {
  if (!(value in enTextToKey)) enTextToKey[value] = key;
}

// ── Translation function ──
function translate(
  key: string,
  lang: string,
  vars?: Record<string, string | number>,
): string {
  const dict = flatLocales[lang] ?? flatLocales.en;
  let str = dict[key] ?? flatLocales.en[key];
  if (str === undefined) {
    const viaEnglish = enTextToKey[key];
    str = viaEnglish ? (dict[viaEnglish] ?? flatLocales.en[viaEnglish] ?? key) : key;
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
    }
  }
  return str;
}

// ── React Context ──
interface I18nCtx {
  lang: string;
  setLang: (lang: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nCtx>({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(() =>
    typeof window !== "undefined" ? getAppLang() : "en",
  );

  // Sync from localStorage on mount (in case it changed in another tab)
  useEffect(() => {
    const stored = getAppLang();
    if (stored !== lang) setLangState(stored);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLang = useCallback((next: string) => {
    localStorage.setItem("simpulx_lang", next);
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(key, lang, vars),
    [lang],
  );

  const ctx = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={ctx}>{children}</I18nContext.Provider>;
}

/** Hook — returns { t, lang, setLang } */
export function useI18n() {
  return useContext(I18nContext);
}

// Legacy compat — keep useT for any existing callers
export function useT() {
  const { t } = useI18n();
  return t;
}
