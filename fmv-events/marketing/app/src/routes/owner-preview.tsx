import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { money, phoneLabel } from "@/fmv/format";
import { protoStore, type ProtoInquiry, type ProtoRequest } from "@/fmv/proto-store";
import { useSite } from "@/components/fmv/use-site";

export const Route = createFileRoute("/owner-preview")({
  head: () => ({
    meta: [
      { title: "Owner inbox preview · FMV Events & Photography" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OwnerPreview,
});

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function eventDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(y, m - 1, d));
}

function OwnerPreview() {
  const { settings } = useSite();
  const owner = settings?.owner_name?.split(" ")[0] ?? "Marie";
  const [tab, setTab] = useState<"requests" | "questions">("requests");
  const [requests, setRequests] = useState<ProtoRequest[]>([]);
  const [questions, setQuestions] = useState<ProtoInquiry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRequests(protoStore.requests());
    setQuestions(protoStore.inquiries());
    setReady(true);
  }, []);

  return (
    <main>
      <section className="fmv-section">
        <div className="fmv-wrap grid gap-8">
          <div className="grid gap-3">
            <p className="fmv-eyebrow">Prototype · owner view</p>
            <h1 className="fmv-h2">{owner}&apos;s inbox</h1>
            <p className="fmv-lede">
              What arrives when a client builds an event or asks a question. In the real booking app this is the private admin
              (login with two-step verification), and you also get an email for each new request.
            </p>
            <p className="text-sm text-ink-soft">This preview only shows requests sent from this browser.</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="fmv-filter" role="tablist" aria-label="Inbox">
              <button type="button" role="tab" aria-selected={tab === "requests"} aria-pressed={tab === "requests"} onClick={() => setTab("requests")}>
                Booking requests ({requests.length})
              </button>
              <button type="button" role="tab" aria-selected={tab === "questions"} aria-pressed={tab === "questions"} onClick={() => setTab("questions")}>
                Questions ({questions.length})
              </button>
            </div>
            {requests.length || questions.length ? (
              <button type="button" className="fmv-link-underline text-sm" onClick={() => { protoStore.clear(); setRequests([]); setQuestions([]); }}>
                Clear preview
              </button>
            ) : null}
          </div>

          {!ready ? null : tab === "requests" ? (
            requests.length ? (
              <div className="grid gap-6">{requests.map((r) => <RequestCard key={r.ref} r={r} />)}</div>
            ) : (
              <Empty text="No booking requests yet." cta={<Link to="/book" className="fmv-cta-ghost">Try “Build your event”</Link>} />
            )
          ) : questions.length ? (
            <div className="grid gap-4">{questions.map((q) => <QuestionCard key={q.ref} q={q} />)}</div>
          ) : (
            <Empty text="No questions yet." cta={<Link to="/contact" hash="inquiry" className="fmv-cta-ghost">Try the question form</Link>} />
          )}
        </div>
      </section>
    </main>
  );
}

function Empty({ text, cta }: { text: string; cta: React.ReactNode }) {
  return (
    <div className="fmv-soon">
      <span aria-hidden="true" className="fmv-soon__mark" />
      <p className="fmv-h3">{text}</p>
      <div>{cta}</div>
    </div>
  );
}

function Contact({ name, email, phone, pref }: { name: string; email: string; phone: string; pref?: string }) {
  return (
    <div className="grid gap-1 text-sm">
      <p className="fmv-eyebrow">Customer</p>
      <p className="font-semibold">{name}</p>
      <a className="fmv-link-underline w-fit" href={`mailto:${email}`}>{email}</a>
      {phone ? <a className="fmv-link-underline w-fit" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phoneLabel(`+1${phone.replace(/\D/g, "").slice(-10)}`)}</a> : null}
      {pref ? <p className="text-ink-soft">Prefers: {pref}</p> : null}
    </div>
  );
}

function RequestCard({ r }: { r: ProtoRequest }) {
  const c = r.customer;
  return (
    <article className="fmv-panel grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="fmv-chip fmv-chip--warn">New</span>
          <p className="font-semibold">{r.event_type} · {eventDate(r.date)}</p>
        </div>
        <p className="text-sm text-ink-soft">{r.ref} · received {when(r.created_at)}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <Contact name={c.full_name} email={c.email} phone={c.phone} pref={c.contact_pref} />
        <div className="grid content-start gap-1 text-sm">
          <p className="fmv-eyebrow">Event</p>
          <p>{eventDate(r.date)} · {r.start}–{r.end}</p>
          <p>{[r.venue_name, r.venue_address].filter(Boolean).join(", ") || "Venue not chosen yet"}</p>
          <p>{r.zone}{r.km ? ` · about ${r.km} km` : ""}</p>
          <p>{r.guests ? `${r.guests} guests` : "Guests: not given"}{r.theme ? ` · ${r.theme}` : ""}</p>
          {c.heard ? <p className="text-ink-soft">Heard about us: {c.heard}</p> : null}
        </div>
        <div className="grid content-start gap-1 text-sm">
          <p className="fmv-eyebrow">Estimate</p>
          <ul className="grid gap-1">
            {r.lines.map((l) => (
              <li key={l.label} className="flex justify-between gap-3">
                <span>{l.label}</span>
                <span className="whitespace-nowrap">{l.cents === null ? "TBD" : `${l.from ? "~" : ""}${money(l.cents)}`}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between border-t border-line pt-1 font-semibold">
            <span>Total</span>
            <span>{r.total_is_from ? "from " : ""}{money(r.total_cents)}</span>
          </p>
          <p className="text-ink-soft">Deposit {money(r.deposit_cents)}</p>
        </div>
      </div>
      {r.notes ? <p className="fmv-panel fmv-panel--blush whitespace-pre-line text-sm">{r.notes}</p> : null}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button type="button" className="fmv-cta-build fmv-cta-build--sm" disabled title="Available in the real booking app">Turn into a quote</button>
        <button type="button" className="fmv-cta-ghost" disabled title="Available in the real booking app">Mark as contacted</button>
        <span className="text-xs text-ink-soft">Buttons work in the real booking app.</span>
      </div>
    </article>
  );
}

function QuestionCard({ q }: { q: ProtoInquiry }) {
  return (
    <article className="fmv-panel grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="fmv-chip fmv-chip--warn">New</span>
          <p className="font-semibold">{q.interest || "General question"}{q.event_date ? ` · ${eventDate(q.event_date)}` : ""}</p>
        </div>
        <p className="text-sm text-ink-soft">{q.ref} · received {when(q.created_at)}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
        <Contact name={q.full_name} email={q.email} phone={q.phone} />
        <p className="whitespace-pre-line text-sm">{q.message}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <a className="fmv-cta-ghost" href={`mailto:${q.email}?subject=${encodeURIComponent("Your question for FMV Events & Photography")}`}>Reply by email</a>
      </div>
    </article>
  );
}
