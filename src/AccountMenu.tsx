import { useEffect, useId, useRef, useState } from "react";
import { logout, userInitials, type UserProfile } from "./authClient";
import type { Lang } from "./i18n";

type AccountMenuCopy = {
  accountMenu: string;
  signedInAs: string;
  profile: string;
  logout: string;
};

const ACCOUNT_MENU_COPY: Record<Lang, AccountMenuCopy> = {
  zh: {
    accountMenu: "打开账号菜单",
    signedInAs: "已登录：{email}",
    profile: "个人资料",
    logout: "登出",
  },
  nl: {
    accountMenu: "Open accountmenu",
    signedInAs: "Ingelogd als {email}",
    profile: "Profiel",
    logout: "Uitloggen",
  },
  en: {
    accountMenu: "Open account menu",
    signedInAs: "Signed in as {email}",
    profile: "Profile",
    logout: "Log out",
  },
  fr: {
    accountMenu: "Ouvrir le menu du compte",
    signedInAs: "Connecté en tant que {email}",
    profile: "Profil",
    logout: "Se déconnecter",
  },
};

type AccountMenuProps = {
  user: UserProfile;
  lang: Lang;
  onLogout?: () => void;
};

export function AccountMenu({ user, lang, onLogout }: AccountMenuProps) {
  const copy = ACCOUNT_MENU_COPY[lang];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const focusOnOpenRef = useRef<"first" | "last" | null>(null);
  const menuId = useId();

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || !focusOnOpenRef.current) return;
    const items = menuPanelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!items?.length) return;
    const target = focusOnOpenRef.current === "last" ? items.item(items.length - 1) : items.item(0);
    focusOnOpenRef.current = null;
    target.focus();
  }, [menuOpen]);

  const closeAndRestoreFocus = () => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target === triggerRef.current && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      focusOnOpenRef.current = event.key === "ArrowDown" ? "first" : "last";
      setMenuOpen(true);
      return;
    }
    if (!menuOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }
    if (event.key === "Tab") {
      setMenuOpen(false);
      return;
    }

    const items = Array.from(menuPanelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
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

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout().catch(() => undefined);
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = `/?lang=${lang}`;
    }
  };

  return (
    <div className="landing-account" ref={menuRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        className="landing-avatar-button"
        type="button"
        aria-label={copy.accountMenu}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {userInitials(user.nickname, user.email)}
      </button>
      {menuOpen && (
        <div id={menuId} ref={menuPanelRef} className="landing-account-menu" role="menu" aria-label={copy.accountMenu}>
          <p>{copy.signedInAs.replace("{email}", user.email)}</p>
          <a role="menuitem" href={`/profile?lang=${lang}`}>{copy.profile}</a>
          <button role="menuitem" className="landing-account-logout" type="button" onClick={handleLogout}>
            {copy.logout}
          </button>
        </div>
      )}
    </div>
  );
}
