import { useCallback, useEffect, useState } from "react";
import { parseTranslationData, type Lang, type TranslationMap } from "../shared/i18n";

export type { Lang } from "../shared/i18n";

const DEFAULT_LANG: Lang = "zh";
const STORAGE_KEY = "airco-lang";
const SUPPORTED_LANGS = new Set<Lang>(["zh", "nl", "en"]);

let translations: TranslationMap | undefined;

function getTranslations(): TranslationMap {
  if (translations) return translations;
  if (typeof document === "undefined") return {};
  const dataElement = document.getElementById("i18n-data");
  if (!dataElement) return {};
  translations = parseTranslationData(dataElement.textContent);
  return translations;
}

function detectLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  const queryLang = new URLSearchParams(window.location.search).get("lang");
  if (isLang(queryLang)) return queryLang;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isLang(stored)) return stored;
  const browser = navigator.language.slice(0, 2);
  if (browser === "nl") return "nl";
  if (browser === "en") return "en";
  return DEFAULT_LANG;
}

function isLang(value: string | null | undefined): value is Lang {
  return SUPPORTED_LANGS.has(value as Lang);
}

export function useTranslation() {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next === "zh" ? "zh-CN" : next;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  }, [lang]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const translations = getTranslations();
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
