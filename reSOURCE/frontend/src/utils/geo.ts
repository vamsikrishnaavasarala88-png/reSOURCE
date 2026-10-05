import type { Coordinates } from '../services/locationService';

/**
 * A link that opens a place in whatever map application the visitor uses.
 *
 * <p>Built from the listing's own coordinates, so directions are just a normal
 * outbound link: no navigation system of our own, no key, and nothing about the
 * visitor leaves the page. The address is used as a label where a map application
 * supports one.</p>
 */
export function directionsUrl(
  latitude: number,
  longitude: number,
  label?: string | null,
): string {
  const target = label ? `${latitude},${longitude} (${label})` : `${latitude},${longitude}`;

  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(
    `;${target}`,
  )}`;
}

/**
 * A link that simply shows the place on a map, for listings where a route from
 * an unknown starting point would be meaningless.
 */
export function mapUrl(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
}

/** True when these coordinates can be mapped or routed to. */
export function hasUsableCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

/** A marker needs a position pair; this narrows the nullable case. */
export function toPosition(
  coordinates: Coordinates | null,
): [number, number] | null {
  return coordinates ? [coordinates.latitude, coordinates.longitude] : null;
}
