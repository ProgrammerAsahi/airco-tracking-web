import { useState, useRef, useEffect, useId } from "react";
import type { Lang } from "./i18n";

const LANGUAGES: { code: Lang; flag: string; label: string }[] = [
  { code: "zh", flag: "🇨🇳", label: "中文" },
  { code: "nl", flag: "🇳🇱", label: "Nederlands" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
];

const SWITCHER_LABEL: Record<Lang, string> = {
  zh: "选择语言",
  nl: "Taal kiezen",
  en: "Choose language",
  fr: "Choisir la langue",
};

export function LanguageSwitcher({ lang, setLang }: { lang: Lang; setLang: (lang: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const focusIndexRef = useRef<number | null>(null);
  const menuId = useId();
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    const onClick = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("pointerdown", onClick);
    return () => document.removeEventListener("pointerdown", onClick);
  }, [open]);

  useEffect(() => {
    if (!open || focusIndexRef.current === null) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    items?.item(focusIndexRef.current)?.focus();
    focusIndexRef.current = null;
  }, [open]);

  const closeAndRestoreFocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const openFromKeyboard = (index: number) => {
    focusIndexRef.current = index;
    setOpen(true);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const currentIndex = Math.max(0, LANGUAGES.findIndex((language) => language.code === lang));
      openFromKeyboard(event.key === "ArrowDown" ? currentIndex : LANGUAGES.length - 1);
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (event.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    if (event.key === "ArrowUp") nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
    if (nextIndex !== null && items[nextIndex]) {
      event.preventDefault();
      items[nextIndex].focus();
    }
  };

  return (
    <div className="lang-switcher" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="lang-switcher-button"
        onClick={() => setOpen(!open)}
        aria-label={SWITCHER_LABEL[lang]}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="lang-flag">{current.flag}</span>
        <span className="lang-chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul id={menuId} ref={menuRef} className="lang-dropdown" role="menu" aria-label={SWITCHER_LABEL[lang]} onKeyDown={handleMenuKeyDown}>
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                className={`lang-option${l.code === lang ? " lang-option--active" : ""}`}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                role="menuitemradio"
                aria-checked={l.code === lang}
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
