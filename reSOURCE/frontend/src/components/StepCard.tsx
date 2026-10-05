import type { LucideIcon } from 'lucide-react';

interface StepCardProps {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
}

/** One step of the List → Discover → Request → Reuse loop. */
export default function StepCard({ step, title, description, icon: Icon }: StepCardProps) {
  return (
    <li className="flex h-full flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
          Step {step}
        </span>
      </div>
      <h3 className="text-base font-semibold text-stone-900">{title}</h3>
      <p className="text-sm leading-relaxed text-stone-600">{description}</p>
    </li>
  );
}
