import { Search, Sparkles, X } from 'lucide-react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Button from './Button';
import type { AiResourceType } from '../types/ai';

export interface AiSearchPanelProps {
  /** The marketplace being searched - the page decides it, not the AI. */
  resourceType: AiResourceType;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onExit: () => void;
  /** True while the backend is thinking. */
  loading: boolean;
  /** True when results on screen came from an AI search. */
  active: boolean;
  chips: string[];
  summary: string | null;
  /** What had to be relaxed to find these listings, or `null` when nothing was. */
  note: string | null;
  /** Set when the words sounded like the other marketplace. */
  detectedResourceType: AiResourceType | null;
  /** A failure message, already worded for a person. */
  error: string | null;
  /** Whether the browser position is known; distance filters need it. */
  hasLocation: boolean;
  placeholder: string;
}

const MARKETPLACE_NAMES: Record<AiResourceType, string> = {
  SPACE: 'spaces',
  MATERIAL: 'materials',
};

const OTHER_MARKETPLACE: Record<AiResourceType, { to: string; label: string }> = {
  SPACE: { to: '/materials', label: 'Search the material marketplace' },
  MATERIAL: { to: '/spaces', label: 'Search the space marketplace' },
};

/**
 * The AI search box shown at the top of both marketplaces.
 *
 * <p>It runs on submit only - never per keystroke - and it never replaces the
 * ordinary filters: the panel sits above them, the results grid below shows
 * what the backend returned, and the summary line states exactly which criteria
 * were applied rather than how good the match is. When the backend had to relax
 * a criterion to find anything at all, it says so here instead of quietly
 * showing something else.</p>
 */
export default function AiSearchPanel({
  resourceType,
  value,
  onChange,
  onSubmit,
  onExit,
  loading,
  active,
  chips,
  summary,
  note,
  detectedResourceType,
  error,
  hasLocation,
  placeholder,
}: AiSearchPanelProps) {
  const inputId = `ai-search-${resourceType.toLowerCase()}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!value.trim() || loading) {
      return;
    }

    onSubmit();
  }

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className="rounded-3xl border border-brand-200 bg-brand-50/60 p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${inputId}-heading`} className="flex items-center gap-2 text-sm font-semibold text-stone-900">
          <Sparkles className="size-4 text-brand-600" aria-hidden="true" />
          AI search
        </h2>

        {/* The small AI indicator: these fields are answered by a model, the results are not. */}
        <span className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
          AI
        </span>

        <span className="text-xs text-stone-600">
          Describe what you need in your own words. The filters below keep working.
        </span>
      </div>

      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="sr-only">
          Describe what you are looking for
        </label>

        <input
          id={inputId}
          data-testid="ai-search-input"
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={300}
          autoComplete="off"
          className="w-full rounded-full border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />

        <Button
          type="submit"
          data-testid="ai-search-submit"
          loading={loading}
          loadingLabel="Searching with AI…"
          disabled={!value.trim()}
          className="shrink-0"
        >
          <Search className="size-4" aria-hidden="true" />
          AI Search
        </Button>

        {active ? (
          <Button
            type="button"
            variant="secondary"
            data-testid="ai-search-exit"
            onClick={onExit}
            className="shrink-0"
          >
            <X className="size-4" aria-hidden="true" />
            Exit AI search
          </Button>
        ) : null}
      </form>

      {/* Screen readers hear the outcome; sighted users see the same words. */}
      <div role="status" aria-live="polite" className="mt-3 space-y-2">
        {loading ? (
          <p className="text-sm text-stone-600" data-testid="ai-search-status">
            Searching with AI…
          </p>
        ) : null}

        {error ? (
          <p
            data-testid="ai-search-message"
            className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900"
          >
            {error}
          </p>
        ) : null}

        {!loading && active && summary ? (
          <div className="space-y-2">
            <p data-testid="ai-search-summary" className="text-sm text-stone-800">
              <span className="font-medium">{summary}</span>{' '}
              <span className="text-stone-500">· Matching your search criteria</span>
            </p>

            {note ? (
              <p data-testid="ai-search-note" className="text-sm text-amber-900">
                {note}
              </p>
            ) : null}

            {chips.length > 0 ? (
              <ul data-testid="ai-search-chips" className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <li
                    key={chip}
                    className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-700 ring-1 ring-stone-300"
                  >
                    {chip}
                  </li>
                ))}
              </ul>
            ) : null}

            {!hasLocation ? (
              <p className="text-xs text-stone-500" data-testid="ai-search-location-hint">
                Distance filters need your location — use “Use my location” in the filters below, then search
                again.
              </p>
            ) : null}

            {detectedResourceType && detectedResourceType !== resourceType ? (
              <p className="text-xs text-stone-600" data-testid="ai-search-hint">
                That reads like a search for {MARKETPLACE_NAMES[detectedResourceType]}.{' '}
                <Link className="font-medium text-brand-700 underline" to={OTHER_MARKETPLACE[resourceType].to}>
                  {OTHER_MARKETPLACE[resourceType].label}
                </Link>
                .
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
