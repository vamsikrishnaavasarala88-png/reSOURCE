import type { ReactNode } from 'react';
import AiRecognitionCard from './AiRecognitionCard';
import { NumberField, SelectField, TextAreaField } from './Fields';
import LocationPicker from './map/LocationPicker';
import FormField from './FormField';
import { MATERIAL_CATEGORY_OPTIONS, MATERIAL_CONDITION_OPTIONS, MATERIAL_UNIT_OPTIONS } from '../utils/materialOptions';
import type { MaterialFormDraft } from '../utils/validation';

interface MaterialFormProps {
  values: MaterialFormDraft;
  errors: Record<string, string>;
  onChange: (patch: Partial<MaterialFormDraft>) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
  /** Extra controls shown with pricing, e.g. the owner's pause switch. */
  statusField?: ReactNode;
  /** Photo tools, rendered once the listing exists. */
  photoSection?: ReactNode;
  /** What the recognition photo is for: the listing's main image, or analysis only. */
  recognitionPhotoRole?: 'main' | 'analysis';
  /** The recognition photo, when the page keeps it as the listing's main image. */
  onRecognitionPhoto?: (file: File | null) => void;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-stone-900">{title}</h2>
      {description ? <p className="mt-1 text-sm text-stone-600">{description}</p> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/**
 * The create/edit form for a material listing.
 *
 * <p>Everything the backend requires is asked for here: category, quantity with a
 * unit, the owner's own statement of condition, and either a price or "free".
 * Nothing is preselected on the owner's behalf, so a listing can never claim a
 * condition or a price the owner did not choose.</p>
 *
 * <p>The AI helper at the top is optional and always ends in a review: the
 * suggestion - including the description it writes from the photo - is applied
 * to these fields only when the owner accepts it, and the submit button is still
 * the only thing that saves.</p>
 */
export default function MaterialForm({
  values,
  errors,
  onChange,
  onSubmit,
  submitting,
  submitLabel,
  onCancel,
  statusField,
  photoSection,
  recognitionPhotoRole = 'analysis',
  onRecognitionPhoto,
}: MaterialFormProps) {
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <AiRecognitionCard
        onApply={onChange}
        photoRole={recognitionPhotoRole}
        onPhotoChosen={onRecognitionPhoto}
      />

      <Section
        title="Basic information"
        description="What the material is. The title is what people see first."
      >
        <div className="sm:col-span-2">
          <FormField
            id="material-title"
            label="Title"
            value={values.title}
            onChange={(value) => onChange({ title: value })}
            error={errors.title}
            placeholder="Red Clay Bricks"
            required
            maxLength={160}
          />
        </div>

        <SelectField
          id="material-category"
          label="Category"
          value={values.category}
          onChange={(value) => onChange({ category: value })}
          error={errors.category}
          required
          placeholderOption="Choose a category"
          options={MATERIAL_CATEGORY_OPTIONS.map((option) => ({ ...option }))}
        />

        <SelectField
          id="material-condition"
          label="Condition"
          value={values.condition}
          onChange={(value) => onChange({ condition: value })}
          error={errors.condition}
          required
          placeholderOption="Choose the condition"
          hint="Your own description of the material's state."
          options={MATERIAL_CONDITION_OPTIONS.map((option) => ({ ...option }))}
        />

        <div className="sm:col-span-2">
          <TextAreaField
            id="material-description"
            label="Description"
            value={values.description}
            onChange={(value) => onChange({ description: value })}
            error={errors.description}
            placeholder="Surplus red clay bricks from a compound wall project, clean and stacked for pickup."
            hint="Between 10 and 2000 characters."
            required
            rows={4}
            maxLength={2000}
          />
        </div>
      </Section>

      <Section
        title="Quantity"
        description="How much there is, in the unit you count it in. Nothing is guessed for you."
      >
        <NumberField
          id="material-quantity"
          label="Quantity"
          value={values.quantity}
          onChange={(value) => onChange({ quantity: value })}
          error={errors.quantity}
          placeholder="300"
          required
          min={0}
          step={0.01}
        />

        <div>
          <label htmlFor="material-unit" className="block text-sm font-medium text-stone-700">
            Unit<span className="ml-0.5 text-clay-600">*</span>
          </label>
          <input
            id="material-unit"
            name="material-unit"
            list="material-unit-options"
            value={values.unit}
            onChange={(event) => onChange({ unit: event.target.value })}
            placeholder="pieces"
            required
            className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
          <datalist id="material-unit-options">
            {MATERIAL_UNIT_OPTIONS.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
          {errors.unit ? (
            <p className="mt-1.5 text-xs font-medium text-red-600">{errors.unit}</p>
          ) : (
            <p className="mt-1.5 text-xs text-stone-500">
              Pick a common unit or type your own, for example “pieces” or “tonnes”.
            </p>
          )}
        </div>
      </Section>

      <Section
        title="Pricing"
        description="Free is your decision. A paid listing shows the price you type."
      >
        <label className="flex items-start gap-2.5 rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm text-stone-700">
          <input
            id="material-is-free"
            type="checkbox"
            checked={values.isFree}
            onChange={(event) => onChange({ isFree: event.target.checked })}
            className="mt-0.5 size-4 rounded border-stone-300 text-brand-600 focus:ring-brand-200"
          />
          <span>
            <span className="font-medium text-stone-800">Give this material away for free</span>
            <span className="mt-0.5 block text-xs text-stone-500">
              The listing shows a FREE badge and no price.
            </span>
          </span>
        </label>

        <NumberField
          id="material-price"
          label="Price (₹)"
          value={values.isFree ? '' : values.price}
          onChange={(value) => onChange({ price: value })}
          error={errors.price}
          disabled={values.isFree}
          placeholder="2000"
          min={0}
          step={0.01}
          hint={values.isFree ? 'Not needed while the material is free.' : 'Cannot be negative.'}
        />

        {statusField}
      </Section>

      <Section
        title="Location"
        description="Where the material can be collected from. A map pin is optional."
      >
        <div className="sm:col-span-2">
          <FormField
            id="material-address"
            label="Address"
            value={values.address}
            onChange={(value) => onChange({ address: value })}
            error={errors.address}
            placeholder="Jaggampeta, Andhra Pradesh"
            hint="A town or a pickup point is enough."
            required
            maxLength={300}
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

        <div className="sm:col-span-2">
          <TextAreaField
            id="material-owner-note"
            label="Owner note (optional)"
            value={values.ownerNote}
            onChange={(value) => onChange({ ownerNote: value })}
            error={errors.ownerNote}
            placeholder="Pickup on weekends; bring your own transport."
            rows={3}
            maxLength={1000}
          />
        </div>
      </Section>


      {photoSection}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-stone-800 ring-1 ring-stone-300 transition-colors hover:bg-stone-100"
          >
            Cancel
          </button>
        ) : null}
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
