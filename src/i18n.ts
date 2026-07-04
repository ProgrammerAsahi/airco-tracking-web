import { useCallback, useEffect, useState } from "react";

export type Lang = "zh" | "nl" | "en";

const DEFAULT_LANG: Lang = "zh";
const STORAGE_KEY = "airco-lang";

type TranslationMap = Record<string, Record<Lang, string>>;

declare global {
  interface Window {
    __I18N__?: TranslationMap;
  }
}

const translations: TranslationMap = (typeof window !== "undefined" && window.__I18N__) || {};

function detectLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "zh" || stored === "nl" || stored === "en") return stored;
  const browser = navigator.language.slice(0, 2);
  if (browser === "nl") return "nl";
  if (browser === "en") return "en";
  return DEFAULT_LANG;
}

export function useTranslation() {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next === "zh" ? "zh-CN" : next;
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  }, [lang]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const bundle = translations[key];
      if (!bundle) return key;
      const template = bundle[lang] || bundle[DEFAULT_LANG] || key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (_, name: string) =>
        name in params ? String(params[name]) : `{${name}}`,
      );
    },
    [lang],
  );

  return { lang, setLang, t };
}
