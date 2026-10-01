// Formatting helpers (en-CA, CAD, America/Moncton). Safe on server and client.
import type { PriceMode, PublicSettings } from "./types";

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const cadWhole = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return cents % 100 === 0 ? cadWhole.format(cents / 100) : cad.format(cents / 100);
}

/** "$450", "$150 / hr", "$15 / item", "from $180". Empty when unpriced. */
export function priceLabel(cents: number | null, mode: PriceMode): string {
  if (cents === null) return "";
  const m = money(cents);
  if (mode === "per_hour") return `${m} / hr`;
  if (mode === "per_item") return `${m} / item`;
  if (mode === "from") return `from ${m}`;
  return m;
}

/** "+15065550123" -> "506-555-0123" */
export function phoneLabel(e164: string | null | undefined): string {
  if (!e164) return "";
  const digits = e164.replace(/\D/g, "");
  const n = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (n.length !== 10) return e164;
  return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
}

export function whatsappHref(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

export function provinceName(code: string): string {
  return code === "NB" ? "New Brunswick" : code;
}

export function placeLabel(s: PublicSettings | null): string {
  if (!s) return "Fredericton, New Brunswick";
  return `${s.city}, ${provinceName(s.province)}`;
}

export function dateTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Moncton",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function hoursLabel(h: number | null): string {
  if (!h) return "";
  return `${h % 1 === 0 ? h : h.toFixed(1)} hr${h === 1 ? "" : "s"}`;
}

/** Owner-authored markdown -> safe plain paragraphs (no HTML injection). */
export function mdParagraphs(md: string | null | undefined): string[] {
  if (!md) return [];
  return md
    .split(/\n{2,}/)
    .map((p) =>
      p
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/[*_`#>]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

export const EVENT_LABELS: Record<string, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  baby_shower: "Baby shower",
  corporate: "Corporate",
  graduation: "Graduation",
  other: "Celebration",
};
