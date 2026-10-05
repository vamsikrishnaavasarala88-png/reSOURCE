import { ImageOff, MapPin, Package, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../api/client';
import type { MaterialSummary } from '../types/material';
import { cn } from '../utils/cn';
import { formatDistance } from '../utils/spaceOptions';
import { formatMaterialPrice, formatQuantity } from '../utils/materialOptions';

interface MaterialCardProps {
  material: MaterialSummary;
  /** Detail path; overridable so the dashboard can reuse the card. */
  to?: string;
}

/** Listing card used by material search results and the owner's dashboard. */
export default function MaterialCard({ material, to }: MaterialCardProps) {
  const imageUrl = resolveMediaUrl(material.primaryImageUrl);
  const distance = formatDistance(material.distanceKm);
  const isPaused = material.status === 'INACTIVE';

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-lg">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={material.title}
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
              material.isFree ? 'bg-brand-600 text-white' : 'bg-white/95 text-stone-800',
            )}
          >
            {formatMaterialPrice(material.price, material.isFree)}
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
          <h3 className="line-clamp-1 text-base font-semibold text-stone-900">{material.title}</h3>

          <p className="flex items-center gap-1.5 text-sm font-medium text-stone-700">
            <Package className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
            {formatQuantity(material.quantity, material.unit)}
            <span className="text-stone-400" aria-hidden="true">
              ·
            </span>
            <span className="font-normal text-stone-600">{material.conditionLabel}</span>
          </p>

          <p className="flex items-start gap-1.5 text-sm text-stone-600">
            <MapPin className="mt-0.5 size-4 shrink-0 text-stone-400" aria-hidden="true" />
            <span className="line-clamp-2">{material.address}</span>
          </p>

          {distance ? <p className="text-xs font-medium text-brand-700">{distance}</p> : null}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
            <Tag className="size-3.5" aria-hidden="true" />
            {material.categoryLabel}
          </span>
        </div>

        <Link
          to={to ?? `/materials/${material.id}`}
          className="inline-flex items-center justify-center rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          View Details
        </Link>
      </div>
    </article>
  );
}

/** Loading placeholder with the shape of a material card. */
export function MaterialGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading materials">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
          <div className="aspect-[4/3] w-full animate-pulse bg-stone-200" />
          <div className="space-y-3 p-5">
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-stone-200" />
            <div className="h-4 w-1/2 animate-pulse rounded-full bg-stone-100" />
            <div className="h-9 w-full animate-pulse rounded-full bg-stone-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}
