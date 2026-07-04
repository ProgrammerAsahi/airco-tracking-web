import { useState, useRef, useEffect } from "react";
import type { Lang } from "./i18n";

const LANGUAGES: { code: Lang; flag: string; label: string }[] = [
  { code: "zh", flag: "🇨🇳", label: "中文" },
  { code: "nl", flag: "🇳🇱", label: "Nederlands" },
  { code: "en", flag: "🇬🇧", label: "English" },
];

export function LanguageSwitcher({ lang, setLang }: { lang: Lang; setLang: (lang: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="lang-switcher" ref={ref}>
      <button
        className="lang-switcher-button"
        onClick={() => setOpen(!open)}
        aria-label="Language"
        aria-expanded={open}
      >
        <span className="lang-flag">{current.flag}</span>
        <span className="lang-chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="lang-dropdown" role="menu">
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button
                className={`lang-option${l.code === lang ? " lang-option--active" : ""}`}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                role="menuitem"
              >
                <span className="lang-flag">{l.flag}</span>
                <span>{l.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
