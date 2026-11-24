import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'observatory' | 'chart' | 'ledger' | 'almanac' | 'focus' | 'reset' | 'settings'
  | 'plus' | 'check' | 'trash' | 'close' | 'sync' | 'download' | 'upload'
  | 'play' | 'pause' | 'stop' | 'chevron' | 'arrow' | 'star' | 'clock'
  | 'link' | 'edit' | 'qr' | 'calendar' | 'flame' | 'target' | 'book'
  | 'spark' | 'menu' | 'sun' | 'moon' | 'warning' | 'info'

const paths: Record<IconName, ReactNode> = {
  observatory: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5 13 13l-4.5 2.5L11 11z" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  chart: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M8 14h3v3H8z" fill="currentColor" stroke="none" /></>,
  ledger: <><path d="M8 4h11a2 2 0 0 1 2 2v14a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2Z" /><path d="M8 4V3M8 9h9M8 13h9M8 17h6" /></>,
  almanac: <><path d="m2 8 10-5 10 5-10 5z" /><path d="m6 10v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /><path d="M22 8v6" /></>,
  focus: <><circle cx="12" cy="13" r="8" /><path d="M12 13V9M12 13l3 2M9 2h6M12 2v3" /></>,
  reset: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3.2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1-2.8-2.8.1-.1A1.7 1.7 0 0 0 4.5 15a1.7 1.7 0 0 0-1.6-1H3v-4h.1A1.7 1.7 0 0 0 4.5 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.8-2.8.1.1A1.7 1.7 0 0 0 9 4.5a1.7 1.7 0 0 0 1-1.6V3h4v.1A1.7 1.7 0 0 0 15 4.5a1.7 1.7 0 0 0 1.9-.3l.1-.1 2.8 2.8-.1.1A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.6 1H21v4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m4 12 5 5L20 6" />,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  sync: <><path d="M20 7a8 8 0 0 0-14-2L4 7M4 7V3M4 7h4M4 17a8 8 0 0 0 14 2l2-2M20 17v4M20 17h-4" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></>,
  upload: <><path d="M12 21V9M7 14l5-5 5 5M4 4h16" /></>,
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  pause: <><rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  arrow: <path d="M4 12h16M14 6l6 6-6 6" />,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.1 0l2-2A5 5 0 0 0 12 3.9l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.2-1.2" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m14 6 4 4" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  flame: <path d="M12 22c4 0 7-2.8 7-6.5 0-2.4-1.3-4.4-3-6-.3 2-1.2 3-2.2 3.5C14 10 12 7.5 9.5 4 9 8 6.5 9.5 5.5 13c-.6 2.2-1 3.7-.5 5.2C5.6 20.2 8.4 22 12 22Z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 0-2 2z" /><path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 1 2 2z" /></>,
  spark: <path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />,
  warning: <><path d="M12 3 2 20h20z" /><path d="M12 9v5M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
}

export function Icon({ name, size = 18, ...rest }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  )
}
