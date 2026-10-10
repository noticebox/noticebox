/** An ISO timestamp as "2026-10-10 12:34:56 UTC". */
export const when = (iso: string): string => iso.replace("T", " ").replace(/\.\d+Z$/, " UTC");
