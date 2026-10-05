import { Crosshair, Filter, RotateCcw, X } from 'lucide-react';
import Button from './Button';
import { CheckboxChip, NumberField, SelectField } from './Fields';
import type { ActivityType, Facility, SpaceSort } from '../types/space';
import { ACTIVITY_OPTIONS, FACILITY_OPTIONS } from '../utils/spaceOptions';
import {
  RADIUS_OPTIONS,
  SORT_OPTIONS,
  type LocationStatus,
  type SpaceFilterDraft,
  type UserLocation,
} from '../utils/spaceFilters';

interface SpaceFiltersProps {
  draft: SpaceFilterDraft;
  errors: Record<string, string>;
  onChange: (patch: Partial<SpaceFilterDraft>) => void;
  onReset: () => void;
  activeCount: number;
  location: UserLocation | null;
  locationStatus: LocationStatus;
  /** A sentence from the location service, already written for a person. */
  locationMessage?: string | null;
  onRequestLocation: () => void;
  onClearLocation: () => void;
}

/** Structured filters for the space search. No free-text search is offered. */
export default function SpaceFilters({
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
}: SpaceFiltersProps) {
  function toggleFacility(facility: Facility, checked: boolean) {
    onChange({
      facilities: checked
        ? [...draft.facilities, facility]
        : draft.facilities.filter((entry) => entry !== facility),
    });
  }

  return (
    <section
      aria-label="Search filters"
      className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900">
          <Filter className="size-4 text-brand-700" aria-hidden="true" />
          Filter spaces
        </h2>

        {activeCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Clear filters ({activeCount})
          </Button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          id="filter-activity"
          label="Activity"
          value={draft.activity}
          onChange={(value) => onChange({ activity: value as ActivityType | '' })}
          options={ACTIVITY_OPTIONS}
          placeholderOption="Any activity"
        />

        <NumberField
          id="filter-max-price"
          label="Maximum price (₹)"
          value={draft.maxPrice}
          onChange={(value) => onChange({ maxPrice: value })}
          placeholder="Any budget"
          min={0}
          error={errors.maxPrice}
          hint="Enter 0 to see free-only listings."
        />

        <NumberField
          id="filter-min-capacity"
          label="Minimum capacity"
          value={draft.minCapacity}
          onChange={(value) => onChange({ minCapacity: value })}
          placeholder="Any size"
          min={1}
          error={errors.minCapacity}
          hint="People the space must hold."
        />

        <div className="grid grid-cols-2 gap-3">
          <NumberField
            id="filter-min-area"
            label="Min area (sq ft)"
            value={draft.minArea}
            onChange={(value) => onChange({ minArea: value })}
            placeholder="Any"
            min={0}
            error={errors.minArea}
          />
          <NumberField
            id="filter-max-area"
            label="Max area (sq ft)"
            value={draft.maxArea}
            onChange={(value) => onChange({ maxArea: value })}
            min={0}
            error={errors.maxArea}
          />
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-stone-700">Facilities</legend>
        <p className="mt-1 text-xs text-stone-500">
          A space must offer every facility you select.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {FACILITY_OPTIONS.map((facility) => (
            <CheckboxChip
              key={facility.value}
              id={`filter-facility-${facility.value}`}
              label={facility.label}
              checked={draft.facilities.includes(facility.value)}
              onChange={(checked) => toggleFacility(facility.value, checked)}
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 border-t border-stone-100 pt-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-stone-700">Distance</span>

          {location ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-800">
                  <Crosshair className="size-3.5" aria-hidden="true" />
                  {location.approximate ? 'Approximate location in use' : 'Current location in use'}
                </span>
                <Button variant="ghost" size="sm" onClick={onClearLocation}>
                  <X className="size-3.5" aria-hidden="true" />
                  Clear
                </Button>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <label htmlFor="filter-radius" className="text-sm font-medium text-stone-700">
                  Within
                </label>
                <select
                  id="filter-radius"
                  value={draft.radiusKm}
                  onChange={(event) => onChange({ radiusKm: event.target.value })}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none"
                >
                  {RADIUS_OPTIONS.map((radius) => (
                    <option key={radius} value={radius}>
                      {radius} km
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Button variant="secondary" size="sm" onClick={onRequestLocation}>
                <Crosshair className="size-3.5" aria-hidden="true" />
                Use my location
              </Button>
              <p data-testid="location-message" className="text-xs text-stone-500">
                {locationMessage?.trim()
                  ? locationMessage
                  : locationStatus === 'requesting'
                    ? 'Waiting for your browser to share a location…'
                    : locationStatus === 'denied'
                      ? 'Location permission was denied. Results are shown without distances.'
                      : locationStatus === 'unavailable'
                        ? 'Your device did not provide a location. Results are shown without distances.'
                        : 'Optional. Nearby spaces are found using an approximate location.'}
              </p>
            </div>
          )}
        </div>

        <SelectField
          id="filter-sort"
          label="Sort by"
          value={draft.sort}
          onChange={(value) => onChange({ sort: value as SpaceSort })}
          options={SORT_OPTIONS.filter(
            (option) => option.value !== 'distance' || Boolean(location),
          )}
        />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-stone-500">
        Searches look at area, capacity, activities, facilities and distance — never at the
        description text.
      </p>
    </section>
  );
}
