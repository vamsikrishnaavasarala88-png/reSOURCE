import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface PlaceholderPanelProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Work that is explicitly planned for a later phase. */
  planned: string[];
  /** Route parameter shown when a detail page is opened directly. */
  requestedId?: string;
  backTo: { label: string; to: string };
}

/**
 * Honest "not built yet" panel for routes that exist but have no API behind
 * them in Phase 1.
 */
export default function PlaceholderPanel({
  icon: Icon,
  title,
  description,
  planned,
  requestedId,
  backTo,
}: PlaceholderPanelProps) {
  return (
    <section className="mt-8 overflow-hidden rounded-3xl border border-dashed border-stone-300 bg-white">
      <div className="flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
            <Icon className="size-6" aria-hidden="true" />
          </span>
          <div className="space-y-2">
            <span className="inline-flex rounded-full bg-clay-50 px-3 py-1 text-xs font-semibold text-clay-600">
              Coming in a later phase
            </span>
            <h2 className="text-lg font-semibold text-stone-900 sm:text-xl">{title}</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-stone-600">{description}</p>
            {requestedId ? (
              <p className="text-xs text-stone-500">
                Requested id:{' '}
                <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-stone-700">
                  {requestedId}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Planned next
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {planned.map((item) => (
              <li
                key={item}
                className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-600"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        <Link
          to={backTo.to}
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backTo.label}
        </Link>
      </div>
    </section>
  );
}
