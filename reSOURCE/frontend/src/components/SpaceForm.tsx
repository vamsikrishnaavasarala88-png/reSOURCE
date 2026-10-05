import { CirclePlus, Trash2 } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import Button from './Button';
import { CheckboxChip, NumberField, SelectField, TextAreaField } from './Fields';
import LocationPicker from './map/LocationPicker';
import FormField from './FormField';
import type { ActivityType, AreaUnit, Facility } from '../types/space';
import { ACTIVITY_OPTIONS, AREA_UNIT_OPTIONS, FACILITY_OPTIONS } from '../utils/spaceOptions';
import type { SpaceFormDraft } from '../utils/validation';

export interface SpaceFormProps {
  mode: 'create' | 'edit';
  values: SpaceFormDraft;
  errors: Record<string, string>;
  onChange: (patch: Partial<SpaceFormDraft>) => void;
  onPricingChange: (index: number, patch: Partial<SpaceFormDraft['pricing'][number]>) => void;
  onAddActivity: () => void;
  onRemoveActivity: (index: number) => void;
  areaUnit: AreaUnit;
  onAreaUnitChange: (unit: AreaUnit) => void;
  facilities: Facility[];
  onToggleFacility: (facility: Facility, checked: boolean) => void;
  status: 'ACTIVE' | 'INACTIVE';
  onStatusChange: (status: 'ACTIVE' | 'INACTIVE') => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  formError?: string | null;
  submitLabel: string;
  /** Photo tools; on create the space does not exist yet, on edit it does. */
  children?: ReactNode;
}

/**
 * Shared create/edit form for a space listing. The owner is taken from the
 * access token on the server, so no owner field is ever collected here.
 */
export default function SpaceForm({
  mode,
  values,
  errors,
  onChange,
  onPricingChange,
  onAddActivity,
  onRemoveActivity,
  areaUnit,
  onAreaUnitChange,
  facilities,
  onToggleFacility,
  status,
  onStatusChange,
  onSubmit,
  onCancel,
  submitting,
  formError,
  submitLabel,
  children,
}: SpaceFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  const usedActivities = values.pricing.map((row) => row.activityType);

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {formError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {formError}
        </div>
      ) : null}

      <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-stone-900">Basic information</h2>
        <p className="mt-1 text-sm text-stone-600">
          Describe the space the way you would tell someone about it.
        </p>

        <div className="mt-4 space-y-4">
          <FormField
            id="title"
            label="Title"
            value={values.title}
            onChange={(value) => onChange({ title: value })}
            placeholder="Community Ground"
            error={errors.title}
            required
          />

          <TextAreaField
            id="description"
            label="Description"
            value={values.description}
            onChange={(value) => onChange({ description: value })}
            placeholder="Open ground with a shaded entrance, suitable for markets and community events."
            hint="What the space is like, what it is good for, anything a visitor should know."
            error={errors.description}
            required
            rows={5}
            maxLength={2000}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-stone-900">Location</h2>
        <p className="mt-1 text-sm text-stone-600">
          Type the address as people would search for it. A map pin is optional and only used to
          work out distances — the space publishes either way.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <FormField
              id="address"
              label="Address"
              value={values.address}
              onChange={(value) => onChange({ address: value })}
              placeholder="Near Sivalayam Street, Bhimavaram, Andhra Pradesh"
              error={errors.address}
              required
            />
          </div>

          <LocationPicker
            latitude={coordinateNumber(values.latitude)}
            longitude={coordinateNumber(values.longitude)}
            onChange={(coordinates) =>
              onChange({
                latitude: coordinates ? String(coordinates.latitude) : '',
                longitude: coordinates ? String(coordinates.longitude) : '',
              })
            }
          />

          <FormField
            id="availability"
            label="Availability"
            value={values.availability}
            onChange={(value) => onChange({ availability: value })}
            placeholder="Weekends and public holidays"
            error={errors.availability}
            hint="Optional. When the space can usually be used."
          />
        </div>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-stone-900">Size and capacity</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <NumberField
            id="area"
            label="Area"
            value={values.area}
            onChange={(value) => onChange({ area: value })}
            placeholder="1.5"
            error={errors.area}
            min={0}
            step={0.01}
            required
          />

          <SelectField
            id="areaUnit"
            label="Area unit"
            value={areaUnit}
            onChange={(value) => onAreaUnitChange(value as AreaUnit)}
            options={AREA_UNIT_OPTIONS}
            required
          />

          <NumberField
            id="capacity"
            label="Capacity (people)"
            value={values.capacity}
            onChange={(value) => onChange({ capacity: value })}
            placeholder="500"
            error={errors.capacity}
            min={1}
            required
          />
        </div>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-stone-900">Facilities</h2>
        <p className="mt-1 text-sm text-stone-600">
          Tick everything the space offers. Visitors can filter on these.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {FACILITY_OPTIONS.map((facility) => (
            <CheckboxChip
              key={facility.value}
              id={`facility-${facility.value}`}
              label={facility.label}
              checked={facilities.includes(facility.value)}
              onChange={(checked) => onToggleFacility(facility.value, checked)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Activities and pricing</h2>
            <p className="mt-1 text-sm text-stone-600">
              Set a price per activity. You alone decide which activities are free.
            </p>
          </div>

          <Button variant="secondary" size="sm" onClick={onAddActivity}>
            <CirclePlus className="size-4" aria-hidden="true" />
            Add activity
          </Button>
        </div>

        {errors.pricing ? (
          <p className="mt-3 text-xs font-medium text-red-600">{errors.pricing}</p>
        ) : null}

        <ul className="mt-4 space-y-4">
          {values.pricing.map((row, index) => {
            const priceError = errors[`pricing[${index}].price`];
            const activityError = errors[`pricing[${index}].activityType`];

            const options = ACTIVITY_OPTIONS.filter(
              (option) =>
                option.value === row.activityType || !usedActivities.includes(option.value),
            );

            return (
              <li
                key={row.id}
                className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    id={`pricing-${index}-activity`}
                    label="Activity"
                    value={row.activityType}
                    onChange={(value) =>
                      onPricingChange(index, { activityType: value as ActivityType })
                    }
                    options={options}
                    placeholderOption="Choose an activity"
                    error={activityError}
                  />

                  <NumberField
                    id={`pricing-${index}-price`}
                    label="Price (₹)"
                    value={row.isFree ? '' : row.price}
                    onChange={(value) => onPricingChange(index, { price: value })}
                    placeholder={row.isFree ? 'Free' : '500'}
                    min={0}
                    step={1}
                    disabled={row.isFree}
                    error={priceError}
                    hint={row.isFree ? 'This activity is listed as free.' : undefined}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckboxChip
                      id={`pricing-${index}-free`}
                      label="Free for this activity"
                      checked={row.isFree}
                      onChange={(checked) => onPricingChange(index, { isFree: checked })}
                    />

                    <div className="min-w-[13rem] flex-1">
                      <FormField
                        id={`pricing-${index}-note`}
                        label="Note for this activity"
                        value={row.ownerNote}
                        onChange={(value) => onPricingChange(index, { ownerNote: value })}
                        placeholder="Optional, e.g. free for camps"
                      />
                    </div>
                  </div>

                  {values.pricing.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveActivity(index)}
                      aria-label={`Remove activity ${index + 1}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Remove
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-stone-900">Owner note</h2>
        <p className="mt-1 text-sm text-stone-600">
          Shown on the listing. A good place for conditions such as cleaning after use.
        </p>

        <div className="mt-4">
          <TextAreaField
            id="ownerNote"
            label="Note"
            value={values.ownerNote}
            onChange={(value) => onChange({ ownerNote: value })}
            placeholder="Medical camps and blood donation camps are free."
            error={errors.ownerNote}
            rows={3}
            maxLength={1000}
          />
        </div>

        {mode === 'edit' ? (
          <div className="mt-4 sm:max-w-xs">
            <SelectField
              id="status"
              label="Listing status"
              value={status}
              onChange={(value) => onStatusChange(value as 'ACTIVE' | 'INACTIVE')}
              options={[
                { value: 'ACTIVE', label: 'Active — visible in search' },
                { value: 'INACTIVE', label: 'Paused — hidden from search' },
              ]}
              hint="Pausing keeps the listing and its pricing in your dashboard."
            />
          </div>
        ) : null}
      </section>

      {children ? (
        <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-stone-900">Photos</h2>
          <div className="mt-4">{children}</div>
        </section>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting} loadingLabel="Saving…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** `''` means "no pin"; anything unreadable is treated the same way. */
function coordinateNumber(text: string): number | null {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  const value = Number(trimmed);

  return Number.isFinite(value) ? value : null;
}
