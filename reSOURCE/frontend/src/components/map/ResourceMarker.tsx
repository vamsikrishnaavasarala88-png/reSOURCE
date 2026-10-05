import { Marker, Popup } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { markerIcon } from './markerIcon';

/**
 * One listing on the map.
 *
 * <p>The popup carries what a visitor needs to decide whether to open it - the
 * title, where it is, how far away it is and the few facts that matter for that
 * kind of listing - and never an owner's name, phone number or email. That
 * information only appears after a request has been accepted, which is a rule the
 * backend enforces and this component never works around.</p>
 */
export interface ResourceMarkerProps {
  /** Where the listing is. Listings without coordinates are simply not shown. */
  position: [number, number];
  title: string;
  /** The address line as published on the listing. */
  address?: string | null;
  /** Distance in kilometres, when the visitor's location is known. */
  distanceKm?: number | null;
  /** Short facts for the popup, e.g. ["1.5 acres", "Capacity: 500", "₹2,000"]. */
  facts?: string[];
  /** Where "View details" leads. */
  href: string;
  /** The words on the marker itself. */
  markerLabel: string;
}

export default function ResourceMarker({
  position,
  title,
  address,
  distanceKm,
  facts = [],
  href,
  markerLabel,
}: ResourceMarkerProps) {
  return (
    <Marker
      position={position}
      icon={markerIcon({ label: markerLabel, tone: 'resource' })}
      // Labels overlap where listings are close together: hovering lifts the one
      // under the cursor so it is always clear which pin is being pointed at.
      riseOnHover
      title={title}
    >
      <Popup>
        <div className="min-w-[200px] space-y-1.5" data-testid="map-popup">
          <p className="text-sm font-semibold text-stone-900">{title}</p>

          {address ? <p className="text-xs text-stone-600">{address}</p> : null}

          {distanceKm != null ? (
            <p className="text-xs font-medium text-brand-700">{round(distanceKm)} km away</p>
          ) : null}

          {facts.length > 0 ? (
            <ul className="space-y-0.5 text-xs text-stone-700">
              {facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          ) : null}

          <Link
            to={href}
            className="mt-1 inline-flex text-xs font-semibold text-brand-700 hover:text-brand-800"
          >
            View details →
          </Link>
        </div>
      </Popup>
    </Marker>
  );
}

/** Distances are rounded for display only; filtering uses the exact value. */
function round(distanceKm: number): number {
  return Math.round(distanceKm * 10) / 10;
}
