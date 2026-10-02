import { useId, useState } from "react";
import { bookHref } from "@/fmv/links";
import { useSite } from "./use-site";

type Status = "available" | "limited" | "unavailable";
interface Row { service_id: string; slug: string; status: Status; reason: string | null }

const CHIP: Record<Status, string> = { available: "fmv-chip fmv-chip--ok", limited: "fmv-chip fmv-chip--warn", unavailable: "fmv-chip fmv-chip--bad" };
const LABEL: Record<Status, string> = { available: "Available", limited: "Limited", unavailable: "Booked" };

/** Read-only lookup against the booking app's availability endpoint. Nothing is held or saved. */
export function CheckDate() {
  const { apiUrl, bookingUrl, catalog, prototype } = useSite();
  const id = useId();
  const [date, setDate] = useState("");
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("18:00");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  if (!apiUrl && !prototype) {
    return (
      <div className="fmv-panel fmv-panel--blush grid gap-3">
        <p className="fmv-h3">Check a date</p>
        <p className="fmv-body">Live availability opens with online booking. Until then, ask us about your date.</p>
      </div>
    );
  }

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    setState("loading");
    if (!apiUrl) {
      // Prototype preview: no calendar yet, so every service shows as free.
      const free = (catalog?.services ?? []).filter((s) => s.category_slug !== "minis" && s.price_cents !== null);
      setRows(free.map((s) => ({ service_id: s.id, slug: s.slug, status: "available" as const, reason: null })));
      setState("idle");
      return;
    }
    try {
      const q = new URLSearchParams({ date, start, end });
      const res = await fetch(`${apiUrl}/api/public/availability?${q}`);
      const body = (await res.json()) as { v: number; data?: { services: Row[] } };
      if (!res.ok || !body.data) throw new Error("bad response");
      setRows(body.data.services);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  const name = (slug: string) => catalog?.services.find((s) => s.slug === slug)?.name ?? slug.replace(/-/g, " ");

  return (
    <form className="fmv-panel fmv-panel--blush grid gap-4" onSubmit={check} aria-describedby={`${id}-note`}>
      <p className="fmv-h3">Check a date</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="fmv-field">Date<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="fmv-field">Start<input type="time" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="fmv-field">End<input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="fmv-cta-ticket" disabled={state === "loading"}>
          {state === "loading" ? "Checking…" : "See what's free"}
        </button>
        <p id={`${id}-note`} className="text-sm text-ink-soft">Just a look. Nothing is reserved until you accept a quote.</p>
      </div>
      <div aria-live="polite">
        {state === "error" ? <p className="text-sm">We couldn&apos;t check right now. Please try again, or build your event and we&apos;ll confirm.</p> : null}
        {rows ? (
          <ul className="grid gap-2">
            {rows.map((r) => (
              <li key={r.service_id} className="flex items-center justify-between gap-3 border-b border-line pb-2 text-sm">
                <span>{name(r.slug)}</span>
                <span className={CHIP[r.status]}>{LABEL[r.status]}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {rows && date ? (
          <p className="pt-3"><a className="fmv-link-underline" href={bookHref(bookingUrl, `/build?date=${date}`)}>Build your event for this date</a></p>
        ) : null}
      </div>
    </form>
  );
}
