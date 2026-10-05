import { Suspense, lazy } from 'react';
import type { Coordinates } from '../../services/locationService';
import { hasUsableCoordinates } from '../../utils/geo';

/**
 * The map view of a page of marketplace results.
 *
 * <p>Leaflet is loaded only when a visitor actually opens the map, so the list
 * stays the fast path and nothing map-related weighs down the first paint. Only
 * listings that have real coordinates can be placed on it; the ones without are
 * counted and mentioned, because silently dropping them would look like a bug.</p>
 */
const MapView = lazy(() => import('./MapView'));
const ResourceMarker = lazy(() => import('./ResourceMarker'));
const UserLocationMarker = lazy(() => import('./UserLocationMarker'));

export interface MappableResource {
  id: number;
  title: string;
  href: string;
  latitude: number | null;
  longitude: number | null;
  address?: string | null;
  distanceKm?: number | null;
  /** Short facts for the popup. */
  facts?: string[];
}

export interface ResultsMapProps {
  resources: MappableResource[];
  /** The visitor's position, when they granted it. */
  userLocation: Coordinates | null;
  /** The radius being applied, drawn as a circle around the visitor. */
  radiusKm?: number | null;
  /** What a marker's label says, e.g. a shortened title or a price. */
  markerLabel: (resource: MappableResource) => string;

  /** The card this map mirrors, so a label can read the full listing. */
  // (kept as a parameter of markerLabel instead of a second type)
  /** A sentence for the map's accessible name, e.g. "Spaces near you". */
  label: string;
  /** Shown when none of the results can be placed on the map. */
  emptyMessage: string;
  /** Fallback centre when nobody has a position: the listing's own coordinates. */
  fallbackCenter?: [number, number];
}

export default function ResultsMap({
  resources,
  userLocation,
  radiusKm,
  markerLabel,
  label,
  emptyMessage,
  fallbackCenter,
}: ResultsMapProps) {
  const mappable = resources.filter((resource) =>
    hasUsableCoordinates(resource.latitude, resource.longitude),
  );
  const withoutCoordinates = resources.length - mappable.length;

  if (mappable.length === 0) {
    return (
      <p
        data-testid="map-empty"
        className="rounded-3xl border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-600"
      >
        {emptyMessage}
      </p>
    );
  }

  const center: [number, number] = userLocation
    ? [userLocation.latitude, userLocation.longitude]
    : (fallbackCenter ?? [mappable[0].latitude as number, mappable[0].longitude as number]);

  return (
    <div className="space-y-3">
      <Suspense
        fallback={
          <div
            data-testid="map-loading"
            role="status"
            className="flex h-[420px] items-center justify-center rounded-3xl border border-stone-200 bg-stone-100 text-sm text-stone-600"
          >
            Loading the map…
          </div>
        }
      >
        <MapView center={center} zoom={userLocation ? 12 : 11} label={label}>
          {userLocation ? (
            <UserLocationMarker
              position={[userLocation.latitude, userLocation.longitude]}
              radiusKm={radiusKm}
            />
          ) : null}

          {mappable.map((resource) => (
            <ResourceMarker
              key={resource.id}
              position={[resource.latitude as number, resource.longitude as number]}
              title={resource.title}
              address={resource.address}
              distanceKm={resource.distanceKm}
              facts={resource.facts}
              href={resource.href}
              markerLabel={markerLabel(resource)}
            />
          ))}
        </MapView>
      </Suspense>

      <p className="text-xs text-stone-500">
        {mappable.length === 1 ? '1 listing' : `${mappable.length} listings`} on the map
        {withoutCoordinates > 0
          ? ` · ${withoutCoordinates} without coordinates, visible in the list`
          : ''}
        .
      </p>
    </div>
  );
}
