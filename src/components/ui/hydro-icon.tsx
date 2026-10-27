import type { ReactNode, SVGProps } from "react";

/**
 * HydroSite's technical icon family. Every glyph is drawn on a 24 px grid,
 * with a 2 px optical safe area, one stroke weight, and a restrained tonal fill.
 * Icons inherit semantic colors from their container, never a fixed palette.
 */
const glyphs = {
  brand: (
    <>
      <path className="hydro-icon__wash" d="M12 2.5C9.4 5.7 4.5 10.2 4.5 14.1a7.5 7.5 0 0 0 15 0C19.5 10.2 14.6 5.7 12 2.5Z" />
      <path d="M12 2.5C9.4 5.7 4.5 10.2 4.5 14.1a7.5 7.5 0 0 0 15 0C19.5 10.2 14.6 5.7 12 2.5Z" />
      <path d="M5 14.1c2.4-2.1 4.5-2.1 7 .2s4.6 2.3 7 .2" />
      <path className="hydro-icon__accent" d="M7.3 18c1.6-.7 3-.3 4.7.8" />
    </>
  ),
  overview: (
    <>
      <rect className="hydro-icon__wash" x="3" y="3" width="7" height="10" rx="1.8" />
      <rect className="hydro-icon__wash" x="14" y="11" width="7" height="10" rx="1.8" />
      <rect x="3" y="3" width="7" height="10" rx="1.8" />
      <rect x="3" y="17" width="7" height="4" rx="1.5" />
      <rect x="14" y="3" width="7" height="4" rx="1.5" />
      <rect className="hydro-icon__accent" x="14" y="11" width="7" height="10" rx="1.8" />
    </>
  ),
  sites: (
    <>
      <path className="hydro-icon__wash" d="m9 8-6 2v11l6-2 6 2v-8L9 8Z" />
      <path d="m9 6-6 2v13l6-2 6 2 6-2v-6M9 6v13m6-4v6" />
      <path className="hydro-icon__accent" d="M21 6.5c0 3.1-4.5 6.5-4.5 6.5S12 9.6 12 6.5a4.5 4.5 0 0 1 9 0Z" />
      <circle className="hydro-icon__accent" cx="16.5" cy="6.5" r="1.25" />
    </>
  ),
  analysis: (
    <>
      <rect className="hydro-icon__wash" x="3" y="3" width="6" height="6" rx="1.7" />
      <path className="hydro-icon__wash" d="m15.5 13 5.5 3.5-5.5 3.5Z" />
      <path d="M9 6h6M6 9v6.5a2 2 0 0 0 2 2h4" />
      <rect x="3" y="3" width="6" height="6" rx="1.7" />
      <rect x="15" y="3" width="6" height="6" rx="1.7" />
      <path className="hydro-icon__accent" d="m15.5 13 5.5 3.5-5.5 3.5Z" />
    </>
  ),
  settings: (
    <>
      <path className="hydro-icon__wash" d="m10 3-.5 2-2 .9-1.9-.7-2 3.5 1.5 1.4v2.3L3.6 14l2 3.5 2-.6 1.9 1.1.5 3h4l.5-3 1.9-1.1 2 .6 2-3.5-1.5-1.6v-2.3l1.5-1.4-2-3.5-1.9.7-2-.9-.5-2Z" />
      <path d="m9.6 4 .4-1h4l.6 2.3 2 1.2 2.3-.6 2 3.4-1.7 1.8v2.2l1.7 1.8-2 3.4-2.3-.6-2 1.2-.6 2.3h-4l-.6-2.3-2-1.2-2.3.6-2-3.4 1.7-1.8v-2.2L3.1 9.3l2-3.4 2.3.6 2-1.2Z" />
      <circle className="hydro-icon__accent" cx="12" cy="12" r="3" />
    </>
  ),
  turbine: (
    <>
      <circle className="hydro-icon__wash" cx="12" cy="10.5" r="7.5" />
      <circle cx="12" cy="10.5" r="7.5" />
      <g className="hydro-icon__accent">
        <circle cx="12" cy="10.5" r="1.5" />
        <path d="M12 9V5.5c2.6 0 4.1 1.4 4.1 3.1L13.3 10M13.3 11.2l3 1.8c-1.3 2.2-3.3 2.8-4.8 2l.5-3M10.7 11.2l-3 1.8c-1.3-2.2-.8-4.3.7-5l2.3 1.8" />
      </g>
      <path d="M3 21c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0" />
    </>
  ),
  feasibility: (
    <>
      <path className="hydro-icon__wash" d="M4.2 18a9 9 0 1 1 15.6 0Z" />
      <path d="M4.2 18a9 9 0 1 1 15.6 0M5 20h14M12 4.5V6M5.5 8.5l1.3.8M18.5 8.5l-1.3.8M4 14h1.5M18.5 14H20" />
      <circle cx="12" cy="14" r="1.5" />
      <path className="hydro-icon__accent" d="m13 12.8 3.2-4.3" />
    </>
  ),
  environment: (
    <>
      <path className="hydro-icon__wash" d="m12 3 8 3v6c0 4.8-4.5 8.2-8 9-3.5-.8-8-4.2-8-9V6Z" />
      <path d="m12 3 8 3v6c0 4.8-4.5 8.2-8 9-3.5-.8-8-4.2-8-9V6Z" />
      <g className="hydro-icon__accent">
        <path d="M9 14c-1-4 2-6 6.5-6.5C16 12 14 15 10 14.5M8.5 16l4-5" />
      </g>
    </>
  ),
  terrain: (
    <>
      <path className="hydro-icon__wash" d="m3 18 7-13 5 9 3-5 3 9Z" />
      <path d="m3 18 7-13 7 13H3ZM14.2 12.8 17 8l4 10h-4M7.3 10l2.7 2 2.7-2M3 21h18" />
      <path className="hydro-icon__accent" d="m8 16 2-3 2 3" />
    </>
  ),
  water: (
    <>
      <path className="hydro-icon__wash" d="M12 2.5S7.5 7.4 7.5 10a4.5 4.5 0 0 0 9 0c0-2.6-4.5-7.5-4.5-7.5Z" />
      <path d="M12 2.5S7.5 7.4 7.5 10a4.5 4.5 0 0 0 9 0c0-2.6-4.5-7.5-4.5-7.5Z" />
      <path className="hydro-icon__accent" d="M3 17.5c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0M3 21c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0" />
    </>
  ),
  river: (
    <>
      <path d="M5 6.5c0 4 7 3 7 8M19 6.5c0 4-7 3-7 8" />
      <path className="hydro-icon__accent" d="M12 3v16" />
      <circle className="hydro-icon__wash" cx="12" cy="13" r="3" />
      <circle cx="5" cy="4.5" r="2" />
      <circle cx="19" cy="4.5" r="2" />
      <circle cx="12" cy="13" r="2.5" />
      <circle className="hydro-icon__accent" cx="12" cy="20" r="1.5" />
    </>
  ),
  sources: (
    <>
      <ellipse className="hydro-icon__wash" cx="12" cy="5.5" rx="8" ry="3" />
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      <path className="hydro-icon__accent" d="M7 10.5h.01M7 16.5h.01" strokeWidth="2.8" />
    </>
  ),
  climate: (
    <>
      <circle className="hydro-icon__wash" cx="8" cy="8" r="3" />
      <path d="M8 2v1M2 8h1M3.8 3.8l.7.7M12.2 3.8l-.7.7M8 12a4 4 0 1 1 4-5" />
      <path className="hydro-icon__wash" d="M7.5 17a3.5 3.5 0 1 1 0-7h.6a5 5 0 0 1 9.7 1.8h.7a2.6 2.6 0 0 1 0 5.2Z" />
      <path d="M7.5 17a3.5 3.5 0 1 1 0-7h.6a5 5 0 0 1 9.7 1.8h.7a2.6 2.6 0 0 1 0 5.2Z" />
      <path className="hydro-icon__accent" d="m9 20-.5 1m5-1-.5 1m5-1-.5 1" />
    </>
  ),
  leaf: (
    <>
      <path className="hydro-icon__wash" d="M5 16C2.5 8 10 3 20.5 3c.5 11-4.5 18-12.5 15Z" />
      <path d="M5 16C2.5 8 10 3 20.5 3c.5 11-4.5 18-12.5 15Z" />
      <path className="hydro-icon__accent" d="M3 21 16 8M8 16v-5m4 1h5" />
    </>
  ),
  transmission: (
    <>
      <path className="hydro-icon__wash" d="m12 3-5 18h10Z" />
      <path d="M12 3 7 21m5-18 5 18M5 9h14M3 15h18M5 9v3m14-3v3M3 15v3m18-3v3" />
      <path className="hydro-icon__accent" d="m10.5 8 5 7m-2-7-5 7m0 0 7 6m0-6-7 6" />
    </>
  ),
  layers: (
    <>
      <path className="hydro-icon__wash" d="m12 3 9 4.5-9 4.5-9-4.5Z" />
      <path d="m12 3 9 4.5-9 4.5-9-4.5Z" />
      <path className="hydro-icon__accent" d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </>
  ),
  report: (
    <>
      <path className="hydro-icon__wash" d="M5 3h9l5 5v13H5Z" />
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Zm0 0v5h5" />
      <path className="hydro-icon__accent" d="M8 14v3m4-6v6m4-4v4" />
    </>
  ),
  shortlist: (
    <>
      <path className="hydro-icon__wash" d="M6 3h12v18l-6-4-6 4Z" />
      <path d="M6 3h12v18l-6-4-6 4Z" />
      <path className="hydro-icon__accent" d="m9 9 2 2 4-4" />
    </>
  ),
  confidence: (
    <>
      <circle className="hydro-icon__wash" cx="12" cy="12" r="6" />
      <path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3" />
      <circle cx="12" cy="12" r="5.5" />
      <path className="hydro-icon__accent" d="m9.5 12 1.7 1.7 3.3-3.4" />
    </>
  ),
  keyboard: (
    <>
      <rect className="hydro-icon__wash" x="2.5" y="5" width="19" height="14" rx="3" />
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12.5h.01M10 12.5h.01M14 12.5h.01M18 12.5h.01" strokeWidth="2" />
      <path className="hydro-icon__accent" d="M8 16h8" />
    </>
  ),
  notifications: (
    <>
      <path className="hydro-icon__wash" d="M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3Z" />
      <path d="M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3Zm6-8v2" />
      <path className="hydro-icon__accent" d="M9.5 20a3.5 3.5 0 0 0 5 0" />
    </>
  ),
  locate: (
    <>
      <circle className="hydro-icon__wash" cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
      <circle className="hydro-icon__accent" cx="12" cy="12" r="2.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M3 6h4m5 0h9M3 12h10m5 0h3M3 18h2m5 0h11" />
      <rect className="hydro-icon__wash" x="7" y="3.5" width="5" height="5" rx="1.5" />
      <rect className="hydro-icon__wash" x="5" y="15.5" width="5" height="5" rx="1.5" />
      <rect x="7" y="3.5" width="5" height="5" rx="1.5" />
      <rect className="hydro-icon__accent" x="13" y="9.5" width="5" height="5" rx="1.5" />
      <rect x="5" y="15.5" width="5" height="5" rx="1.5" />
    </>
  ),
  simulation: (
    <>
      <rect className="hydro-icon__wash" x="5" y="5" width="14" height="14" rx="3" />
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3" />
      <path className="hydro-icon__accent" d="m10 9 5 3-5 3Z" />
    </>
  ),
  appearance: (
    <>
      <path className="hydro-icon__wash" d="M12 3a9 9 0 0 1 0 18Z" />
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path className="hydro-icon__accent" d="m15 7 2-1m-2 5 5-3m-5 7 5-3m-5 7 3-2" />
    </>
  ),
  shield: (
    <>
      <path className="hydro-icon__wash" d="m12 3 8 3v6c0 4.8-4.5 8.2-8 9-3.5-.8-8-4.2-8-9V6Z" />
      <path d="m12 3 8 3v6c0 4.8-4.5 8.2-8 9-3.5-.8-8-4.2-8-9V6Z" />
      <path className="hydro-icon__accent" d="m8 12 2.5 2.5 5.5-5" />
    </>
  ),
  planner: (
    <>
      <path className="hydro-icon__wash" d="M7 3h10v17H4V6a3 3 0 0 1 3-3Z" />
      <path d="M14 3H7a3 3 0 0 0-3 3v14h12M8 7h4M8 11h2" />
      <path className="hydro-icon__accent" d="m12 17 1-4 6-6 3 3-6 6-4 1Zm5-8 3 3" />
    </>
  ),
  viewer: (
    <>
      <path className="hydro-icon__wash" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle className="hydro-icon__accent" cx="12" cy="12" r="3" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type HydroIconName = keyof typeof glyphs;
export const HYDRO_ICON_NAMES = Object.keys(glyphs) as HydroIconName[];

export interface HydroIconProps extends Omit<SVGProps<SVGSVGElement>, "children" | "width" | "height" | "role" | "aria-label" | "aria-hidden"> {
  name: HydroIconName;
  size?: number;
  /** Omit when adjacent text or the parent button already supplies the name. */
  label?: string;
}

export function HydroIcon({ name, size = 20, label, className = "", ...props }: HydroIconProps) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`hydro-icon ${className}`.trim()}
      data-icon={name}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {label ? <title>{label}</title> : null}
      {glyphs[name]}
    </svg>
  );
}

const sourceIcons = {
  Elevation: "terrain",
  Hydrology: "water",
  Climate: "climate",
  "Land cover": "leaf",
  Environment: "environment",
  Infrastructure: "transmission",
} as const satisfies Record<string, HydroIconName>;

export function sourceIconFor(category: string): HydroIconName {
  return Object.hasOwn(sourceIcons, category)
    ? sourceIcons[category as keyof typeof sourceIcons]
    : "sources";
}
