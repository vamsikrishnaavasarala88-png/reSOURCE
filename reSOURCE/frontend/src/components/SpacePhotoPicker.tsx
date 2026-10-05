import { ImagePlus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from './Button';
import {
  ACCEPTED_PHOTO_MIME_TYPES,
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
} from '../utils/spacePhotos';

interface SpacePhotoPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  error?: string | null;
  disabled?: boolean;
}

/**
 * Local photo selection used when creating a listing. The files are uploaded
 * once the space exists, because photos are stored against a space id.
 */
export default function SpacePhotoPicker({
  files,
  onChange,
  error,
  disabled = false,
}: SpacePhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Object URLs for the previews, released as soon as the selection changes.
  const previews = useMemo(
    () => files.map((file) => URL.createObjectURL(file)),
    [files],
  );

  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);

  function handleFiles(selected: FileList | null) {
    if (!selected) {
      return;
    }

    const incoming = Array.from(selected);
    const accepted: File[] = [];

    for (const file of incoming) {
      if (!ACCEPTED_PHOTO_MIME_TYPES.includes(file.type)) {
        setLocalError(`${file.name} is not a JPEG, PNG or WebP image.`);
        continue;
      }

      if (file.size > MAX_PHOTO_BYTES) {
        setLocalError(`${file.name} is larger than 5 MB.`);
        continue;
      }

      accepted.push(file);
    }

    const room = MAX_PHOTOS - files.length;

    if (accepted.length > room) {
      setLocalError(`You can add up to ${MAX_PHOTOS} photos.`);
    }

    onChange([...files, ...accepted.slice(0, Math.max(room, 0))]);

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function removeAt(index: number) {
    setLocalError(null);
    onChange(files.filter((_, position) => position !== index));
  }

  const shownError = error ?? localError;

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        Add up to {MAX_PHOTOS} photos. The first one is used on search cards. JPEG, PNG or WebP,
        up to 5 MB each.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id="space-photos"
          type="file"
          accept={ACCEPTED_PHOTO_TYPES}
          multiple
          disabled={disabled || files.length >= MAX_PHOTOS}
          onChange={(event) => handleFiles(event.target.files)}
          className="sr-only"
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || files.length >= MAX_PHOTOS}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-4" aria-hidden="true" />
          Choose photos
        </Button>

        <span className="text-xs text-stone-500">
          {files.length} of {MAX_PHOTOS} selected
        </span>
      </div>

      {shownError ? (
        <p className="text-xs font-medium text-red-600" role="alert">
          {shownError}
        </p>
      ) : null}

      {previews.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {previews.map((url, index) => (
            <li
              key={url}
              className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-stone-200 bg-stone-100"
            >
              <img src={url} alt={`Selected photo ${index + 1}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label={`Remove photo ${index + 1}`}
                className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-stone-700 shadow-sm hover:bg-white"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
