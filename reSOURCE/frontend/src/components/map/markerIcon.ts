import L from 'leaflet';

/**
 * A round marker drawn as inline HTML, so no icon files have to be fetched.
 *
 * <p>Kept in its own module rather than beside the map, so that components which
 * only draw a marker do not drag the whole map - and Leaflet with it - into the
 * page's first bundle.</p>
 */
export function markerIcon({ label, tone }: { label: string; tone: 'resource' | 'user' | 'pick' }): L.DivIcon {
  const colour =
    tone === 'user' ? 'bg-sky-600 ring-sky-200' : tone === 'pick' ? 'bg-clay-600 ring-clay-200' : 'bg-brand-600 ring-brand-200';

  return L.divIcon({
    className: '',
    html: `<span class="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white px-2 py-1 text-[11px] font-semibold text-white shadow-md ring-4 ${colour}">${label}</span>`,
    iconSize: undefined,
    iconAnchor: [12, 12],
  });
}
