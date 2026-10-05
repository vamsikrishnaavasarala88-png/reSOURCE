import { ImagePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Alert from '../components/Alert';
import MaterialForm from '../components/MaterialForm';
import PageHeader from '../components/PageHeader';
import { createMaterial, uploadMaterialPhotos } from '../services/materialService';
import { emptyMaterialDraft, toMaterialPayload } from '../utils/materialForm';
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTOS } from '../utils/spacePhotos';
import { validateMaterialForm, type MaterialFormDraft } from '../utils/validation';

/**
 * Lists a new material. The owner comes from the access token, never the form.
 *
 * <p>The photo chosen for the AI suggestion is the listing's main image: one
 * picture is enough to publish, and it is the one the marketplace card shows.
 * Anything else the owner wants to add is optional and goes below it, in the
 * order they picked the files - both sets are uploaded straight after the
 * listing is created, through the same image store the space marketplace uses.</p>
 */
export default function CreateMaterialPage() {
  const navigate = useNavigate();

  const [values, setValues] = useState<MaterialFormDraft>(emptyMaterialDraft());
  const [mainPhoto, setMainPhoto] = useState<File | null>(null);
  const [extraPhotos, setExtraPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(patch: Partial<MaterialFormDraft>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  /** Keeps the optional set within the limit, main photo first. */
  function chooseExtraPhotos(files: FileList | null) {
    setPhotoError(null);

    if (!files?.length) {
      return;
    }

    const room = MAX_PHOTOS - (mainPhoto ? 1 : 0);
    const chosen = Array.from(files);

    if (chosen.length > room) {
      setPhotoError(`A listing can hold ${MAX_PHOTOS} photos, so ${room} more can be added here.`);
    }

    setExtraPhotos(chosen.slice(0, Math.max(room, 0)));
  }

  async function handleSubmit() {
    const validationErrors = validateMaterialForm(values);
    setErrors(validationErrors);
    setFormError(null);

    if (Object.keys(validationErrors).length > 0) {
      setFormError('Please fix the highlighted fields before publishing.');
      return;
    }

    setSubmitting(true);

    try {
      const created = await createMaterial(toMaterialPayload(values));

      // Main image first, so the marketplace card shows the photo the owner
      // picked at the top of the form.
      const photos = [...(mainPhoto ? [mainPhoto] : []), ...extraPhotos].slice(0, MAX_PHOTOS);
      let photoWarning = false;

      if (photos.length > 0) {
        try {
          await uploadMaterialPhotos(created.id, photos);
        } catch {
          photoWarning = true;
        }
      }

      if (photoWarning) {
        navigate(`/materials/${created.id}`, {
          state: {
            flash: 'Material published, but the photos could not be uploaded. Add them from the edit page.',
            flashTone: 'error',
          },
        });
        return;
      }

      navigate(`/materials/${created.id}`, {
        state: { flash: 'Material published successfully.', flashTone: 'success' },
      });
    } catch (error) {
      const apiError = error as { message?: string; fields?: Record<string, string> };

      if (apiError.fields) {
        setErrors(apiError.fields);
      }

      setFormError(apiError.message ?? 'The listing could not be published.');
    } finally {
      setSubmitting(false);
    }
  }

  const remaining = Math.max(MAX_PHOTOS - (mainPhoto ? 1 : 0), 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        to="/materials"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to materials
      </Link>

      <PageHeader
        eyebrow="Module 2"
        title="List surplus material"
        description="Describe what you no longer need. Quantity, unit and condition come from you — nothing is guessed."
      />

      <div className="mt-8 space-y-5">
        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <MaterialForm
          values={values}
          errors={errors}
          onChange={update}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Publish listing"
          onCancel={() => navigate('/materials')}
          recognitionPhotoRole="main"
          onRecognitionPhoto={setMainPhoto}
          photoSection={
            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-semibold text-stone-900">
                More photos <span className="font-normal text-stone-500">(optional)</span>
              </h2>
              <p className="mt-1 text-sm text-stone-600">
                One photo is enough to publish. Add more than one only if it helps — they appear
                after the main photo, and you can reorder or remove them later.
              </p>

              <div className="mt-4">
                <label
                  htmlFor="material-extra-photos"
                  className="block text-sm font-medium text-stone-700"
                >
                  Extra photos
                </label>
                <input
                  id="material-extra-photos"
                  type="file"
                  accept={ACCEPTED_PHOTO_TYPES}
                  multiple
                  onChange={(event) => {
                    chooseExtraPhotos(event.target.files);
                    event.target.value = '';
                  }}
                  className="mt-1.5 block w-full cursor-pointer rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 file:mr-3 file:rounded-full file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-200"
                />
                <p className="mt-1 text-xs text-stone-500">
                  JPEG, PNG or WebP, up to 5 MB each. {remaining} more can be added
                  {mainPhoto ? ' besides your main photo' : ''}.
                </p>
              </div>

              {photoError ? (
                <p className="mt-3 text-xs font-medium text-red-600">{photoError}</p>
              ) : null}

              {extraPhotos.length > 0 ? (
                <ul className="mt-4 space-y-2" data-testid="material-extra-photo-list">
                  {extraPhotos.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700"
                    >
                      <span className="truncate">
                        {index + 2}. {file.name}
                        <span className="ml-2 text-xs text-stone-500">
                          {(file.size / 1024).toFixed(0)} KB
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setExtraPhotos((current) =>
                            current.filter((_, position) => position !== index),
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-200"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 flex items-center gap-1.5 text-xs text-stone-500">
                  <ImagePlus className="size-3.5" aria-hidden="true" />
                  No extra photos chosen — the listing goes live with its main photo.
                </p>
              )}
            </section>
          }
        />
      </div>
    </div>
  );
}
