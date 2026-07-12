import type { ChallanType } from "./types";

/** Badge colors per challan type, shared by lists and ledgers. */
export const CHALLAN_BADGE: Record<ChallanType, string> = {
  issue: "bg-amber-100 text-amber-800",
  return: "bg-emerald-100 text-emerald-800",
  borrow: "bg-sky-100 text-sky-800",
  giveback: "bg-violet-100 text-violet-800",
};

/**
 * Stronger accents per challan type for gradient cards / stat tiles.
 * Semantic status hues (matching CHALLAN_BADGE), distinct from the
 * tenant-themeable primary chrome.
 */
export const CHALLAN_ACCENT: Record<
  ChallanType,
  { grad: string; text: string; ring: string }
> = {
  issue: {
    grad: "bg-linear-to-br from-amber-500 to-amber-700",
    text: "text-amber-700",
    ring: "ring-amber-200",
  },
  return: {
    grad: "bg-linear-to-br from-emerald-500 to-emerald-700",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
  },
  borrow: {
    grad: "bg-linear-to-br from-sky-500 to-sky-700",
    text: "text-sky-700",
    ring: "ring-sky-200",
  },
  giveback: {
    grad: "bg-linear-to-br from-violet-500 to-violet-700",
    text: "text-violet-700",
    ring: "ring-violet-200",
  },
};
