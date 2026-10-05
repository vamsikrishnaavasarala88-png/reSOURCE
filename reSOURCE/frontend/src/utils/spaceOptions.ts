import type {
  ActivityType,
  AreaUnit,
  Facility,
  SpaceStatus,
} from '../types/space';

/**
 * Friendly labels and formatting for the space marketplace. The backend sends
 * enum values; every user facing string is built here so the wording stays in
 * one place.
 */

export const ACTIVITY_OPTIONS: ReadonlyArray<{ value: ActivityType; label: string }> = [
  { value: 'MARKET', label: 'Market' },
  { value: 'UNION_MEETING', label: 'Union Meeting' },
  { value: 'STUDENT_FEST', label: 'Student Fest' },
  { value: 'EXHIBITION', label: 'Exhibition' },
  { value: 'MEDICAL_CAMP', label: 'Medical Camp' },
  { value: 'BLOOD_DONATION', label: 'Blood Donation Camp' },
  { value: 'WORKSHOP', label: 'Workshop' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'SPORTS', label: 'Sports' },
  { value: 'CULTURAL_EVENT', label: 'Cultural Event' },
  { value: 'OTHER', label: 'Other' },
];

export const FACILITY_OPTIONS: ReadonlyArray<{ value: Facility; label: string }> = [
  { value: 'PARKING', label: 'Parking' },
  { value: 'ELECTRICITY', label: 'Electricity' },
  { value: 'WATER', label: 'Water' },
  { value: 'WASHROOMS', label: 'Washrooms' },
  { value: 'LIGHTING', label: 'Lighting' },
  { value: 'STAGE', label: 'Stage' },
  { value: 'SEATING', label: 'Seating' },
  { value: 'ROAD_ACCESS', label: 'Road Access' },
  { value: 'PUBLIC_TRANSPORT', label: 'Public Transport' },
];

export const AREA_UNIT_OPTIONS: ReadonlyArray<{
  value: AreaUnit;
  label: string;
  short: string;
}> = [
  { value: 'SQ_FT', label: 'Square feet', short: 'sq ft' },
  { value: 'SQ_M', label: 'Square metres', short: 'sq m' },
  { value: 'SQ_YD', label: 'Square yards', short: 'sq yd' },
  { value: 'ACRES', label: 'Acres', short: 'acres' },
  { value: 'HECTARES', label: 'Hectares', short: 'ha' },
];

export const STATUS_LABELS: Record<SpaceStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Paused',
  DELETED: 'Deleted',
};

/** Falls back to a readable form for values added to the backend later. */
function prettify(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * The API sends enum values in requests but friendly labels in responses, so
 * both forms are accepted here and unknown values are made readable.
 */
function labelFor(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
): string {
  const needle = value.trim().toLowerCase();

  const byValue = options.find((option) => option.value.toLowerCase() === needle);
  if (byValue) {
    return byValue.label;
  }

  const byLabel = options.find((option) => option.label.toLowerCase() === needle);

  return byLabel ? byLabel.label : prettify(value);
}

export function activityLabel(value: string): string {
  return labelFor(ACTIVITY_OPTIONS, value);
}

export function facilityLabel(value: string): string {
  return labelFor(FACILITY_OPTIONS, value);
}

export function areaUnitLabel(value: string): string {
  return AREA_UNIT_OPTIONS.find((option) => option.value === value)?.short ?? value;
}

/** Prices are rupee amounts. `null` means the owner has not priced anything yet. */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Price on request';
  }

  const amount = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);

  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

export function formatArea(area: number, unit: string): string {
  const rounded = Number.isInteger(area) ? area : Number(area.toFixed(2));

  return `${rounded.toLocaleString('en-IN')} ${areaUnitLabel(unit)}`;
}

export function formatDistance(distanceKm: number | null | undefined): string | null {
  if (distanceKm === null || distanceKm === undefined) {
    return null;
  }

  if (distanceKm < 1) {
    return 'Less than 1 km away';
  }

  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km away`;
}

/** "2 activities" / "1 activity" for compact card copy. */
export function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
