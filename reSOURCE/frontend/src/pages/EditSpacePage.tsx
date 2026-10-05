import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Alert from '../components/Alert';
import ButtonLink from '../components/ButtonLink';
import PageHeader from '../components/PageHeader';
import SpaceForm from '../components/SpaceForm';
import PhotoManager from '../components/PhotoManager';
import { EmptyPanel, ErrorPanel } from '../components/StatePanel';
import { useAuth } from '../hooks/useAuth';
import {
  deleteSpacePhoto,
  fetchSpace,
  reorderSpacePhotos,
  updateSpace,
  uploadSpacePhotos,
} from '../services/spaceService';
import type { AreaUnit, Facility, SpacePhoto } from '../types/space';
import { newPricingRow, toFormState, toPayload, type SpaceFormState } from '../utils/spaceForm';
import { validateSpaceForm, type SpaceFormDraft } from '../utils/validation';

type PageStatus = 'loading' | 'ready' | 'notfound' | 'error' | 'forbidden';

interface FlashState {
  flash?: string;
  flashTone?: 'success' | 'error';
}

export default function EditSpacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const flashState = (location.state as FlashState | null) ?? {};

  const [state, setState] = useState<SpaceFormState | null>(null);
  const [photos, setPhotos] = useState<SpacePhoto[]>([]);
  const [status, setStatus] = useState<PageStatus>(id ? 'loading' : 'notfound');
  const [retryToken, setRetryToken] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }

    const controller = new AbortController();

    fetchSpace(id, controller.signal)
      .then((space) => {
        setPhotos([...space.photos].sort((a, b) => a.displayOrder - b.displayOrder));

        if (!space.isOwner) {
          setStatus('forbidden');
          return;
        }

        setState(toFormState(space));
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        if (error instanceof Error && error.message === 'The request was cancelled.') {
          return;
        }

        const httpStatus = (error as { status?: number | null }).status ?? null;
        setStatus(httpStatus === 404 || httpStatus === 400 ? 'notfound' : 'error');
      });

    return () => controller.abort();
  }, [id, retryToken, user]);

  function retry() {
    setStatus('loading');
    setRetryToken((token) => token + 1);
  }

  function updateValues(patch: Partial<SpaceFormDraft>) {
    setState((current) =>
      current ? { ...current, values: { ...current.values, ...patch } } : current,
    );
  }

  function updatePricing(index: number, patch: Partial<SpaceFormDraft['pricing'][number]>) {
    setState((current) =>
      current
        ? {
            ...current,
            values: {
              ...current.values,
              pricing: current.values.pricing.map((row, position) =>
                position === index ? { ...row, ...patch } : row,
              ),
            },
          }
        : current,
    );
  }

  function addActivity() {
    setState((current) =>
      current
        ? {
            ...current,
            values: {
              ...current.values,
              pricing: [...current.values.pricing, newPricingRow()],
            },
          }
        : current,
    );
  }

  function removeActivity(index: number) {
    setState((current) =>
      current
        ? {
            ...current,
            values: {
              ...current.values,
              pricing: current.values.pricing.filter((_, position) => position !== index),
            },
          }
        : current,
    );
  }

  function toggleFacility(facility: Facility, checked: boolean) {
    setState((current) =>
      current
        ? {
            ...current,
            facilities: checked
              ? [...current.facilities, facility]
              : current.facilities.filter((entry) => entry !== facility),
          }
        : current,
    );
  }

  async function handleSubmit() {
    if (!state || !id) {
      return;
    }

    const validationErrors = validateSpaceForm(state.values);
    setErrors(validationErrors);
    setFormError(null);

    if (Object.keys(validationErrors).length > 0) {
      setFormError('Please fix the highlighted fields before saving.');
      return;
    }

    setSubmitting(true);

    try {
      await updateSpace(id, toPayload(state, { includeStatus: true }));
      navigate(`/spaces/${id}`, {
        state: { flash: 'Space updated successfully.', flashTone: 'success' },
      });
    } catch (error) {
      const apiError = error as { message?: string; fields?: Record<string, string> };

      if (apiError.fields && Object.keys(apiError.fields).length > 0) {
        setErrors(apiError.fields);
      }

      setFormError(apiError.message ?? 'The changes could not be saved. Please try again.');
      setSubmitting(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="animate-pulse space-y-6" role="status" aria-label="Loading listing">
          <div className="h-10 w-1/2 rounded-full bg-stone-200" />
          <div className="h-64 w-full rounded-3xl bg-stone-200" />
        </div>
      </div>
    );
  }

  if (status === 'notfound') {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <EmptyPanel
          title="This space is no longer available."
          description="It was deleted or never existed, so there is nothing to edit."
          action={
            <ButtonLink to="/spaces/mine" variant="primary">
              Back to my spaces
            </ButtonLink>
          }
        />
      </div>
    );
  }

  if (status === 'forbidden') {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <EmptyPanel
          title="You can only edit spaces you listed."
          description="This listing belongs to another owner. The reSOURCE API also rejects edits from anyone but the owner."
          action={
            <ButtonLink to={`/spaces/${id}`} variant="secondary">
              View the listing
            </ButtonLink>
          }
        />
      </div>
    );
  }

  if (status === 'error' || !state) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <ErrorPanel
          title="Unable to load this listing."
          description="The reSOURCE API could not be reached. Check your connection and try again."
          onRetry={retry}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <PageHeader
        eyebrow="Module 1"
        title="Edit space listing"
        description="Update the details, facilities, photos and per-activity pricing of your listing."
      />

      {flashState.flash ? (
        <div className="mt-6">
          <Alert tone={flashState.flashTone === 'error' ? 'error' : 'success'}>
            {flashState.flash}
          </Alert>
        </div>
      ) : null}

      <div className="mt-8">
        <SpaceForm
          mode="edit"
          values={state.values}
          errors={errors}
          onChange={updateValues}
          onPricingChange={updatePricing}
          onAddActivity={addActivity}
          onRemoveActivity={removeActivity}
          areaUnit={state.areaUnit}
          onAreaUnitChange={(unit: AreaUnit) => setState({ ...state, areaUnit: unit })}
          facilities={state.facilities}
          onToggleFacility={toggleFacility}
          status={state.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'}
          onStatusChange={(next) => setState({ ...state, status: next })}
          onSubmit={handleSubmit}
          onCancel={() => navigate(`/spaces/${id}`)}
          submitting={submitting}
          formError={formError}
          submitLabel="Save changes"
        >
          <PhotoManager
            photos={photos}
            inputId="edit-space-photos"
            busy={photoBusy}
            onUpload={async (files) => {
              setPhotoBusy(true);

              try {
                const updated = await uploadSpacePhotos(id ?? '', files);
                setPhotos([...updated.photos].sort((a, b) => a.displayOrder - b.displayOrder));
              } finally {
                setPhotoBusy(false);
              }
            }}
            onDelete={async (photoId) => {
              const updated = await deleteSpacePhoto(id ?? '', photoId);
              setPhotos([...updated.photos].sort((a, b) => a.displayOrder - b.displayOrder));
            }}
            onReorder={async (photoIds) => {
              const updated = await reorderSpacePhotos(id ?? '', photoIds);
              setPhotos([...updated.photos].sort((a, b) => a.displayOrder - b.displayOrder));
            }}
          />
        </SpaceForm>
      </div>
    </div>
  );
}
