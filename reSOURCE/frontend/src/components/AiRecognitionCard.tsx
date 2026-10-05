import { Camera, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from './Button';
import type { AiOutcome, MaterialRecognition } from '../types/ai';
import type { MaterialCategory, MaterialCondition } from '../types/material';
import {
  RECOGNITION_FALLBACK_MESSAGE,
  RECOGNITION_UNAVAILABLE_MESSAGE,
  recognizeMaterialImage,
} from '../services/aiService';
import { cn } from '../utils/cn';

/** Fields a recognition suggestion may fill. Quantity and price are never among them. */
export interface RecognitionSuggestion {
  title: string;
  description: string;
  category: MaterialCategory;
  condition: MaterialCondition;
}

export interface AiRecognitionCardProps {
  /** Called when the owner accepts the suggestion; the owner stays in charge. */
  onApply: (suggestion: Partial<RecognitionSuggestion>) => void;
  /**
   * What the chosen photo is for.
   *
   * <p>{@code main} on the create form: the photo the owner picks here is the
   * listing's main image, the one the marketplace card shows. {@code analysis}
   * on the edit form, where the listing's photos are managed by their own
   * section and this picture is only ever sent to the model.</p>
   */
  photoRole?: 'main' | 'analysis';
  /** The photo chosen here, handed to the page when it is the listing's own. */
  onPhotoChosen?: (file: File | null) => void;
}

const BAND_STYLES: Record<string, string> = {
  HIGH: 'bg-brand-600/10 text-brand-700 ring-brand-200',
  MEDIUM: 'bg-amber-100 text-amber-800 ring-amber-200',
  LOW: 'bg-red-50 text-red-700 ring-red-200',
};

/**
 * "Identify from a photo", shown at the top of the create/edit material form.
 *
 * <p>The owner picks a photo and asks for one suggestion. Nothing is filled in
 * automatically: the card offers a name, a category, a condition, a description
 * written from what the photo shows, and a confidence, and the owner presses
 * "Use suggestion" or ignores it. Quantity and price are not part of any
 * answer - those come from the owner, always, and a description that mentions
 * a figure is thrown away by the backend rather than shown.</p>
 */
export default function AiRecognitionCard({
  onApply,
  photoRole = 'analysis',
  onPhotoChosen,
}: AiRecognitionCardProps) {
  const isMainPhoto = photoRole === 'main';
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestion, setSuggestion] = useState<MaterialRecognition | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derived during render: the preview is just a view of the chosen file.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  // The object URL is released as soon as it is replaced or the form goes away.
  useEffect(() => {
    if (!previewUrl) {
      return;
    }

    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function reset() {
    setSuggestion(null);
    setMessage(null);
    setApplied(false);
  }

  function chooseFile(next: File | null) {
    reset();
    setFile(next);
    onPhotoChosen?.(next);
  }

  async function identify() {
    if (!file || analyzing) {
      return;
    }

    reset();
    setAnalyzing(true);

    const outcome: AiOutcome<MaterialRecognition> = await recognizeMaterialImage(file);

    setAnalyzing(false);

    if (!outcome.ok) {
      // Any failure ends up here, and the form below is still perfectly usable.
      setMessage(outcome.message || RECOGNITION_UNAVAILABLE_MESSAGE);
      return;
    }

    if (!outcome.data.confident) {
      // An unsure answer is not dressed up as a suggestion: the owner gets the
      // manual path and nothing else to click.
      setMessage(outcome.data.message ?? RECOGNITION_FALLBACK_MESSAGE);
      return;
    }

    setSuggestion(outcome.data);
  }

  function useSuggestion() {
    if (!suggestion) {
      return;
    }

    onApply({
      ...(suggestion.materialName ? { title: suggestion.materialName } : {}),
      ...(suggestion.description ? { description: suggestion.description } : {}),
      ...(suggestion.category ? { category: suggestion.category } : {}),
      ...(suggestion.condition ? { condition: suggestion.condition } : {}),
    });

    setApplied(true);
    setMessage(null);
    setSuggestion(null);
  }

  return (
    <section
      aria-labelledby="ai-recognition-heading"
      className="rounded-3xl border border-brand-200 bg-brand-50/50 p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="ai-recognition-heading"
          className="flex items-center gap-2 text-base font-semibold text-stone-900"
        >
          <Camera className="size-4 text-brand-600" aria-hidden="true" />
          {isMainPhoto ? 'Photo and AI suggestions' : 'Identify from a photo'}
        </h2>

        <span className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
          AI
        </span>

        <span className="text-xs text-stone-600">Optional</span>
      </div>

      <p className="mt-1 text-sm text-stone-600">
        {isMainPhoto
          ? 'The photo you pick here is your listing\u2019s main image — the one shown on your listing. AI can also suggest a name, a category, a condition and a short description.'
          : 'Pick a photo and AI can suggest a name, a category, a condition and a short description.'}{' '}
        How much there is and what it costs are always yours to type.
      </p>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1 space-y-3">
          <div>
            <label htmlFor="ai-recognition-file" className="block text-sm font-medium text-stone-800">
              {isMainPhoto ? 'Main photo' : 'Photo of the material'}
            </label>
            <input
              id="ai-recognition-file"
              ref={inputRef}
              data-testid="ai-recognition-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              className="mt-1 block w-full cursor-pointer rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 file:mr-3 file:rounded-full file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-200"
            />
            <p className="mt-1 text-xs text-stone-500">
              {isMainPhoto
                ? 'JPEG, PNG or WebP. This becomes the main image of your listing.'
                : 'JPEG, PNG or WebP. Only this image is sent for analysis.'}
            </p>
          </div>

          <Button
            type="button"
            data-testid="ai-recognition-submit"
            onClick={identify}
            disabled={!file}
            loading={analyzing}
            loadingLabel="Analyzing material image…"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Identify with AI
          </Button>

          {analyzing ? (
            <p role="status" className="text-sm text-stone-600" data-testid="ai-recognition-status">
              Analyzing material image…
            </p>
          ) : null}

          {applied ? (
            <p role="status" className="text-sm text-brand-700" data-testid="ai-recognition-applied">
              {isMainPhoto
                ? 'Suggestion added to the form below. Check the category and add the quantity and price — the photo is already set as your main image.'
                : 'Suggestion added to the form below. Check the category and add the quantity and price.'}
            </p>
          ) : null}
        </div>

        {previewUrl ? (
          <img
            src={previewUrl}
            alt="The material photo you selected"
            className="h-32 w-32 shrink-0 rounded-2xl border border-stone-200 object-cover"
          />
        ) : null}
      </div>

      {suggestion ? (
        <div
          data-testid="ai-recognition-card"
          className="mt-4 rounded-2xl border border-stone-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-900">AI suggestion</h3>

            <span
              data-testid="ai-recognition-confidence"
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium ring-1',
                BAND_STYLES[suggestion.confidenceBand] ?? BAND_STYLES.MEDIUM,
              )}
            >
              {suggestion.confidenceLabel}
            </span>
          </div>

          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-stone-500">Name</dt>
              <dd className="text-stone-900">{suggestion.materialName ?? 'Not sure'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-stone-500">Category</dt>
              <dd className="text-stone-900">{suggestion.categoryLabel ?? 'Choose manually'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-stone-500">Condition</dt>
              <dd className="text-stone-900">{suggestion.conditionLabel ?? 'Not sure'}</dd>
            </div>
          </dl>

          {suggestion.description ? (
            <div className="mt-3" data-testid="ai-recognition-description">
              <p className="text-xs uppercase tracking-wide text-stone-500">Description</p>
              <p className="mt-0.5 text-sm text-stone-800">{suggestion.description}</p>
            </div>
          ) : null}

          <p className="mt-3 text-xs text-stone-500">
            Quantity and price are never guessed from a photo — type them in the form below.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" data-testid="ai-recognition-use" onClick={useSuggestion}>
              Use suggestion
            </Button>

            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="ai-recognition-dismiss"
              onClick={() => {
                setSuggestion(null);
                setMessage(null);
              }}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p
          role="status"
          data-testid="ai-recognition-message"
          className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
