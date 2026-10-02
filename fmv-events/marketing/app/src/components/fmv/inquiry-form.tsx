import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { EMAIL_RE, protoRef, protoStore, validPhone } from "@/fmv/proto-store";
import { useSite } from "./use-site";

// Prototype of the booking app's question form (Part B /contact). Kept in this browser only.
export function InquiryForm() {
  const { catalog, settings } = useSite();
  const owner = settings?.owner_name?.split(" ")[0] ?? "Marie";
  const interests = [...(catalog?.categories ?? []).sort((a, b) => a.sort - b.sort).map((c) => c.name), "Packages", "Something else"];
  const [f, setF] = useState({ full_name: "", email: "", phone: "", event_date: "", interest: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (f.full_name.trim().length < 2) err.full_name = "Enter your name.";
    if (!EMAIL_RE.test(f.email.trim())) err.email = "Enter a valid email so we can reply.";
    if (f.phone.trim() && !validPhone(f.phone)) err.phone = "Enter a 10-digit phone number, or leave it blank.";
    if (f.message.trim().length < 5) err.message = "Tell us a little about your question.";
    setErrors(err);
    if (Object.keys(err).length) return;
    const ref = protoRef("M");
    protoStore.addInquiry({ ref, created_at: new Date().toISOString(), ...f, full_name: f.full_name.trim(), email: f.email.trim(), phone: f.phone.trim(), message: f.message.trim() });
    setSent(f.full_name.trim().split(" ")[0]);
  }

  if (sent) {
    return (
      <div className="fmv-panel grid gap-3" aria-live="polite">
        <p className="fmv-h3">Thanks, {sent}!</p>
        <p className="fmv-body">Your question is in. {owner} usually replies within a day.</p>
        <p className="text-sm text-ink-soft">Prototype preview: nothing was sent. It&apos;s saved only in this browser.</p>
        <div className="flex flex-wrap gap-3">
          <Link to="/owner-preview" className="fmv-cta-ghost">See what {owner} receives</Link>
          <button type="button" className="fmv-link-underline text-sm" onClick={() => { setSent(null); setF({ full_name: "", email: "", phone: "", event_date: "", interest: "", message: "" }); }}>Ask another question</button>
        </div>
      </div>
    );
  }

  return (
    <form className="fmv-panel grid gap-4" onSubmit={submit} noValidate>
      <p className="fmv-h3">Send us a question</p>
      <label className="fmv-field">
        <span>Your name <span aria-hidden="true" className="text-rose-deep">*</span></span>
        <input value={f.full_name} autoComplete="name" aria-invalid={Boolean(errors.full_name)} onChange={(e) => set("full_name", e.target.value)} />
        {errors.full_name ? <span className="fmv-err">{errors.full_name}</span> : null}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="fmv-field">
          <span>Email <span aria-hidden="true" className="text-rose-deep">*</span></span>
          <input type="email" value={f.email} autoComplete="email" aria-invalid={Boolean(errors.email)} onChange={(e) => set("email", e.target.value)} />
          {errors.email ? <span className="fmv-err">{errors.email}</span> : null}
        </label>
        <label className="fmv-field">
          <span>Phone (optional)</span>
          <input type="tel" value={f.phone} autoComplete="tel" aria-invalid={Boolean(errors.phone)} onChange={(e) => set("phone", e.target.value)} />
          {errors.phone ? <span className="fmv-err">{errors.phone}</span> : <span className="fmv-hint">If you&apos;d like a call back.</span>}
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="fmv-field">
          <span>Event date (if you have one)</span>
          <input type="date" value={f.event_date} onChange={(e) => set("event_date", e.target.value)} />
        </label>
        <label className="fmv-field">
          <span>Interested in</span>
          <select value={f.interest} onChange={(e) => set("interest", e.target.value)}>
            <option value="">Choose one (optional)</option>
            {interests.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>
      </div>
      <label className="fmv-field">
        <span>Your question <span aria-hidden="true" className="text-rose-deep">*</span></span>
        <textarea rows={5} value={f.message} aria-invalid={Boolean(errors.message)} onChange={(e) => set("message", e.target.value)} />
        {errors.message ? <span className="fmv-err">{errors.message}</span> : null}
      </label>
      <div>
        <button type="submit" className="fmv-cta-build">
          <span aria-hidden="true" className="fmv-cta-build__dot" />
          Send question
        </button>
      </div>
    </form>
  );
}
