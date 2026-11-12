// The inbox's icons: one library (lucide), mapped here once, so one thing keeps one icon everywhere (conventions:
// Icons). An icon only repeats a word next to it, or sits in a control that has an aria-label, so every icon is
// hidden from screen readers. The app's own mark is drawn for noticebox (the same as app/icon.svg), not taken from
// the library.
import { ArrowDown, ArrowUp, ChevronDown, Download, ExternalLink, Maximize2, Menu, Minimize2, Monitor, Moon, Sun, X, type LucideIcon } from "lucide-react";

const ICONS = {
  moveUp: ArrowUp,
  moveDown: ArrowDown,
  sortAscending: ArrowUp,
  sortDescending: ArrowDown,
  remove: X,
  close: X,
  menu: Menu,
  dropdown: ChevronDown,
  external: ExternalLink, // a link that opens another site in a new tab
  download: Download, // a file that came with a submission
  expand: Maximize2, // the open submission on a page of its own
  collapse: Minimize2, // back to the pane beside the table
  light: Sun,
  dark: Moon,
  system: Monitor, // the theme the system asks for
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** An icon about the cap height of the text around it; `className` changes size or colour. */
export function Icon({ name, className = "size-4 shrink-0" }: { name: IconName; className?: string }) {
  const C = ICONS[name];
  return <C aria-hidden="true" focusable="false" className={className} />;
}

/** noticebox's own mark: an open box. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" className={className}>
      <path d="M3 7.5 10 3l7 4.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M3 7.5h14M10 7.5V17" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
