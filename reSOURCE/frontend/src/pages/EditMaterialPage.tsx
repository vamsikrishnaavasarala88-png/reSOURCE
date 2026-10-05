import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Alert from '../components/Alert';
import ButtonLink from '../components/ButtonLink';
import MaterialForm from '../components/MaterialForm';
import PageHeader from '../components/PageHeader';
import PhotoManager from '../components/PhotoManager';
import { EmptyPanel, ErrorPanel } from '../components/StatePanel';
import {
  deleteMaterialPhoto,
  fetchMaterial,
  reorderMaterialPhotos,
  updateMaterial,
  uploadMaterialPhotos,
} from '../services/materialService';
import type { MaterialPhoto } from '../types/material';
import { materialDraftFrom, toMaterialPayload } from '../utils/materialForm';
import { MAX_PHOTOS } from '../utils/spacePhotos';
import { validateMaterialForm, type MaterialFormDraft } from '../utils/validation';

type LoadStatus = 'loading' | 'ready' | 'missing' | 'forbidden' | 'error';

/** Edits a listing the signed-in user owns, including pausing and photos. */
export default function EditMaterialPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const flashState =
    (location.state as { flash?: string; flashTone?: 'success' | 'error' } | null) ?? {};

  const [values, setValues] = useState<MaterialFormDraft | null>(null);
  const [status, setStatus] = useState<LoadStatus>(id ? 'loading' : 'missing');
  const [isActive, setIsActive] = useState(true);
  const [photos, setPhotos] = useState<MaterialPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    if (!id) {
      return () => controller.abort();
    }

    fetchMaterial(id, controller.signal)
      .then((material) => {
        if (!material.isOwner) {
          setStatus('forbidden');
          return;
        }

        setValues(materialDraftFrom(material));
        setPhotos(material.photos);
        setIsActive(material.status === 'ACTIVE');
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (error instanceof Error && error.message === 'The request was cancelled.') {
          return;
        }

        const code = (error as { status?: number | null }).status ?? null;
        setStatus(code === 404 ? 'missing' : code === 403 ? 'forbidden' : 'error');
      });

    return () => controller.abort();
  }, [id, retryToken]);

  const reload = useCallback(() => {
    setStatus('loading');
    setRetryToken((token) => token + 1);
  }, []);

  function update(patch: Partial<MaterialFormDraft>) {
    setValues((current) => (current ? { ...current, ...patch } : current));
  }

  async function handleSubmit() {
    if (!values || !id) {
      return;
    }

    const validationErrors = validateMaterialForm(values);
    setErrors(validationErrors);
    setFormError(null);

    if (Object.keys(validationErrors).length > 0) {
      setFormError('Please fix the highlighted fields before saving.');
      return;
    }

    setSubmitting(true);

    try {
      await updateMaterial(id, toMaterialPayload(values, isActive ? 'ACTIVE' : 'INACTIVE'));
      navigate(`/materials/${id}`, {
        state: { flash: 'Material updated successfully.', flashTone: 'success' },
      });
    } catch (error) {
      const apiError = error as { message?: string; fields?: Record<string, string> };

      if (apiError.fields) {
        setErrors(apiError.fields);
      }

      setFormError(apiError.message ?? 'The changes could not be saved.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpload(files: File[]) {
    if (!id) {
      return;
    }

    setPhotoBusy(true);

    try {
      const updated = await uploadMaterialPhotos(id, files);
      setPhotos(updated.photos.slice(0, MAX_PHOTOS));
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'The photos could not be uploaded. Please try again.',
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleDeletePhoto(photoId: number) {
    if (!id) {
      return;
    }

    setPhotoBusy(true);

    try {
      const updated = await deleteMaterialPhoto(id, photoId);
      setPhotos(updated.photos);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The photo could not be removed.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleReorder(photoIds: number[]) {
    if (!id) {
      return;
    }

    // Optimistic: the manager already moved the row on screen.
    setPhotos((current) =>
      photoIds
        .map((photoId, index) => {
          const photo = current.find((entry) => entry.id === photoId);

          return photo ? { ...photo, displayOrder: index } : null;
        })
        .filter((photo): photo is MaterialPhoto => photo !== null),
    );
    setPhotoBusy(true);

    try {
      const updated = await reorderMaterialPhotos(id, photoIds);
      setPhotos(updated.photos);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The photo order could not be saved.');
      reload();
    } finally {
      setPhotoBusy(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="animate-pulse space-y-4" role="status" aria-label="Loading the material">
          <div className="h-8 w-1/3 rounded-full bg-stone-200" />
          <div className="h-40 w-full rounded-3xl bg-stone-200" />
          <div className="h-40 w-full rounded-3xl bg-stone-200" />
        </div>
      </div>
    );
  }

  if (status === 'missing' || status === 'forbidden' || !values) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        {status === 'error' ? (
          <ErrorPanel
            title="Unable to load this material."
            description="The reSOURCE API could not be reached. Check your connection and try again."
            onRetry={reload}
          />
        ) : (
          <EmptyPanel
            title={status === 'forbidden' ? 'Only the owner can edit this listing.' : 'Material not found.'}
            description={
              status === 'forbidden'
                ? 'You can still view it, or list your own surplus material.'
                : 'It may have been removed by its owner, or the link is not valid.'
            }
            action={
              <ButtonLink
                to={status === 'forbidden' && id ? `/materials/${id}` : '/materials'}
                variant="primary"
              >
                {status === 'forbidden' ? 'View listing' : 'Back to materials'}
              </ButtonLink>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        to={`/materials/${id}`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to listing
      </Link>

      <PageHeader
        eyebrow="Module 2"
        title="Edit material listing"
        description="Update what you listed. Photos can be added, reordered or removed at any time."
      />

      <div className="mt-8 space-y-5">
        {flashState.flash ? (
          <Alert tone={flashState.flashTone === 'error' ? 'error' : 'success'}>
            {flashState.flash}
          </Alert>
        ) : null}

        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <MaterialForm
          values={values}
          errors={errors}
          onChange={update}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Save changes"
          onCancel={() => navigate(`/materials/${id}`)}
          recognitionPhotoRole="analysis"
          statusField={
            <label className="flex items-start gap-2.5 rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm text-stone-700">
              <input
                id="material-status-active"
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="mt-0.5 size-4 rounded border-stone-300 text-brand-600 focus:ring-brand-200"
              />
              <span>
                <span className="font-medium text-stone-800">Listed in the marketplace</span>
                <span className="mt-0.5 block text-xs text-stone-500">
                  Turn this off to pause the listing. It stays in your dashboard but is hidden from
                  searches.
                </span>
              </span>
            </label>
          }
          photoSection={
            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-semibold text-stone-900">Photos</h2>
              <p className="mt-1 mb-4 text-sm text-stone-600">
                Up to {MAX_PHOTOS} photos. The first one is the main image used on the marketplace
                card — reorder to change which photo that is.
              </p>

              <PhotoManager
                photos={photos}
                inputId="material-photos"
                busy={photoBusy}
                onUpload={handleUpload}
                onDelete={handleDeletePhoto}
                onReorder={handleReorder}
              />

              <p className="mt-4 flex items-start gap-2 rounded-xl bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-stone-600">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-stone-400" aria-hidden="true" />
                Photos are stored by the same service the space marketplace uses, converted to a
                web-friendly size and format on upload.
              </p>
            </section>
          }
        />
      </div>
    </div>
  );
}
