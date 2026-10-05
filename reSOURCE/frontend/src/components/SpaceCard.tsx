import { ImageOff, MapPin, Ruler, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../api/client';
import type { SpaceSummary } from '../types/space';
import { cn } from '../utils/cn';
import {
  activityLabel,
  facilityLabel,
  formatArea,
  formatDistance,
  formatPrice,
} from '../utils/spaceOptions';

const MAX_FACILITY_CHIPS = 3;

interface SpaceCardProps {
  space: SpaceSummary;
  /** Detail path; overridable so the dashboard can reuse the card. */
  to?: string;
}

/** Listing card used by search results and the owner's dashboard. */
export default function SpaceCard({ space, to }: SpaceCardProps) {
  const imageUrl = resolveMediaUrl(space.primaryImageUrl);
  const distance = formatDistance(space.distanceKm);
  const facilities = space.facilities ?? [];
  const visibleFacilities = facilities.slice(0, MAX_FACILITY_CHIPS);
  const remainingFacilities = facilities.length - visibleFacilities.length;
  const freeActivities = space.freeActivities ?? [];
  const isFree = space.fromPrice === 0;
  const isPaused = space.status === 'INACTIVE';

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-lg">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={space.title}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand-50 to-stone-100 text-stone-400">
            <ImageOff className="size-7" aria-hidden="true" />
            <span className="text-xs font-medium">No photo yet</span>
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm',
              isFree ? 'bg-brand-600 text-white' : 'bg-white/95 text-stone-800',
            )}
          >
            {isFree ? 'FREE' : formatPrice(space.fromPrice)}
          </span>
          {isPaused ? (
            <span className="rounded-full bg-clay-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
              Paused
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="space-y-1.5">
          <h3 className="line-clamp-1 text-base font-semibold text-stone-900">{space.title}</h3>

          <p className="flex items-start gap-1.5 text-sm text-stone-600">
            <MapPin className="mt-0.5 size-4 shrink-0 text-stone-400" aria-hidden="true" />
            <span className="line-clamp-2">{space.address}</span>
          </p>

          {distance ? (
            <p className="text-xs font-medium text-brand-700">{distance}</p>
          ) : null}
        </div>

        <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-stone-700">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Area</dt>
            <Ruler className="size-4 text-stone-400" aria-hidden="true" />
            <dd>{formatArea(space.area, space.areaUnit)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Capacity</dt>
            <Users className="size-4 text-stone-400" aria-hidden="true" />
            <dd>Up to {space.capacity.toLocaleString('en-IN')}</dd>
          </div>
        </dl>

        {visibleFacilities.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {visibleFacilities.map((facility) => (
              <li
                key={facility}
                className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600"
              >
                {facilityLabel(facility)}
              </li>
            ))}
            {remainingFacilities > 0 ? (
              <li className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
                +{remainingFacilities} more
              </li>
            ) : null}
          </ul>
        ) : null}

        {freeActivities.length > 0 ? (
          <p className="text-xs text-stone-600">
            Free for {freeActivities.map(activityLabel).join(', ')}
          </p>
        ) : null}

        <Link
          to={to ?? `/spaces/${space.id}`}
          className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          View details
          <span aria-hidden="true">→</span>
          <span className="sr-only"> for {space.title}</span>
        </Link>
      </div>
    </article>
  );
}

/** Loading placeholder that mirrors the card layout. */
export function SpaceCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
      <div className="aspect-[4/3] w-full animate-pulse bg-stone-200" />
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="h-4 w-3/4 animate-pulse rounded-full bg-stone-200" />
        <div className="h-3 w-full animate-pulse rounded-full bg-stone-200" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-stone-200" />
        <div className="mt-auto h-3 w-24 animate-pulse rounded-full bg-stone-200" />
      </div>
    </div>
  );
}

/** Grid of skeletons shown while a space request is in flight. */
export function SpaceGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
      role="status"
      aria-label="Loading spaces"
    >
      {Array.from({ length: count }, (_, index) => (
        <SpaceCardSkeleton key={index} />
      ))}
    </div>
  );
}

/** Compact list row, used on the dashboard where cards would be too heavy. */
export function SpaceSummaryRow({
  space,
  actions,
}: {
  space: SpaceSummary;
  actions: React.ReactNode;
}) {
  const imageUrl = resolveMediaUrl(space.primaryImageUrl);

  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-stone-100">
          {imageUrl ? (
            <img src={imageUrl} alt={space.title} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-stone-400">
              <ImageOff className="size-5" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-stone-900">{space.title}</h3>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-semibold',
                space.status === 'ACTIVE'
                  ? 'bg-brand-50 text-brand-700'
                  : 'bg-clay-50 text-clay-600',
              )}
            >
              {space.status === 'ACTIVE' ? 'Active' : 'Paused'}
            </span>
          </div>
          <p className="truncate text-xs text-stone-600">{space.address}</p>
          <p className="text-xs text-stone-500">
            {formatArea(space.area, space.areaUnit)} · Up to{' '}
            {space.capacity.toLocaleString('en-IN')} ·{' '}
            {space.freeActivities?.length
              ? `Free for ${space.freeActivities.map(activityLabel).join(', ')}`
              : `From ${formatPrice(space.fromPrice)}`}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
    </li>
  );
}
