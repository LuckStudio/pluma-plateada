// Iconos de trazo, coherentes con la línea fina de la pluma.
const P: Record<string, string> = {
  home: 'M4 10.5L12 4l8 6.5V20h-5v-6H9v6H4z',
  book: 'M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10',
  pen: 'M12 21l-3-6 3-12 3 12zM12 13.2a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4',
  canvas: 'M5 3h14v18H5zM8 15l3-3 2 2 3-3',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 9a2 2 0 100-4 2 2 0 000 4M10 19a2 2 0 100-4 2 2 0 000 4',
  back: 'M15 5l-7 7 7 7',
  search: 'M11 17.5a6.5 6.5 0 100-13 6.5 6.5 0 000 13M20 20l-4.2-4.2',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  check: 'M5 12.5l4.5 4.5L19 7',
  close: 'M6 6l12 12M18 6L6 18',
  bars: 'M4 18V6M9 18V9M14 18v-6M19 18V4',
  rhyme: 'M5 7h8M5 12h5M5 17h8M16 9a3 3 0 110 6',
  swap: 'M7 7h10l-3-3M17 17H7l3 3',
  stanza: 'M4 6h16M4 10h16M4 16h16M4 20h10',
  indent: 'M10 6h10M10 12h10M10 18h10M4 9l3 3-3 3',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  share: 'M12 15V4M8 8l4-4 4 4M6 12v7h12v-7',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
  drag: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  history: 'M4 12a8 8 0 108-8 8 8 0 00-6 2.7M4 4v3.5h3.5M12 8v4l3 2',
  shield: 'M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6zM8.5 12l2.5 2.5 4.5-5',
  play: 'M8 5v14l11-7z',
  stop: 'M7 7h10v10H7z',
  video: 'M4 6h11v12H4zM15 10l5-3v10l-5-3',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1 1 0 100-2 1 1 0 000 2',
  doc: 'M6 3h9l4 4v14H6zM9 12h7M9 16h5',
  align: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  moon: 'M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  copy: 'M8 8h11v13H8zM5 16V3h11',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12M12 15a3 3 0 100-6 3 3 0 000 6',
  install: 'M7 3h10v18H7zM12 7v7M9 11l3 3 3-3',
  filter: 'M4 6h16M7 12h10M10 18h4',
  group: 'M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z',
  sort: 'M7 4v16M4 17l3 3 3-3M14 6h6M14 11h4M14 16h2',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  chevLeft: 'M15 5l-7 7 7 7',
  chevRight: 'M9 5l7 7-7 7',
  zoom: 'M11 17.5a6.5 6.5 0 100-13 6.5 6.5 0 000 13M20 20l-4.2-4.2M8 11h6M11 8v6',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, stroke = 1.7, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  const fill = name === 'play' || name === 'stop' ? 'currentColor' : 'none';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={name === 'more' || name === 'drag' ? 3 : stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={P[name]} />
    </svg>
  );
}
