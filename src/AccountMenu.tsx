import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

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
    <div className="landing-account" ref={menuRef}>
      <button
        className="landing-avatar-button"
        type="button"
        aria-label={copy.accountMenu}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {userInitials(user.nickname, user.email)}
      </button>
      {menuOpen && (
        <div className="landing-account-menu" role="menu">
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
