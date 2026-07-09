import type { SVGProps } from "react";

type AircoLogoMarkProps = SVGProps<SVGSVGElement> & {
  title?: string;
};

export function AircoLogoMark({ title, ...props }: AircoLogoMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...props}
    >
      {title && <title>{title}</title>}
      <rect className="airco-logo-tile" x="4" y="4" width="56" height="56" rx="17" fill="#F8FDFF" />
      <path
        className="airco-logo-unit"
        d="M17.5 21.5h29c4.7 0 8.5 3.8 8.5 8.5v4c0 4.7-3.8 8.5-8.5 8.5h-29A8.5 8.5 0 0 1 9 34v-4c0-4.7 3.8-8.5 8.5-8.5Z"
        fill="#073B5A"
      />
      <path
        className="airco-logo-slot-outer"
        d="M18.5 27h27a5 5 0 0 1 0 10h-27a5 5 0 0 1 0-10Z"
        fill="#FFFFFF"
      />
      <path
        className="airco-logo-slot-inner"
        d="M20.5 30h23a2 2 0 0 1 0 4h-23a2 2 0 0 1 0-4Z"
        fill="#073B5A"
      />
      <path
        className="airco-logo-airflow"
        d="M24 45v3.1c0 3.7-2.9 6.6-6.6 6.6"
        stroke="#19BCEB"
        strokeWidth="3.8"
        strokeLinecap="round"
      />
      <path
        className="airco-logo-airflow"
        d="M32 45v10"
        stroke="#19BCEB"
        strokeWidth="3.8"
        strokeLinecap="round"
      />
      <path
        className="airco-logo-airflow"
        d="M40 45v3.1c0 3.7 2.9 6.6 6.6 6.6"
        stroke="#19BCEB"
        strokeWidth="3.8"
        strokeLinecap="round"
      />
      <circle className="airco-logo-badge" cx="49" cy="20" r="8.8" fill="#22C55E" />
      <path
        className="airco-logo-check"
        d="m44.9 20 2.7 2.8 5.5-6"
        stroke="#FFFFFF"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
