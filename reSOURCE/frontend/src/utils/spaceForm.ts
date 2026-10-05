import type { AreaUnit, Facility, SpaceDetail, SpacePayload, SpaceStatus } from '../types/space';
import type { SpaceFormDraft, SpacePricingDraft } from './validation';

/** Creates an empty pricing row with a unique key for React lists. */
export function newPricingRow(activityType = ''): SpacePricingDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    activityType,
    isFree: false,
    price: '',
    ownerNote: '',
  };
}

export function emptySpaceDraft(): SpaceFormDraft {
  return {
    title: '',
    description: '',
    address: '',
    // Coordinates are not part of the form any more. They are kept in the draft so
    // an edited listing keeps the position it already had instead of losing it.
    latitude: '',
    longitude: '',
    area: '',
    capacity: '',
    availability: '',
    ownerNote: '',
    pricing: [newPricingRow()],
  };
}

export interface SpaceFormState {
  values: SpaceFormDraft;
  areaUnit: AreaUnit;
  facilities: Facility[];
  status: SpaceStatus;
}

/** Fills the form from an existing listing. */
export function toFormState(space: SpaceDetail): SpaceFormState {
  return {
    values: {
      title: space.title,
      description: space.description,
      address: space.address,
      latitude: space.latitude === null ? '' : String(space.latitude),
      longitude: space.longitude === null ? '' : String(space.longitude),
      area: String(space.area),
      capacity: String(space.capacity),
      availability: space.availability ?? '',
      ownerNote: space.ownerNote ?? '',
      pricing: space.pricing.map((entry) => ({
        id: `pricing-${entry.id}`,
        activityType: entry.activityType,
        isFree: entry.isFree,
        price: entry.isFree ? '' : String(entry.price),
        ownerNote: entry.ownerNote ?? '',
      })),
    },
    areaUnit: space.areaUnit,
    facilities: space.facilities as Facility[],
    status: space.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  };
}

function numberOrNull(value: string): number | null {
  const text = value.trim();

  return text === '' ? null : Number(text);
}

function textOrNull(value: string): string | null {
  const text = value.trim();

  return text === '' ? null : text;
}

/**
 * Turns the form draft into the API payload. The owner is never sent: the
 * backend takes it from the access token.
 */
export function toPayload(
  state: SpaceFormState,
  options: { includeStatus: boolean },
): SpacePayload {
  const { values } = state;

  return {
    title: values.title.trim(),
    description: values.description.trim(),
    address: values.address.trim(),
    latitude: numberOrNull(values.latitude),
    longitude: numberOrNull(values.longitude),
    area: Number(values.area),
    areaUnit: state.areaUnit,
    capacity: Number(values.capacity),
    availability: textOrNull(values.availability),
    ownerNote: textOrNull(values.ownerNote),
    facilities: state.facilities,
    pricing: values.pricing
      .filter((row) => row.activityType !== '')
      .map((row) => ({
        activityType: row.activityType as SpacePayload['pricing'][number]['activityType'],
        isFree: row.isFree,
        price: row.isFree ? 0 : Number(row.price),
        ownerNote: textOrNull(row.ownerNote),
      })),
    ...(options.includeStatus ? { status: state.status } : {}),
  };
}
