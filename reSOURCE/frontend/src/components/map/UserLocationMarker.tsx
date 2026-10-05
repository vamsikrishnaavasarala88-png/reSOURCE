import { Circle, Marker } from 'react-leaflet';
import { markerIcon } from './markerIcon';

/**
 * "You are here".
 *
 * <p>Shown only when the visitor granted permission, and only on the page they
 * granted it on: the position is never sent anywhere except the backend's
 * distance and radius parameters, and is never rendered on anyone else's screen.
 * The circle shows the radius being searched, so the results and the distances
 * make visual sense together.</p>
 */
export interface UserLocationMarkerProps {
  position: [number, number];
  /** Draws the current radius as a circle, when a radius is being applied. */
  radiusKm?: number | null;
}

export default function UserLocationMarker({ position, radiusKm }: UserLocationMarkerProps) {
  return (
    <>
      {radiusKm != null && radiusKm > 0 ? (
        <Circle
          center={position}
          radius={radiusKm * 1000}
          pathOptions={{ color: '#0369a1', weight: 1, fillOpacity: 0.06 }}
        />
      ) : null}

      <Marker
        position={position}
        icon={markerIcon({ label: '📍 You', tone: 'user' })}
        interactive={false}
        // Kept behind the listings: it is context, not something to read first.
        zIndexOffset={-1000}
      />
    </>
  );
}
