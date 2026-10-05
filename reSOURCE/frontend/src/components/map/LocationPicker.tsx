import { Crosshair, MapPin } from 'lucide-react';
import { Suspense, lazy, useState } from 'react';
import Button from '../Button';
import { useUserLocation } from '../../hooks/useUserLocation';

/** Leaflet is pulled in only when the owner opens the map, never with the form. */
const MapView = lazy(() => import('./MapView'));

/**
 * Choosing where a listing is, on a map.
 *
 * <p>Two ways, both optional: press "Use my current location" to drop the pin
 * where the visitor is, or click the map to place it. The pin can be moved by
 * clicking again. Nothing here is required - an address on its own is still a
 * complete listing - and a visitor who refuses location permission simply clicks
 * the map instead.</p>
 *
 * <p>The picker only ever produces coordinates. The address stays a normal text
 * field, because that is what the listing publishes and what people search by.</p>
 */
export interface LocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (coordinates: { latitude: number; longitude: number } | null) => void;
  /** Where the map opens before a pin is placed; the town the app is used in. */
  defaultCenter?: [number, number];
  disabled?: boolean;
}

/** Bhimavaram, Andhra Pradesh - the town the demo data sits in. */
const FALLBACK_CENTER: [number, number] = [16.5449, 81.5212];

export default function LocationPicker({
  latitude,
  longitude,
  onChange,
  defaultCenter = FALLBACK_CENTER,
  disabled = false,
}: LocationPickerProps) {
  const [showMap, setShowMap] = useState(latitude != null && longitude != null);
  const [error, setError] = useState<string | null>(null);
  const { coordinates: here, status, message, request } = useUserLocation();

  const hasPin = latitude != null && longitude != null;
  const center: [number, number] = hasPin ? [latitude, longitude] : (here ? [here.latitude, here.longitude] : defaultCenter);

  async function useMyLocation() {
    setError(null);
    setShowMap(true);

    // This position is published with the listing, so it is asked for exactly.
    const found = await request({ precise: true });

    if (found) {
      onChange({ latitude: found.latitude, longitude: found.longitude });
    }
  }

  return (
    <div className="sm:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-stone-700">Location on the map</span>
        <span className="text-xs text-stone-500">Optional — an address on its own is enough.</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="location-use-my-location"
          loading={status === 'requesting'}
          loadingLabel="Finding you…"
          disabled={disabled}
          onClick={useMyLocation}
        >
          <Crosshair className="size-4" aria-hidden="true" />
          Use my current location
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="location-select-on-map"
          disabled={disabled}
          onClick={() => setShowMap((current) => !current)}
        >
          <MapPin className="size-4" aria-hidden="true" />
          {showMap ? 'Hide map' : 'Select on map'}
        </Button>

        {hasPin ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="location-clear"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            Clear pin
          </Button>
        ) : null}
      </div>

      {message ? (
        <p
          role="status"
          data-testid="location-message"
          className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          {message}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}

      {hasPin ? (
        <p data-testid="location-pin-coordinates" className="mt-2 text-xs text-stone-600">
          Pin set at {latitude?.toFixed(5)}, {longitude?.toFixed(5)} — searched by distance from here.
        </p>
      ) : (
        <p data-testid="location-no-pin" className="mt-2 text-xs text-stone-600">
          No map pin yet. The listing still publishes with its address; distance search just will
          not include it.
        </p>
      )}

      {showMap ? (
        <div className="mt-3">
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
              center={center}
              zoom={hasPin ? 14 : 12}
              height={280}
              label="Choose the listing location"
              pin={hasPin ? [latitude, longitude] : null}
              onPick={(picked) => {
                if (disabled) {
                  return;
                }

                setError(null);
                onChange({ latitude: round(picked[0]), longitude: round(picked[1]) });
              }}
            />
          </Suspense>

          <p className="mt-1.5 text-xs text-stone-500">
            Click anywhere on the map to place the pin, or click again to move it.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Six decimal places is about ten centimetres - beyond that is noise. */
function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
