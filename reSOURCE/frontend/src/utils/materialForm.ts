import type { MaterialCategory, MaterialCondition, MaterialPayload } from '../types/material';
import type { MaterialFormDraft } from './validation';

/** Blank material form. Nothing is preselected for the owner. */
export function emptyMaterialDraft(): MaterialFormDraft {
  return {
    title: '',
    category: '',
    description: '',
    quantity: '',
    unit: '',
    condition: '',
    price: '',
    isFree: false,
    address: '',
    // Coordinates are not part of the form any more. They are kept in the draft so
    // an edited listing keeps the position it already had instead of losing it.
    latitude: '',
    longitude: '',
    ownerNote: '',
  };
}

/** Fills the form from a listing the owner already saved. */
export function materialDraftFrom(detail: {
  title: string;
  category: MaterialCategory;
  description: string;
  quantity: number;
  unit: string;
  condition: MaterialCondition;
  price: number;
  isFree: boolean;
  address: string;
  latitude: number | null;
  longitude: number | null;
  ownerNote: string | null;
}): MaterialFormDraft {
  return {
    title: detail.title,
    category: detail.category,
    description: detail.description,
    quantity: String(detail.quantity),
    unit: detail.unit,
    condition: detail.condition,
    price: detail.isFree ? '' : String(detail.price),
    isFree: detail.isFree,
    address: detail.address,
    latitude: detail.latitude === null ? '' : String(detail.latitude),
    longitude: detail.longitude === null ? '' : String(detail.longitude),
    ownerNote: detail.ownerNote ?? '',
  };
}

/**
 * Turns the form into the API payload.
 *
 * <p>The free switch wins over the price box: a free listing is sent with a price
 * of 0, because the owner decided it is free. Location is only sent when both
 * coordinates are filled in.</p>
 */
export function toMaterialPayload(
  values: MaterialFormDraft,
  status?: 'ACTIVE' | 'INACTIVE',
): MaterialPayload {
  const hasCoordinates = values.latitude.trim() !== '' && values.longitude.trim() !== '';

  return {
    title: values.title.trim(),
    category: values.category as MaterialCategory,
    description: values.description.trim(),
    quantity: Number(values.quantity),
    unit: values.unit.trim(),
    condition: values.condition as MaterialCondition,
    price: values.isFree ? 0 : Number(values.price || 0),
    isFree: values.isFree,
    address: values.address.trim(),
    latitude: hasCoordinates ? Number(values.latitude) : null,
    longitude: hasCoordinates ? Number(values.longitude) : null,
    ownerNote: values.ownerNote.trim() === '' ? null : values.ownerNote.trim(),
    ...(status ? { status } : {}),
  };
}
