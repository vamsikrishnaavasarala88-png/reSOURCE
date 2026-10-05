import type { MaterialCategory, MaterialCondition, MaterialStatus } from '../types/material';
import { formatPrice, STATUS_LABELS } from './spaceOptions';

/**
 * Friendly labels and formatting for the material marketplace.
 *
 * <p>Values come from the backend enums; every user facing string is built here,
 * so wording stays in one place. Material statuses reuse the space wording,
 * because "Active" and "Paused" mean the same thing in both marketplaces.</p>
 */

export const MATERIAL_CATEGORY_OPTIONS: ReadonlyArray<{ value: MaterialCategory; label: string }> = [
  { value: 'BRICKS', label: 'Bricks' },
  { value: 'CEMENT', label: 'Cement' },
  { value: 'TILES', label: 'Tiles' },
  { value: 'WOOD', label: 'Wood' },
  { value: 'METAL', label: 'Metal' },
  { value: 'PIPES', label: 'Pipes' },
  { value: 'SAND', label: 'Sand' },
  { value: 'STONE', label: 'Stone' },
  { value: 'OTHER', label: 'Other' },
];

export const MATERIAL_CONDITION_OPTIONS: ReadonlyArray<{
  value: MaterialCondition;
  label: string;
}> = [
  { value: 'NEW', label: 'New' },
  { value: 'GOOD', label: 'Good' },
  { value: 'USED', label: 'Used' },
  { value: 'DAMAGED', label: 'Damaged' },
];

/**
 * Units offered in the form. The backend stores whatever the owner types, but
 * the quantity filter only ever compares identical units - so the same short
 * list is used everywhere and "pieces" is never silently read as "kg".
 */
export const MATERIAL_UNIT_OPTIONS: ReadonlyArray<string> = [
  'pieces',
  'bags',
  'boards',
  'pipes',
  'kg',
  'tonnes',
  'sq ft',
  'metres',
  'litres',
  'bundles',
];

export const MATERIAL_STATUS_LABELS: Record<MaterialStatus, string> = {
  ACTIVE: STATUS_LABELS.ACTIVE,
  INACTIVE: STATUS_LABELS.INACTIVE,
  DELETED: STATUS_LABELS.DELETED,
};

export function materialCategoryLabel(value: string): string {
  return (
    MATERIAL_CATEGORY_OPTIONS.find(
      (option) => option.value.toLowerCase() === value.trim().toLowerCase(),
    )?.label ?? value
  );
}

export function materialConditionLabel(value: string): string {
  return (
    MATERIAL_CONDITION_OPTIONS.find(
      (option) => option.value.toLowerCase() === value.trim().toLowerCase(),
    )?.label ?? value
  );
}

/** `300 pieces`, `2 tonnes` - the number is the owner's, never rounded away. */
export function formatQuantity(quantity: number, unit: string): string {
  const rounded = Number.isInteger(quantity) ? quantity : Number(quantity.toFixed(2));

  return `${rounded.toLocaleString('en-IN')} ${unit}`.trim();
}

/** `FREE` when the owner offers it for free, otherwise the owner's price. */
export function formatMaterialPrice(price: number, isFree: boolean): string {
  return isFree ? 'FREE' : formatPrice(price);
}
