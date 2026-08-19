import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const Base = ({ size = 18, children, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" {...rest}>
    {children}
  </svg>
);

export const ICross = (p: P) => (
  <Base {...p}><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></Base>
);
export const IRegister = (p: P) => (
  <Base {...p}><rect x="3" y="10" width="18" height="10" rx="1.5" /><path d="M6 10V6.5A1.5 1.5 0 0 1 7.5 5h9A1.5 1.5 0 0 1 18 6.5V10" /><path d="M7 14h4M7 17h7" /><path d="M16.5 14v.01M16.5 17v.01" /></Base>
);
export const IDash = (p: P) => (
  <Base {...p}><rect x="3" y="3" width="8" height="5.5" rx="1" /><rect x="3" y="12" width="8" height="9" rx="1" /><rect x="13" y="3" width="8" height="9" rx="1" /><rect x="13" y="15.5" width="8" height="5.5" rx="1" /></Base>
);
export const IBox = (p: P) => (
  <Base {...p}><path d="M12 3 3.5 7.2v9.6L12 21l8.5-4.2V7.2z" /><path d="M3.5 7.2 12 11.4l8.5-4.2M12 11.4V21" /></Base>
);
export const IRx = (p: P) => (
  <Base {...p}><path d="M6 3h9.5A2.5 2.5 0 0 1 18 5.5V21H8a2 2 0 0 1-2-2z" /><path d="M9.5 8h3a1.75 1.75 0 0 1 0 3.5h-3V8v6.5M12.5 11.5 15 15" /><path d="M15 3v2.5" /></Base>
);
export const IHistory = (p: P) => (
  <Base {...p}><path d="M3.5 8A9 9 0 1 1 3 12" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></Base>
);
export const ISearch = (p: P) => (
  <Base {...p}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.4-4.4" /></Base>
);
export const IScan = (p: P) => (
  <Base {...p}><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 8v8M10.5 8v8M14 8v8M17 8v8" /></Base>
);
export const IPlus = (p: P) => (<Base {...p}><path d="M12 5v14M5 12h14" /></Base>);
export const IMinus = (p: P) => (<Base {...p}><path d="M5 12h14" /></Base>);
export const ITrash = (p: P) => (
  <Base {...p}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6.5 7 7.5 20h9L17.5 7" /><path d="M10 11v5M14 11v5" /></Base>
);
export const IX = (p: P) => (<Base {...p}><path d="m6 6 12 12M18 6 6 18" /></Base>);
export const IAlert = (p: P) => (
  <Base {...p}><path d="M12 3.5 22 20H2z" /><path d="M12 10v4M12 17v.01" /></Base>
);
export const IInfo = (p: P) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.01" /></Base>
);
export const IBell = (p: P) => (
  <Base {...p}><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" /><path d="M10 19a2.2 2.2 0 0 0 4 0" /></Base>
);
export const IPrint = (p: P) => (
  <Base {...p}><path d="M7 8V3h10v5" /><rect x="3" y="8" width="18" height="9" rx="1.5" /><path d="M7 14h10v7H7z" /></Base>
);
export const IPause = (p: P) => (
  <Base {...p}><path d="M9 5v14M15 5v14" /></Base>
);
export const IRecall = (p: P) => (
  <Base {...p}><path d="M4 9a8 8 0 1 1-1 5" /><path d="M4 4v5h5" /></Base>
);
export const ICheck = (p: P) => (<Base {...p}><path d="m4.5 12.5 5 5L19.5 7" /></Base>);
export const IChevD = (p: P) => (<Base {...p}><path d="m6 9 6 6 6-6" /></Base>);
export const ICash = (p: P) => (
  <Base {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 12v.01M18 12v.01" /></Base>
);
export const ICard = (p: P) => (
  <Base {...p}><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6.5 15h4" /></Base>
);
export const IShield = (p: P) => (
  <Base {...p}><path d="M12 3 5 5.5v6C5 16 8 19.5 12 21c4-1.5 7-5 7-9.5v-6z" /><path d="m9 11.5 2.2 2.2L15.5 9.5" /></Base>
);
export const IPill = (p: P) => (
  <Base {...p}><rect x="3.2" y="8.6" width="17.6" height="6.8" rx="3.4" transform="rotate(-45 12 12)" /><path d="m8.5 8.5 7 7" /></Base>
);
export const IFlask = (p: P) => (
  <Base {...p}><path d="M10 3h4M10.5 3v6L5 19a1.6 1.6 0 0 0 1.4 2.4h11.2A1.6 1.6 0 0 0 19 19L13.5 9V3" /><path d="M7.5 15h9" /></Base>
);
export const IDownload = (p: P) => (
  <Base {...p}><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4 19h16" /></Base>
);
export const IEdit = (p: P) => (
  <Base {...p}><path d="M4 20h4.5L20 8.5a2.1 2.1 0 0 0-3-3L5.5 17z" /><path d="m14.5 7 3 3" /></Base>
);
export const ICart = (p: P) => (
  <Base {...p}><path d="M3 4h2.5l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h7.8a1.5 1.5 0 0 0 1.5-1.2L20 8H6.2" /><circle cx="9.5" cy="20" r="1.4" /><circle cx="16.5" cy="20" r="1.4" /></Base>
);
export const ISpark = (p: P) => (
  <Base {...p}><path d="M12 2.5 14 9.5l7 2.5-7 2.5-2 7-2-7-7-2.5 7-2.5z" /></Base>
);
export const ITrendUp = (p: P) => (
  <Base {...p}><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></Base>
);
export const ITrendDown = (p: P) => (
  <Base {...p}><path d="m3 7 6 6 4-4 8 8" /><path d="M15 17h6v-6" /></Base>
);
export const ISplit = (p: P) => (
  <Base {...p}><path d="M12 4v5m0 0c0 4.5-5.5 4.5-5.5 10M12 9c0 4.5 5.5 4.5 5.5 10" /></Base>
);
export const IClipboard = (p: P) => (
  <Base {...p}>
    <path d="M9 4.5H7.2c-.9 0-1.7.7-1.7 1.7v12.1c0 .9.8 1.7 1.7 1.7h9.6c.9 0 1.7-.8 1.7-1.7V6.2c0-1-.8-1.7-1.7-1.7H15" />
    <rect x="9" y="3" width="6" height="3.4" rx="1" />
    <path d="M9 11h6M9 14.5h6M9 18h3.5" strokeLinecap="round" />
  </Base>
);
export const IGear = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.82-2.83l.06-.06a1.7 1.7 0 0 0 .33-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.33-1.88l-.06-.06a2 2 0 1 1 2.82-2.82l.06.06a1.7 1.7 0 0 0 1.88.33h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.33l.06-.06a2 2 0 1 1 2.83 2.82l-.06.06a1.7 1.7 0 0 0-.34 1.88v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
  </Base>
);
export const ICopy = (p: P) => (
  <Base {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </Base>
);
export const ISwap = (p: P) => (
  <Base {...p}>
    <path d="M7 4 3.5 7.5 7 11" />
    <path d="M3.5 7.5H16" />
    <path d="m17 13 3.5 3.5L17 20" />
    <path d="M20.5 16.5H8" />
  </Base>
);
export const IWifi = (p: P) => (
  <Base {...p}>
    <path d="M3 8.5c5.5-4.5 12.5-4.5 18 0" />
    <path d="M6.5 12c3.5-2.8 7.5-2.8 11 0" />
    <path d="M9.8 15.4c1.4-1.1 3-1.1 4.4 0" />
    <circle cx="12" cy="18.5" r="1.1" fill="currentColor" stroke="none" />
  </Base>
);
export const IWifiOff = (p: P) => (
  <Base {...p}>
    <path d="M3 8.5c2.4-2 5.2-3.2 8-3.4" />
    <path d="M16.5 6.4c1.6.5 3.1 1.2 4.5 2.1" />
    <path d="M6.5 12c1.5-1.2 3.2-1.9 5-2.1" />
    <path d="M14.6 10.5c1 .4 1.9 1 2.9 1.5" />
    <path d="M9.8 15.4c1.4-1.1 3-1.1 4.4 0" />
    <circle cx="12" cy="18.5" r="1.1" fill="currentColor" stroke="none" />
    <path d="m4 3 16 18" />
  </Base>
);
export const IGrab = (p: P) => (
  <Base {...p}>
    <circle cx="9" cy="6" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.15" fill="currentColor" stroke="none" />
  </Base>
);
export const ITag = (p: P) => (
  <Base {...p}>
    <path d="M3.5 12.5v-8a1 1 0 0 1 1-1h8L20.5 11a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0z" />
    <circle cx="8" cy="8" r="1.4" />
  </Base>
);
export const ICalendar = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Base>
);
export const IRefresh = (p: P) => (
  <Base {...p}>
    <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L20 9.5M20 4.5v5h-5" />
    <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4 14.5M4 19.5v-5h5" />
  </Base>
);
export const IReport = (p: P) => (
  <Base {...p}>
    <path d="M4 4h12l4 4v12H4z" />
    <path d="M16 4v4h4M8 12h8M8 16h5" />
  </Base>
);
export const IUpload = (p: P) => (
  <Base {...p}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
  </Base>
);
export const ISend = (p: P) => (
  <Base {...p}>
    <path d="m20.5 3.5-9 17-2.6-7.4L1.5 10.5z" />
    <path d="M20.5 3.5 8.9 13.1" />
  </Base>
);
export const IUsers = (p: P) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
    <path d="M15.5 5.2a3.2 3.2 0 1 1 .9 6.3M17.2 13.6c1.9.5 3 1.9 3.3 4" />
  </Base>
);
export const IStar = (p: P) => (
  <Base {...p}>
    <path d="m12 3.5 2.4 5 5.6.7-4.1 3.8 1.1 5.5L12 15.8l-5 2.7 1.1-5.5L4 9.2l5.6-.7z" />
  </Base>
);
export const IBoard = (p: P) => (
  <Base {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 2.8h6v3H9zM8.5 10.5h7M8.5 14h7M8.5 17.5h4" />
  </Base>
);
export const IClock = (p: P) => (
  <Base {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Base>
);
export const IMenu = (p: P) => (
  <Base {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Base>
);
export const ICode = (p: P) => (
  <Base {...p}>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
    <path d="m13.5 4.5-3 15" />
  </Base>
);
