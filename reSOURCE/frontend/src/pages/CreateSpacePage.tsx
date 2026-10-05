import { ArrowLeft, LayoutPanelTop, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Alert from '../components/Alert';
import PageHeader from '../components/PageHeader';
import SpaceForm from '../components/SpaceForm';
import SpacePhotoPicker from '../components/SpacePhotoPicker';
import { useAuth } from '../hooks/useAuth';
import { createSpace, uploadSpacePhotos } from '../services/spaceService';
import type { AreaUnit, Facility } from '../types/space';
import { emptySpaceDraft, newPricingRow, toPayload, type SpaceFormState } from '../utils/spaceForm';
import { MAX_PHOTOS } from '../utils/spacePhotos';
import { validateSpaceForm, type SpaceFormDraft } from '../utils/validation';

export default function CreateSpacePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [state, setState] = useState<SpaceFormState>({
    values: emptySpaceDraft(),
    areaUnit: 'ACRES',
    facilities: [],
    status: 'ACTIVE',
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateValues(patch: Partial<SpaceFormDraft>) {
    setState((current) => ({ ...current, values: { ...current.values, ...patch } }));
  }

  function updatePricing(index: number, patch: Partial<SpaceFormDraft['pricing'][number]>) {
    setState((current) => ({
      ...current,
      values: {
        ...current.values,
        pricing: current.values.pricing.map((row, position) =>
          position === index ? { ...row, ...patch } : row,
        ),
      },
    }));
  }

  function addActivity() {
    setState((current) => ({
      ...current,
      values: { ...current.values, pricing: [...current.values.pricing, newPricingRow()] },
    }));
  }

  function removeActivity(index: number) {
    setState((current) => ({
      ...current,
      values: {
        ...current.values,
        pricing: current.values.pricing.filter((_, position) => position !== index),
      },
    }));
  }

  function toggleFacility(facility: Facility, checked: boolean) {
    setState((current) => ({
      ...current,
      facilities: checked
        ? [...current.facilities, facility]
        : current.facilities.filter((entry) => entry !== facility),
    }));
  }

  async function handleSubmit() {
    const validationErrors = validateSpaceForm(state.values);
    setErrors(validationErrors);
    setFormError(null);

    if (Object.keys(validationErrors).length > 0) {
      setFormError('Please fix the highlighted fields before saving.');
      return;
    }

    setSubmitting(true);

    try {
      const created = await createSpace(toPayload(state, { includeStatus: false }));
      let photoWarning = false;

      if (photos.length > 0) {
        try {
          await uploadSpacePhotos(created.id, photos.slice(0, MAX_PHOTOS));
        } catch {
          photoWarning = true;
        }
      }

      if (photoWarning) {
        navigate(`/spaces/${created.id}/edit`, {
          state: {
            flash: 'Space listed successfully, but the photos could not be uploaded. Add them again below.',
            flashTone: 'error',
          },
        });
        return;
      }

      navigate(`/spaces/${created.id}`, {
        state: { flash: 'Space listed successfully.', flashTone: 'success' },
      });
    } catch (error) {
      const apiError = error as { message?: string; fields?: Record<string, string> };

      if (apiError.fields && Object.keys(apiError.fields).length > 0) {
        setErrors(apiError.fields);
      }

      setFormError(apiError.message ?? 'The space could not be listed. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        to="/spaces"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to spaces
      </Link>

      <PageHeader
        eyebrow="Module 1"
        title="List a space"
        description="Describe the space, its facilities and what it costs per activity. You decide which activities are free."
      />

      {!user ? (
        <div className="mt-6">
          <Alert tone="error">Sign in to list a space.</Alert>
        </div>
      ) : null}

      <div className="mt-8">
        <SpaceForm
          mode="create"
          values={state.values}
          errors={errors}
          onChange={updateValues}
          onPricingChange={updatePricing}
          onAddActivity={addActivity}
          onRemoveActivity={removeActivity}
          areaUnit={state.areaUnit}
          onAreaUnitChange={(unit: AreaUnit) => setState((current) => ({ ...current, areaUnit: unit }))}
          facilities={state.facilities}
          onToggleFacility={toggleFacility}
          status="ACTIVE"
          onStatusChange={() => undefined}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/spaces')}
          submitting={submitting}
          formError={formError}
          submitLabel="List space"
        >
          <SpacePhotoPicker
            files={photos}
            onChange={(files) => {
              setPhotos(files);
              setPhotoError(null);
            }}
            error={photoError}
            disabled={submitting}
          />

          {photoError ? null : (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-stone-500">
              <LayoutPanelTop className="size-3.5" aria-hidden="true" />
              Photos are uploaded right after the listing is saved.
            </p>
          )}
        </SpaceForm>
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-stone-500">
        <Plus className="size-3.5" aria-hidden="true" />
        Only you can edit or delete this listing later.
      </p>
    </div>
  );
}
