import { Package, Plus } from 'lucide-react';
import { useEffect, lazy, Suspense, useMemo, useState } from 'react';
import { LayoutGrid, Map as MapIcon } from 'lucide-react';
import AiSearchPanel from '../components/AiSearchPanel';
import Button from '../components/Button';
import ButtonLink from '../components/ButtonLink';
import MaterialCard, { MaterialGridSkeleton } from '../components/MaterialCard';
import MaterialFilters from '../components/MaterialFilters';
import type { MappableResource } from '../components/map/ResultsMap';
import PageHeader from '../components/PageHeader';
import { EmptyPanel, ErrorPanel } from '../components/StatePanel';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useUserLocation } from '../hooks/useUserLocation';
import {
  MATERIAL_SEARCH_UNAVAILABLE_MESSAGE,
  SEARCH_UNAVAILABLE_MESSAGE,
  searchWithAi,
} from '../services/aiService';
import { fetchMaterials } from '../services/materialService';
import type { AiSearchSuccess } from '../types/ai';
import type { MaterialSummary, PageResponse } from '../types/material';
import {
  EMPTY_MATERIAL_FILTER_DRAFT,
  countActiveMaterialFilters,
  materialQueryKey,
  toMaterialSearchQuery,
  type LocationStatus,
  type MaterialFilterDraft,
  type UserLocation,
} from '../utils/materialFilters';
import { validateMaterialFilters } from '../utils/validation';

const PAGE_SIZE = 9;

/** Opened on demand: the map view is one click away, never in the first bundle. */
const ResultsMap = lazy(() => import('../components/map/ResultsMap'));

/** Marker labels stay short so the pins do not overlap on a busy map. */
/** Marker labels stay short so the pins do not overlap on a busy map. */
const MARKER_LABEL = (resource: MappableResource) =>
  resource.title.length > 18 ? `${resource.title.slice(0, 17)}…` : resource.title;
const MAP_LABEL = 'Materials on the map';
const MAP_EMPTY = 'No materials with a mapped location in these results. They are all still listed below in the list view.';

interface ResultSnapshot {
  key: string;
  response: PageResponse<MaterialSummary>;
}

/** State of the AI search box on this page. */
interface AiState {
  text: string;
  page: number;
  loading: boolean;
  data: AiSearchSuccess<MaterialSummary> | null;
  error: string | null;
}

/** The surplus material marketplace: browse, filter and open a listing. */
export default function MaterialsPage() {
  const [draft, setDraft] = useState<MaterialFilterDraft>(EMPTY_MATERIAL_FILTER_DRAFT);
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
  const filterErrors = useMemo(() => validateMaterialFilters(debouncedDraft), [debouncedDraft]);
  const hasFilterErrors = Object.keys(filterErrors).length > 0;
  const activeCount = countActiveMaterialFilters(draft, location);

  const query = useMemo(
    () => toMaterialSearchQuery(debouncedDraft, location, page, PAGE_SIZE),
    [debouncedDraft, location, page],
  );
  const currentKey = materialQueryKey(query);

  useEffect(() => {
    if (hasFilterErrors || ai?.data) {
      return;
    }

    const controller = new AbortController();

    fetchMaterials(query, controller.signal)
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

  const aiResult = ai?.data?.results ?? null;
  const aiPage = ai?.page ?? 0;
  const aiSearchText = ai?.text ?? '';

  const loading =
    ai?.loading || (!aiResult && !hasFilterErrors && snapshot?.key !== currentKey && failedKey !== currentKey);
  const failed = !aiResult && failedKey === currentKey;
  const result = aiResult ?? (snapshot?.key === currentKey ? snapshot.response : null);
  const materials = result?.content ?? [];
  const totalElements = result?.totalElements ?? 0;

  /** Only listings with coordinates can be mapped; the rest stay in the list. */
  const mappable: MappableResource[] = materials.map((material) => ({
    id: material.id,
    title: material.title,
    href: `/materials/${material.id}`,
    latitude: material.latitude,
    longitude: material.longitude,
    address: material.address,
    distanceKm: material.distanceKm,
    facts: [
      `${material.quantity.toLocaleString('en-IN')} ${material.unit}`,
      material.isFree ? 'FREE' : `₹${material.price.toLocaleString('en-IN')}`,
      String(material.conditionLabel ?? material.condition),
    ],
  }));

  /** The radius the current search is actually applying, if any. */
  const activeRadiusKm = location ? Number(draft.radiusKm) || null : null;

  /**
   * Nothing came back inside the radius the visitor is using - a different
   * situation from "your filters match nothing", so it says so and offers a way
   * out: a wider radius, or no radius at all.
   */
  const nothingNearby = location !== null && activeRadiusKm !== null && materials.length === 0;

  /**
   * Runs the AI search, or one page of it.
   *
   * <p>The backend understands the words, applies the filters itself and returns
   * real listings, so paging asks the same endpoint again: the intent is cached
   * server-side, which is why paging costs nothing.</p>
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

    const outcome = await searchWithAi<MaterialSummary>({
      searchQuery: queryText,
      resourceType: 'MATERIAL',
      latitude: location?.latitude,
      longitude: location?.longitude,
      page: pageNumber,
      size: PAGE_SIZE,
    });

    if (!outcome.ok) {
      setAi((current) => ({
        text: queryText,
        page: pageNumber,
        loading: false,
        data: current?.data ?? null,
        error: aiFailureMessage(outcome.message),
      }));
      return;
    }

    setAi({ text: queryText, page: pageNumber, loading: false, data: outcome.data, error: null });
  }

  /** The page-specific wording for an unavailable AI search. */
  function aiFailureMessage(message: string): string {
    return message === SEARCH_UNAVAILABLE_MESSAGE || message === MATERIAL_SEARCH_UNAVAILABLE_MESSAGE
      ? MATERIAL_SEARCH_UNAVAILABLE_MESSAGE
      : message;
  }

  function exitAiSearch() {
    setAi(null);
  }

  function updateDraft(patch: Partial<MaterialFilterDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setPage(0);
    // Touching a filter is a clear "I would rather narrow it down myself".
    setAi(null);
  }

  function resetFilters() {
    setDraft(EMPTY_MATERIAL_FILTER_DRAFT);
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
          eyebrow="Module 2"
          title="Materials"
          description="Surplus construction material others no longer need — bricks, cement, tiles, timber, metal and more."
        />

        <ButtonLink to="/materials/create" className="shrink-0">
          <Plus className="size-4" aria-hidden="true" />
          List material
        </ButtonLink>
      </div>

      <div className="mt-8">
        <AiSearchPanel
          resourceType="MATERIAL"
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
          placeholder="e.g. free bricks, at least 200 pieces, within 10 km"
        />
      </div>

      <div className="mt-8">
        <MaterialFilters
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
          Showing materials within {activeRadiusKm} km of your location.
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 data-testid="results-heading" className="text-lg font-semibold text-stone-900">
          {loading
            ? 'Loading materials…'
            : aiResult
              ? totalElements === 1
                ? '1 material matched your AI search'
                : `${totalElements.toLocaleString('en-IN')} materials matched your AI search`
              : totalElements === 1
                ? '1 material found'
                : `${totalElements.toLocaleString('en-IN')} materials found`}
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
          <ErrorPanel
            title="Unable to load materials."
            description="The reSOURCE API could not be reached. Check your connection and try again."
            onRetry={retry}
          />
        ) : loading ? (
          <MaterialGridSkeleton count={6} />
        ) : materials.length === 0 ? (
          <EmptyPanel
            title={
              aiResult
                ? 'No materials match that search.'
                : nothingNearby
                  ? `No nearby materials found within ${activeRadiusKm} km.`
                  : activeCount > 0
                    ? 'No materials match your filters.'
                    : 'No materials available yet.'
            }
            description={
              aiResult
                ? 'The AI search found nothing for those words. Try different words, or use the filters when you want to narrow it down yourself.'
                : nothingNearby
                  ? 'Try a wider radius, or clear the location filter to search everywhere.'
                  : activeCount > 0
                    ? 'Try widening the price or quantity range, or clearing a filter.'
                    : 'Nobody has listed surplus material yet. Be the first to list some.'
            }
            icon={<Package className="size-5" aria-hidden="true" />}
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
                <ButtonLink to="/materials/create" variant="primary">
                  <Plus className="size-4" aria-hidden="true" />
                  List material
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
            {materials.map((material) => (
              <li key={material.id} className="flex">
                <MaterialCard material={material} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {result && result.totalPages > 1 ? (
        <nav aria-label="Material results pages" className="mt-8 flex items-center justify-between gap-3">
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
