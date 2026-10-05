import { MapPin, Navigation } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { directionsUrl, hasUsableCoordinates, mapUrl } from '../../utils/geo';

/**
 * The "Location" section of a listing page.
 *
 * <p>It shows the address the owner published, how far away it is when the
 * visitor has shared their own position, the spot on a map, and a link out to a
 * map application for directions. Nothing else: no owner contact details, no
 * requester's whereabouts, no exact position beyond the listing's own published
 * location. The map is loaded only when this page is opened.</p>
 */
const MapView = lazy(() => import('./MapView'));

export interface LocationCardProps {
  address: string;
  latitude: number | null;
  longitude: number | null;
  /** The backend's own distance calculation, when a position was used. */
  distanceKm?: number | null;
  /** What the map is for, e.g. "Community Ground". */
  title: string;
}

export default function LocationCard({
  address,
  latitude,
  longitude,
  distanceKm,
  title,
}: LocationCardProps) {
  const mappable = hasUsableCoordinates(latitude, longitude);

  return (
    <section
      aria-labelledby="listing-location-heading"
      data-testid="listing-location"
      className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2
        id="listing-location-heading"
        className="flex items-center gap-2 text-base font-semibold text-stone-900"
      >
        <MapPin className="size-4 text-stone-400" aria-hidden="true" />
        Location
      </h2>

      <p className="mt-2 text-sm text-stone-700">{address}</p>

      {distanceKm != null ? (
        <p data-testid="listing-distance" className="mt-1 text-sm font-medium text-brand-700">
          {roundDistance(distanceKm)} km away
        </p>
      ) : null}

      {mappable ? (
        <>
          <div className="mt-4">
            <Suspense
              fallback={
                <div
                  data-testid="map-loading"
                  role="status"
                  className="flex h-[280px] items-center justify-center rounded-3xl border border-stone-200 bg-stone-100 text-sm text-stone-600"
                >
                  Loading the map…
                </div>
              }
            >
              <MapView
                center={[latitude as number, longitude as number]}
                zoom={14}
                height={280}
                label={`Where ${title} is`}
                pin={[latitude as number, longitude as number]}
              />
            </Suspense>
          </div>

          <div className="mt-3 flex flex-wrap gap-3">
            <a
              data-testid="get-directions"
              href={directionsUrl(latitude as number, longitude as number, title)}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              <Navigation className="size-4" aria-hidden="true" />
              Get Directions
            </a>

            <a
              href={mapUrl(latitude as number, longitude as number)}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
            >
              Open in a bigger map
            </a>
          </div>
        </>
      ) : (
        <p data-testid="listing-no-map" className="mt-3 text-sm text-stone-500">
          This listing has no map pin, so it is found by its address rather than by distance.
        </p>
      )}
    </section>
  );
}

/** One decimal place is plenty for "how far is it"; the exact value stays on the server. */
function roundDistance(distanceKm: number): number {
  return Math.round(distanceKm * 10) / 10;
}
