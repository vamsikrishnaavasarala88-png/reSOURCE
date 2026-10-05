import { Filter, RotateCcw, Search } from 'lucide-react';
import Button from './Button';
import { NumberField, SelectField } from './Fields';
import type { MaterialCategory, MaterialCondition } from '../types/material';
import {
  MATERIAL_CATEGORY_OPTIONS,
  MATERIAL_CONDITION_OPTIONS,
  MATERIAL_UNIT_OPTIONS,
} from '../utils/materialOptions';
import {
  MATERIAL_RADIUS_OPTIONS,
  MATERIAL_SORT_OPTIONS,
  type LocationStatus,
  type MaterialFilterDraft,
  type UserLocation,
} from '../utils/materialFilters';

interface MaterialFiltersProps {
  draft: MaterialFilterDraft;
  errors: Record<string, string>;
  onChange: (patch: Partial<MaterialFilterDraft>) => void;
  onReset: () => void;
  activeCount: number;
  location: UserLocation | null;
  locationStatus: LocationStatus;
  /** A sentence from the location service, already written for a person. */
  locationMessage?: string | null;
  onRequestLocation: () => void;
  onClearLocation: () => void;
}

/** Filter bar of the material marketplace. Everything here is sent to the API. */
export default function MaterialFilters({
  draft,
  errors,
  onChange,
  onReset,
  activeCount,
  location,
  locationStatus,
  locationMessage,
  onRequestLocation,
  onClearLocation,
}: MaterialFiltersProps) {
  return (
    <section
      aria-label="Material filters"
      className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
          <Filter className="size-4 text-stone-400" aria-hidden="true" />
          Filters
        </h2>

        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={activeCount === 0}
          className="text-stone-600"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          {activeCount > 0 ? `Clear filters (${activeCount})` : 'Clear filters'}
        </Button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="material-search" className="block text-sm font-medium text-stone-700">
            Search
          </label>
          <div className="relative mt-1.5">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
              aria-hidden="true"
            />
            <input
              id="material-search"
              type="search"
              value={draft.q}
              onChange={(event) => onChange({ q: event.target.value })}
              placeholder="Bricks, boards, pipes…"
              className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-9 pr-3.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            />
          </div>
        </div>

        <SelectField
          id="material-category"
          label="Category"
          value={draft.category}
          onChange={(value) => onChange({ category: value as MaterialCategory | '' })}
          options={[
            { value: '', label: 'Any category' },
            ...MATERIAL_CATEGORY_OPTIONS.map((option) => ({ ...option })),
          ]}
        />

        <SelectField
          id="material-condition"
          label="Condition"
          value={draft.condition}
          onChange={(value) => onChange({ condition: value as MaterialCondition | '' })}
          options={[
            { value: '', label: 'Any condition' },
            ...MATERIAL_CONDITION_OPTIONS.map((option) => ({ ...option })),
          ]}
        />

        <SelectField
          id="material-unit"
          label="Unit"
          hint="Quantity is only compared within the same unit."
          value={draft.unit}
          error={errors.unit}
          onChange={(value) => onChange({ unit: value })}
          options={[
            { value: '', label: 'Any unit' },
            ...MATERIAL_UNIT_OPTIONS.map((unit) => ({ value: unit, label: unit })),
          ]}
        />

        <NumberField
          id="material-min-quantity"
          label="Minimum quantity"
          value={draft.minQuantity}
          onChange={(value) => onChange({ minQuantity: value })}
          error={errors.minQuantity}
          min={0}
          placeholder="200"
          hint="Pick a unit too, so unlike quantities are never compared."
        />

        <NumberField
          id="material-max-price"
          label="Maximum price (₹)"
          value={draft.freeOnly ? '' : draft.maxPrice}
          onChange={(value) => onChange({ maxPrice: value })}
          error={errors.maxPrice}
          min={0}
          disabled={draft.freeOnly}
          placeholder="2000"
          hint={
            draft.freeOnly
              ? 'Ignored while “Free only” is on.'
              : 'Free listings are always included. Enter 0 for free only.'
          }
        />

        <SelectField
          id="material-sort"
          label="Sort by"
          value={draft.sort}
          onChange={(value) => onChange({ sort: value as MaterialFilterDraft['sort'] })}
          options={MATERIAL_SORT_OPTIONS.map((option) => ({ ...option }))}
        />

        <label className="flex items-start gap-2.5 rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm text-stone-700 sm:col-span-2 lg:col-span-1">
          <input
            id="material-free-only"
            type="checkbox"
            checked={draft.freeOnly}
            onChange={(event) => onChange({ freeOnly: event.target.checked })}
            className="mt-0.5 size-4 rounded border-stone-300 text-brand-600 focus:ring-brand-200"
          />
          <span>
            <span className="font-medium text-stone-800">Free only</span>
            <span className="mt-0.5 block text-xs text-stone-500">
              Show only what owners offer for free.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-5 border-t border-stone-200 pt-4">
        {location ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-stone-700">
              Sorting and filtering around your approximate location
              {location.approximate ? ' (rounded to about a kilometre)' : ''}.
            </span>

            <SelectField
              id="material-radius"
              label="Within"
              value={draft.radiusKm}
              error={errors.radiusKm}
              onChange={(value) => onChange({ radiusKm: value })}
              options={MATERIAL_RADIUS_OPTIONS.map((radius) => ({
                value: radius,
                label: `${radius} km`,
              }))}
            />

            <Button variant="secondary" size="sm" onClick={onClearLocation} className="mt-5">
              Clear location
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={onRequestLocation}
              loading={locationStatus === 'requesting'}
              loadingLabel="Locating…"
            >
              Use my location
            </Button>

            <p data-testid="location-message" className="text-xs text-stone-500">
              {locationMessage?.trim()
                ? locationMessage
                : locationStatus === 'denied'
                  ? 'Location was denied, so results are not sorted by distance.'
                  : locationStatus === 'unavailable'
                    ? 'This browser cannot share a location.'
                    : 'Optional: share an approximate location to sort by distance.'}
            </p>
          </div>
        )}
      </div>

      <div className="sr-only" aria-live="polite">
        {Object.values(errors).join(' ')}
      </div>
    </section>
  );
}
