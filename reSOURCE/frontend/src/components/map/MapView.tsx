import 'leaflet/dist/leaflet.css';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { markerIcon } from './markerIcon';
import { cn } from '../../utils/cn';

/**
 * The map itself, on OpenStreetMap tiles.
 *
 * <p>One provider, in one component: the tile URL lives here and nowhere else, so
 * swapping to another basemap later is a change to this file rather than to every
 * page. No API key is needed, which is why this is the MVP's choice.</p>
 *
 * <p>Tiles are fetched from the internet by the visitor's browser. When that
 * fails - offline, a blocked network, a slow connection - the map says so and the
 * rest of the page carries on; the list of results is never behind a map.</p>
 */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** OSM's attribution is part of the tile usage policy, not decoration. */
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Shown when the tiles cannot be fetched, so the page is never just blank. */
export const MAP_UNAVAILABLE_MESSAGE =
  'Map could not be loaded. You can still browse the list.';

export interface MapViewProps {
  /** Where to centre the map when it first appears. */
  center: [number, number];
  /** Zoom on open; 12 shows a town, 14 a neighbourhood. */
  zoom?: number;
  /** Markers and other map children. */
  children?: ReactNode;
  /** Called with the clicked position, when the map is used as a picker. */
  onPick?: (coordinates: [number, number]) => void;
  /** Extra classes for the map frame. */
  className?: string;
  /** Height of the map frame, in pixels. */
  height?: number;
  /** An accessible name for the map, e.g. "Spaces near you". */
  label: string;
  /** A single pin, used when the map is a picker rather than a set of results. */
  pin?: [number, number] | null;
}

/** Reports map clicks to the picker without re-rendering on every move. */
function ClickHandler({ onPick }: { onPick?: (coordinates: [number, number]) => void }) {
  useMapEvents({
    click(event) {
      onPick?.([event.latlng.lat, event.latlng.lng]);
    },
  });

  return null;
}

/** Fits the map to the markers when they are all close to the centre. */
function FitToMarkers({ center }: { center: [number, number] }) {
  const map = useMapEvents({});
  const [latitude, longitude] = center;

  // Only re-centres when the centre really moved; the map object never changes.
  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom(), { animate: false });
  }, [latitude, longitude, map]);

  return null;
}

export default function MapView({
  center,
  zoom = 12,
  children,
  onPick,
  className,
  height = 420,
  label,
  pin,
}: MapViewProps) {
  const [tilesFailed, setTilesFailed] = useState(false);
  const [tilesArrived, setTilesArrived] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={frame}
      data-testid="map-view"
      role="region"
      aria-label={label}
      className={cn('relative overflow-hidden rounded-3xl border border-stone-200 bg-stone-100', className)}
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
        // The OSM tile policy asks for attribution; react-leaflet renders it here.
        attributionControl
      >
        <TileLayer
          url={TILE_URL}
          attribution={TILE_ATTRIBUTION}
          eventHandlers={{
            tileload: () => setTilesArrived(true),
            tileerror: () => setTilesFailed(true),
          }}
        />

        {pin ? (
          <Marker position={pin} icon={markerIcon({ label: 'Your listing', tone: 'pick' })} />
        ) : null}
        {onPick ? <ClickHandler onPick={onPick} /> : null}
        <FitToMarkers center={center} />
        {children}
      </MapContainer>

      {tilesFailed && !tilesArrived ? (
        <p
          data-testid="map-unavailable"
          role="status"
          className="pointer-events-none absolute inset-x-0 top-0 z-[500] m-3 rounded-2xl border border-amber-300 bg-amber-50/95 px-3.5 py-2.5 text-sm text-amber-900"
        >
          {MAP_UNAVAILABLE_MESSAGE}
        </p>
      ) : null}
    </div>
  );
}
