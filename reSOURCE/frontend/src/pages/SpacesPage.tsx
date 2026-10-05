import { LandPlot, Plus } from 'lucide-react';
import { useEffect, lazy, Suspense, useMemo, useState } from 'react';
import { LayoutGrid, Map as MapIcon } from 'lucide-react';
import AiSearchPanel from '../components/AiSearchPanel';
import Button from '../components/Button';
import ButtonLink from '../components/ButtonLink';
import PageHeader from '../components/PageHeader';
import SpaceCard, { SpaceGridSkeleton } from '../components/SpaceCard';
import SpaceFilters from '../components/SpaceFilters';
import type { MappableResource } from '../components/map/ResultsMap';
import { EmptyPanel, ErrorPanel } from '../components/StatePanel';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useUserLocation } from '../hooks/useUserLocation';
import { SEARCH_UNAVAILABLE_MESSAGE, searchWithAi } from '../services/aiService';
import { fetchSpaces } from '../services/spaceService';
import type { AiSearchSuccess } from '../types/ai';
import type { PageResponse, SpaceSummary } from '../types/space';
import {
  EMPTY_FILTER_DRAFT,
  countActiveFilters,
  queryKey,
  toSearchQuery,
  type LocationStatus,
  type SpaceFilterDraft,
  type UserLocation,
} from '../utils/spaceFilters';
import { formatArea } from '../utils/spaceOptions';
import { validateSpaceFilters } from '../utils/validation';

const PAGE_SIZE = 9;

/** Opened on demand: the map view is one click away, never in the first bundle. */
const ResultsMap = lazy(() => import('../components/map/ResultsMap'));

/** Marker labels stay short so the pins do not overlap on a busy map. */
/** Marker labels stay short so the pins do not overlap on a busy map. */
const MARKER_LABEL = (resource: MappableResource) =>
  resource.title.length > 18 ? `${resource.title.slice(0, 17)}…` : resource.title;
const MAP_LABEL = 'Spaces on the map';
const MAP_EMPTY = 'No spaces with a mapped location in these results. They are all still listed below in the list view.';

interface ResultSnapshot {
  key: string;
  response: PageResponse<SpaceSummary>;
}

/** State of the AI search box on this page. */
interface AiState {
  text: string;
  page: number;
  loading: boolean;
  data: AiSearchSuccess<SpaceSummary> | null;
  error: string | null;
}

export default function SpacesPage() {
  const [draft, setDraft] = useState<SpaceFilterDraft>(EMPTY_FILTER_DRAFT);
  // Where the visitor is, from the one service every page uses. Nothing is
  // requested until they press the button, and the position is never stored.
  const userLocation = useUserLocation();
  const coordinates = userLocation.coordinates;
  // Memoised so the same position is one object: the search keys off it, and a
  // fresh object on every render would refetch forever.
  const location = useMemo<UserLocation | null>(
    () => (coordinates ? { ...coordinates, approximate: true } : null),
    [coordinates],
  );
  /** The filters know four states; a timeout is simply "no fix available". */
  const locationStatus: LocationStatus =
    userLocation.status === 'timeout' ? 'unavailable' : userLocation.status;
  const [page, setPage] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const [snapshot, setSnapshot] = useState<ResultSnapshot | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [aiText, setAiText] = useState('');
  const [ai, setAi] = useState<AiState | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');

  // Filters are applied shortly after typing stops, so every keystroke does not
  // fire a request of its own.
  const debouncedDraft = useDebouncedValue(draft, 450);
  const filterErrors = useMemo(() => validateSpaceFilters(debouncedDraft), [debouncedDraft]);
  const hasFilterErrors = Object.keys(filterErrors).length > 0;
  const activeCount = countActiveFilters(draft, location);

  const query = useMemo(
    () => toSearchQuery(debouncedDraft, location, page, PAGE_SIZE),
    [debouncedDraft, location, page],
  );
  const currentKey = queryKey(query);

  useEffect(() => {
    if (hasFilterErrors || ai?.data) {
      return;
    }

    const controller = new AbortController();

    fetchSpaces(query, controller.signal)
      .then((response) => {
        setSnapshot({ key: currentKey, response });
        setFailedKey(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        if (error instanceof Error && error.message === 'The request was cancelled.') {
          return;
        }

        setFailedKey(currentKey);
      });

    return () => controller.abort();
  }, [query, currentKey, retryToken, hasFilterErrors, ai?.data]);

  // Loading and error are derived, so the results on screen always belong to the
  // filters - or to the AI search - currently shown.
  const aiResult = ai?.data?.results ?? null;
  const aiPage = ai?.page ?? 0;
  const aiSearchText = ai?.text ?? '';

  const loading =
    ai?.loading || (!aiResult && !hasFilterErrors && snapshot?.key !== currentKey && failedKey !== currentKey);
  const failed = !aiResult && failedKey === currentKey;
  const result = aiResult ?? (snapshot?.key === currentKey ? snapshot.response : null);
  const spaces = result?.content ?? [];
  const totalElements = result?.totalElements ?? 0;

  /**
   * What the map can actually draw: only listings with real coordinates. The
   * distance shown in a popup is the backend's own calculation, and the facts are
   * the same ones the card shows - never an owner's contact details.
   */
  const mappable: MappableResource[] = spaces.map((space) => ({
    id: space.id,
    title: space.title,
    href: `/spaces/${space.id}`,
    latitude: space.latitude,
    longitude: space.longitude,
    address: space.address,
    distanceKm: space.distanceKm,
    facts: [
      formatArea(space.area, space.areaUnit),
      `Capacity: ${space.capacity.toLocaleString('en-IN')}`,
      space.fromPrice === null ? 'Free' : `₹${space.fromPrice.toLocaleString('en-IN')} onwards`,
    ],
  }));

  /** The radius the current search is actually applying, if any. */
  const activeRadiusKm = location ? Number(draft.radiusKm) || null : null;

  /**
   * Nothing came back inside the radius the visitor is using. That is a different
   * situation from "your filters match nothing", so it gets its own words and a
   * way out - widen the radius, or drop the location altogether.
   */
  const nothingNearby = location !== null && activeRadiusKm !== null && spaces.length === 0;

  /**
   * Runs the AI search, or one page of it.
   *
   * <p>The backend turns the sentence into filters and applies them itself, so
   * paging asks the same endpoint again - the intent is cached on the server,
   * which is why paging does not cost another AI call.</p>
   */
  /**
   * Submitting the sentence that is already on screen is not a new question.
   *
   * <p>The answer is right there, so it is left alone: pressing "AI Search"
   * twice, or pressing Enter on a sentence already searched, must not cost a
   * provider call. Any change to the words - or to the browser location the
   * distance filter uses - is a new search and goes through.</p>
   */
  function submitAiSearch() {
    const text = aiText.trim();

    if (!text) {
      return;
    }

    if (text === ai?.text && ai.data && !ai.loading) {
      return;
    }

    void runAiSearch(0, text);
  }

  async function runAiSearch(pageNumber: number, queryText: string) {
    setAi((current) => ({
      text: queryText,
      page: pageNumber,
      loading: true,
      data: current?.data ?? null,
      error: null,
    }));

    const outcome = await searchWithAi<SpaceSummary>({
      searchQuery: queryText,
      resourceType: 'SPACE',
      latitude: location?.latitude,
      longitude: location?.longitude,
      page: pageNumber,
      size: PAGE_SIZE,
    });

    if (!outcome.ok) {
      // The marketplace keeps whatever it was already showing.
      setAi((current) => ({
        text: queryText,
        page: pageNumber,
        loading: false,
        data: current?.data ?? null,
        error: outcome.message || SEARCH_UNAVAILABLE_MESSAGE,
      }));
      return;
    }

    setAi({ text: queryText, page: pageNumber, loading: false, data: outcome.data, error: null });
  }

  function exitAiSearch() {
    setAi(null);
  }

  function updateDraft(patch: Partial<SpaceFilterDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setPage(0);
    // Touching a filter is a clear "I would rather narrow it down myself".
    setAi(null);
  }

  function resetFilters() {
    setDraft(EMPTY_FILTER_DRAFT);
    userLocation.clear();
    setPage(0);
    setAi(null);
  }


  function retry() {
    setFailedKey(null);
    setRetryToken((token) => token + 1);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Module 1"
          title="Spaces"
          description="Underused grounds, halls and terraces available for markets, camps, meetings and community events."
        />

        <ButtonLink to="/spaces/create" className="shrink-0">
          <Plus className="size-4" aria-hidden="true" />
          List your space
        </ButtonLink>
      </div>

      <div className="mt-8">
        <AiSearchPanel
          resourceType="SPACE"
          value={aiText}
          onChange={setAiText}
          onSubmit={submitAiSearch}
          onExit={exitAiSearch}
          loading={ai?.loading ?? false}
          active={aiResult !== null}
          chips={ai?.data?.chips ?? []}
          summary={ai?.data?.summary ?? null}
          note={ai?.data?.note ?? null}
          detectedResourceType={ai?.data?.detectedResourceType ?? null}
          error={ai?.error ?? null}
          hasLocation={location !== null}
          placeholder="e.g. free space for a blood donation camp for 200 people near me"
        />
      </div>

      <div className="mt-8">
        <SpaceFilters
          draft={draft}
          errors={filterErrors}
          onChange={updateDraft}
          onReset={resetFilters}
          activeCount={activeCount}
          location={location}
          locationStatus={locationStatus}
          locationMessage={userLocation.message}
          onRequestLocation={() => {
            void userLocation.request();
          }}
          onClearLocation={() => {
            userLocation.clear();
            setPage(0);
          }}
        />
      </div>

      {location && activeRadiusKm ? (
        <p data-testid="location-summary" className="mt-6 text-sm text-stone-600">
          Showing spaces within {activeRadiusKm} km of your location.
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 data-testid="results-heading" className="text-lg font-semibold text-stone-900">
          {loading
            ? 'Loading spaces…'
            : aiResult
              ? totalElements === 1
                ? '1 space matched your AI search'
                : `${totalElements.toLocaleString('en-IN')} spaces matched your AI search`
              : totalElements === 1
                ? '1 space found'
                : `${totalElements.toLocaleString('en-IN')} spaces found`}
        </h2>

        <div className="flex items-center gap-3">
          {result && result.totalPages > 1 ? (
            <p className="text-sm text-stone-500">
              Page {result.page + 1} of {result.totalPages}
            </p>
          ) : null}

          {/* The list is always available; the map is a second way to look at the same results. */}
          <div
            role="group"
            aria-label="How to show the results"
            className="inline-flex overflow-hidden rounded-full border border-stone-300 bg-white"
          >
            <button
              type="button"
              data-testid="view-list"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${
                view === 'list' ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              <LayoutGrid className="size-3.5" aria-hidden="true" />
              List
            </button>
            <button
              type="button"
              data-testid="view-map"
              aria-pressed={view === 'map'}
              onClick={() => setView('map')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${
                view === 'map' ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              <MapIcon className="size-3.5" aria-hidden="true" />
              Map
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5">
        {hasFilterErrors ? (
          <EmptyPanel
            title="Check your filters"
            description="Some filter values are not valid yet, so no search was run."
          />
        ) : failed ? (
          <ErrorPanel onRetry={retry} />
        ) : loading ? (
          <SpaceGridSkeleton count={6} />
        ) : spaces.length === 0 ? (
          <EmptyPanel
            title={
              aiResult
                ? 'No spaces match that search.'
                : nothingNearby
                  ? `No nearby spaces found within ${activeRadiusKm} km.`
                  : 'No spaces found.'
            }
            description={
              aiResult
                ? 'The AI search found nothing for those words. Try different words, or use the filters when you want to narrow it down yourself.'
                : nothingNearby
                  ? 'Try a wider radius, or clear the location filter to search everywhere.'
                  : activeCount > 0
                    ? 'Try removing a filter or widening the price, area or capacity range.'
                    : 'No space has been listed yet. Be the first to list one.'
            }
            icon={<LandPlot className="size-5" aria-hidden="true" />}
            action={
              aiResult ? (
                <Button variant="secondary" size="sm" onClick={exitAiSearch}>
                  Use filters instead
                </Button>
              ) : activeCount > 0 ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : (
                <ButtonLink to="/spaces/create" variant="primary">
                  <Plus className="size-4" aria-hidden="true" />
                  List your space
                </ButtonLink>
              )
            }
          />
        ) : view === 'map' ? (
          <Suspense
            fallback={
              <div
                data-testid="map-loading"
                role="status"
                className="flex h-[420px] items-center justify-center rounded-3xl border border-stone-200 bg-stone-100 text-sm text-stone-600"
              >
                Loading the map…
              </div>
            }
          >
            <ResultsMap
              resources={mappable}
              userLocation={location}
              radiusKm={activeRadiusKm}
              markerLabel={MARKER_LABEL}
              label={MAP_LABEL}
              emptyMessage={MAP_EMPTY}
            />
          </Suspense>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {spaces.map((space) => (
              <li key={space.id} className="flex">
                <SpaceCard space={space} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {result && result.totalPages > 1 ? (
        <nav aria-label="Space results pages" className="mt-8 flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={result.first || loading}
            onClick={() =>
              aiResult
                ? runAiSearch(Math.max(aiPage - 1, 0), aiSearchText)
                : setPage((current) => Math.max(current - 1, 0))
            }
          >
            Previous
          </Button>

          <span className="text-sm text-stone-600">
            Page {result.page + 1} of {result.totalPages}
          </span>

          <Button
            variant="secondary"
            size="sm"
            disabled={result.last || loading}
            onClick={() => (aiResult ? runAiSearch(aiPage + 1, aiSearchText) : setPage((current) => current + 1))}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
