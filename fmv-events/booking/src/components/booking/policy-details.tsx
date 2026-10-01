import { Markdown } from './markdown';

export interface PolicyLike {
  key: string;
  title: string;
  body_md: string;
  version: number;
}

/** Expandable policies (one <details> per policy) with their version numbers. */
export function PolicyDetails({ policies, openFirst = false }: { policies: PolicyLike[]; openFirst?: boolean }) {
  if (policies.length === 0) return <p className="text-sm text-ink-soft">No policies have been published yet.</p>;
  return (
    <div className="divide-y divide-line rounded-xl border border-line bg-white">
      {policies.map((p, i) => (
        <details key={p.key} className="group px-4 py-3" open={openFirst && i === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-ink">
            <span>{p.title}</span>
            <span className="flex items-center gap-2 text-xs font-normal text-ink-soft">
              v{p.version}
              <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
            </span>
          </summary>
          <Markdown md={p.body_md} className="mt-2" />
        </details>
      ))}
    </div>
  );
}
