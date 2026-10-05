import { ArrowRight, CircleCheck, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../utils/cn';

type MarketplaceTone = 'brand' | 'clay';

const TONES: Record<MarketplaceTone, { icon: string; check: string; link: string }> = {
  brand: {
    icon: 'bg-brand-50 text-brand-700',
    check: 'text-brand-600',
    link: 'text-brand-700 group-hover:text-brand-800',
  },
  clay: {
    icon: 'bg-clay-50 text-clay-600',
    check: 'text-clay-600',
    link: 'text-clay-600 group-hover:text-clay-500',
  },
};

interface MarketplaceCardProps {
  title: string;
  description: string;
  highlights: string[];
  to: string;
  ctaLabel: string;
  icon: LucideIcon;
  tone: MarketplaceTone;
}

/** Entry card for one of the two independent modules (spaces / materials). */
export default function MarketplaceCard({
  title,
  description,
  highlights,
  to,
  ctaLabel,
  icon: Icon,
  tone,
}: MarketplaceCardProps) {
  const toneClasses = TONES[tone];

  return (
    <Link
      to={to}
      className="group flex h-full flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-lg sm:p-8"
    >
      <span
        className={cn('flex size-12 items-center justify-center rounded-2xl', toneClasses.icon)}
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-stone-900 sm:text-xl">{title}</h3>
        <p className="text-sm leading-relaxed text-stone-600 sm:text-base">{description}</p>
      </div>

      <ul className="space-y-2 text-sm text-stone-600">
        {highlights.map((highlight) => (
          <li key={highlight} className="flex items-start gap-2">
            <CircleCheck
              className={cn('mt-0.5 size-4 shrink-0', toneClasses.check)}
              aria-hidden="true"
            />
            <span>{highlight}</span>
          </li>
        ))}
      </ul>

      <span
        className={cn(
          'mt-auto inline-flex items-center gap-2 pt-2 text-sm font-semibold',
          toneClasses.link,
        )}
      >
        {ctaLabel}
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}
