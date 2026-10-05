import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { resolveMediaUrl } from '../api/client';
import Alert from './Alert';
import Button from './Button';
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTOS } from '../utils/spacePhotos';

/** The only shape the manager needs; space and material photos both provide it. */
export interface ManagedPhoto {
  id: number;
  imageUrl: string;
  displayOrder: number;
}

interface PhotoManagerProps {
  photos: ManagedPhoto[];
  /** Id of the hidden file input, unique per page. */
  inputId: string;
  onUpload: (files: File[]) => Promise<void>;
  onDelete: (photoId: number) => Promise<void>;
  onReorder: (photoIds: number[]) => Promise<void>;
  busy: boolean;
}

/**
 * Photo tools for an existing listing: upload, remove and reorder. Every action
 * talks to the API immediately, so nothing depends on the form being saved.
 *
 * <p>Shared by the space and material marketplaces - there is one image store
 * and one manager, not two.</p>
 */
export default function PhotoManager({
  photos,
  inputId,
  onUpload,
  onDelete,
  onReorder,
  busy,
}: PhotoManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);

  const ordered = [...photos].sort((a, b) => a.displayOrder - b.displayOrder);

  async function upload(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    setError(null);

    try {
      await onUpload(Array.from(files));
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : 'The photos could not be uploaded.',
      );
    } finally {
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  async function remove(photo: ManagedPhoto) {
    setError(null);
    setWorkingId(photo.id);

    try {
      await onDelete(photo.id);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'The photo could not be removed.',
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...ordered];
    const target = index + direction;

    if (target < 0 || target >= next.length) {
      return;
    }

    [next[index], next[target]] = [next[target], next[index]];

    setError(null);
    setReordering(true);

    try {
      await onReorder(next.map((photo) => photo.id));
    } catch (reorderError) {
      setError(
        reorderError instanceof Error ? reorderError.message : 'The photo order was not saved.',
      );
    } finally {
      setReordering(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        {ordered.length === 0
          ? 'No photos yet. The first photo becomes the search card image.'
          : 'The first photo is used on search cards. Use the arrows to change the order.'}
      </p>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {ordered.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ordered.map((photo, index) => {
            const url = resolveMediaUrl(photo.imageUrl);

            return (
              <li
                key={photo.id}
                className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-stone-200 bg-stone-100"
              >
                {url ? (
                  <img
                    src={url}
                    alt={`Photo ${index + 1}`}
                    className="size-full object-cover"
                  />
                ) : null}

                {index === 0 ? (
                  <span className="absolute left-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
                    Main
                  </span>
                ) : null}

                <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0 || busy || reordering}
                      aria-label={`Move photo ${index + 1} earlier`}
                      className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-stone-700 shadow-sm hover:bg-white disabled:opacity-40"
                    >
                      <ArrowLeft className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === ordered.length - 1 || busy || reordering}
                      aria-label={`Move photo ${index + 1} later`}
                      className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-stone-700 shadow-sm hover:bg-white disabled:opacity-40"
                    >
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(photo)}
                    disabled={busy || workingId === photo.id}
                    aria-label={`Delete photo ${index + 1}`}
                    className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-sm hover:bg-white disabled:opacity-40"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_PHOTO_TYPES}
          multiple
          disabled={busy || ordered.length >= MAX_PHOTOS}
          onChange={(event) => upload(event.target.files)}
          className="sr-only"
        />
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          loadingLabel="Uploading…"
          disabled={ordered.length >= MAX_PHOTOS}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-4" aria-hidden="true" />
          Add photos
        </Button>

        <span className="text-xs text-stone-500">
          {ordered.length} of {MAX_PHOTOS} photos used
        </span>
      </div>
    </div>
  );
}
