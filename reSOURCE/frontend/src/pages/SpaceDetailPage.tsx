import {
  CalendarClock,
  CalendarPlus,
  CircleCheck,
  ImageOff,
  MapPin,
  Pencil,
  Ruler,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { resolveMediaUrl } from '../api/client';
import Alert from '../components/Alert';
import Button from '../components/Button';
import ButtonLink from '../components/ButtonLink';
import ConfirmDialog from '../components/ConfirmDialog';
import { EmptyPanel, ErrorPanel } from '../components/StatePanel';
import LocationCard from '../components/map/LocationCard';
import { lastKnownCoordinates } from '../services/locationService';
import { deleteSpace, fetchSpace } from '../services/spaceService';
import type { SpaceDetail, SpacePhoto } from '../types/space';
import { useAuth } from '../hooks/useAuth';
import {
  activityLabel,
  facilityLabel,
  formatArea,
  formatDate,
  formatPrice,
} from '../utils/spaceOptions';

interface DetailSkeletonProps {
  label: string;
}

function DetailSkeleton({ label }: DetailSkeletonProps) {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-label={label}>
      <div className="aspect-[16/9] w-full rounded-3xl bg-stone-200" />
      <div className="h-6 w-1/2 rounded-full bg-stone-200" />
      <div className="h-4 w-3/4 rounded-full bg-stone-200" />
      <div className="h-24 w-full rounded-3xl bg-stone-200" />
    </div>
  );
}

export default function SpaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [space, setSpace] = useState<SpaceDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const flashState = (location.state as { flash?: string; flashTone?: 'success' | 'error' } | null) ?? {};
  const flash = flashState.flash ?? null;

  const load = useCallback(
    (signal?: AbortSignal) => {
      if (!id) {
        return Promise.reject(new Error('Missing id'));
      }

      // The backend calculates the distance; a position granted earlier in this
      // tab is reused without asking the device again.
      return fetchSpace(id, signal, lastKnownCoordinates());
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();

    load(controller.signal)
      .then((response) => {
        setSpace(response);
        setSelectedPhoto(0);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        if (error instanceof Error && error.message === 'The request was cancelled.') {
          return;
        }

        const status = (error as { status?: number | null }).status ?? null;
        setStatus(status === 404 || status === 400 ? 'notfound' : 'error');
      });

    return () => controller.abort();
  }, [load, retryToken]);

  function retry() {
    setStatus('loading');
    setRetryToken((token) => token + 1);
  }

  async function confirmDelete() {
    if (!space) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteSpace(space.id);
      navigate('/spaces/mine', { state: { flash: 'Space deleted successfully.' } });
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'The space could not be deleted.',
      );
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <DetailSkeleton label="Loading space" />
      </div>
    );
  }

  if (status === 'notfound') {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <EmptyPanel
          title="This space is no longer available."
          description="The listing was removed or never existed. It does not appear in search either."
          action={
            <ButtonLink to="/spaces" variant="primary">
              Back to all spaces
            </ButtonLink>
          }
        />
      </div>
    );
  }

  if (status === 'error' || !space) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <ErrorPanel
          title="Unable to load this space."
          description="The reSOURCE API could not be reached. Check your connection and try again."
          onRetry={retry}
        />
      </div>
    );
  }

  const isOwner = space.isOwner && Boolean(user);
  const photos: SpacePhoto[] = [...space.photos].sort(
    (first, second) => first.displayOrder - second.displayOrder,
  );
  const activePhoto = photos[selectedPhoto] ?? photos[0] ?? null;
  const activePhotoUrl = resolveMediaUrl(activePhoto?.imageUrl);
  const freeActivities = space.pricing.filter((entry) => entry.isFree);
  const paidActivities = space.pricing.filter((entry) => !entry.isFree);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-stone-500">
        <Link to="/spaces" className="font-medium text-brand-700 hover:text-brand-800">
          Spaces
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate">{space.title}</span>
      </nav>

      {flash ? (
        <div className="mt-5">
          <Alert tone={flashState.flashTone === 'error' ? 'error' : 'success'}>{flash}</Alert>
        </div>
      ) : null}

      {deleteError ? (
        <div className="mt-5">
          <Alert tone="error">{deleteError}</Alert>
        </div>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
            <div className="aspect-[16/9] w-full bg-stone-100">
              {activePhotoUrl ? (
                <img
                  src={activePhotoUrl}
                  alt={space.title}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 text-stone-400">
                  <ImageOff className="size-8" aria-hidden="true" />
                  <span className="text-sm">No photos for this space yet</span>
                </div>
              )}
            </div>

            {photos.length > 1 ? (
              <ul className="flex gap-2 overflow-x-auto p-3">
                {photos.map((photo, index) => {
                  const url = resolveMediaUrl(photo.imageUrl);

                  return (
                    <li key={photo.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedPhoto(index)}
                        aria-label={`Show photo ${index + 1}`}
                        aria-current={index === selectedPhoto}
                        className={`size-16 overflow-hidden rounded-xl border-2 transition-colors ${
                          index === selectedPhoto ? 'border-brand-600' : 'border-transparent'
                        }`}
                      >
                        {url ? (
                          <img
                            src={url}
                            alt={`${space.title} photo ${index + 1}`}
                            className="size-full object-cover"
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                  {space.title}
                </h1>

                <p className="mt-2 flex items-start gap-2 text-sm text-stone-600">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-stone-400" aria-hidden="true" />
                  {space.address}
                </p>
              </div>

              {isOwner && space.status === 'INACTIVE' ? (
                <span className="rounded-full bg-clay-50 px-3 py-1 text-xs font-semibold text-clay-600">
                  Paused — hidden from search
                </span>
              ) : null}
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-stone-50 p-3">
                <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                  <Ruler className="size-3.5" aria-hidden="true" />
                  Area
                </dt>
                <dd className="mt-1 text-sm font-semibold text-stone-900">
                  {formatArea(space.area, space.areaUnit)}
                </dd>
              </div>

              <div className="rounded-2xl bg-stone-50 p-3">
                <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                  <Users className="size-3.5" aria-hidden="true" />
                  Capacity
                </dt>
                <dd className="mt-1 text-sm font-semibold text-stone-900">
                  Up to {space.capacity.toLocaleString('en-IN')}
                </dd>
              </div>

              <div className="rounded-2xl bg-stone-50 p-3">
                <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  Availability
                </dt>
                <dd className="mt-1 text-sm font-semibold text-stone-900">
                  {space.availability?.trim() || 'Ask the owner'}
                </dd>
              </div>
            </dl>

            <div className="mt-6 space-y-2">
              <h2 className="text-base font-semibold text-stone-900">About this space</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-stone-700">
                {space.description}
              </p>
            </div>

            {space.facilities.length > 0 ? (
              <div className="mt-6 space-y-3">
                <h2 className="text-base font-semibold text-stone-900">Facilities</h2>
                <ul className="flex flex-wrap gap-2">
                  {space.facilities.map((facility) => (
                    <li
                      key={facility}
                      className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-800"
                    >
                      <CircleCheck className="size-3.5" aria-hidden="true" />
                      {facilityLabel(facility)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-6">
              <LocationCard
                title={space.title}
                address={space.address}
                latitude={space.latitude}
                longitude={space.longitude}
                distanceKm={space.distanceKm}
              />
            </div>

            {space.ownerNote?.trim() ? (
              <div className="mt-6 rounded-2xl border border-clay-200 bg-clay-50 p-4">
                <h2 className="text-sm font-semibold text-clay-600">Owner note</h2>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-stone-700">
                  {space.ownerNote}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-base font-semibold text-stone-900">Activities and pricing</h2>
            <p className="mt-1 text-xs text-stone-500">
              The owner sets the price for each activity.
            </p>

            <ul className="mt-4 space-y-3">
              {space.pricing.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-stone-200 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900">
                      {entry.activityLabel || activityLabel(entry.activityType)}
                    </p>
                    {entry.ownerNote?.trim() ? (
                      <p className="mt-0.5 text-xs text-stone-600">{entry.ownerNote}</p>
                    ) : null}
                  </div>

                  {entry.isFree ? (
                    <span className="shrink-0 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
                      FREE
                    </span>
                  ) : (
                    <span className="shrink-0 text-sm font-semibold text-stone-900">
                      {formatPrice(entry.price)}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {freeActivities.length > 0 ? (
              <p className="mt-4 rounded-xl bg-brand-50 px-3 py-2 text-xs leading-relaxed text-brand-800">
                Free for {freeActivities.map((entry) => entry.activityLabel).join(', ')}.
              </p>
            ) : null}

            {paidActivities.length > 0 ? (
              <p className="mt-2 text-xs text-stone-500">
                Paid activities start at {formatPrice(space.fromPrice)}.
              </p>
            ) : null}
          </div>

          <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
              <UserRound className="size-4 text-stone-400" aria-hidden="true" />
              Listings by {space.owner.name}
            </h2>
            <p className="mt-2 text-xs text-stone-500">
              Listed on {formatDate(space.createdAt)}
              {space.updatedAt !== space.createdAt
                ? ` · updated ${formatDate(space.updatedAt)}`
                : ''}
            </p>

            {isOwner ? (
              <div className="mt-4 flex flex-col gap-2">
                <ButtonLink to={`/spaces/${space.id}/edit`} variant="primary" className="w-full">
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit listing
                </ButtonLink>

                <Button
                  variant="secondary"
                  onClick={() => setConfirmOpen(true)}
                  className="w-full text-red-600"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Delete listing
                </Button>
              </div>
            ) : space.status === 'ACTIVE' ? (
              <div className="mt-4 space-y-2">
                <ButtonLink to={`/spaces/${space.id}/request`} variant="primary" className="w-full">
                  <CalendarPlus className="size-4" aria-hidden="true" />
                  Request This Space
                </ButtonLink>
                <p className="text-xs leading-relaxed text-stone-500">
                  {user
                    ? 'Pick an activity and a date. The owner decides whether to accept.'
                    : 'You will be asked to sign in first. The owner decides whether to accept.'}
                </p>
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-stone-600">
                This listing is paused, so it cannot be requested right now.
              </p>
            )}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete this space?"
        description="Are you sure you want to delete this space? This listing will no longer appear in search."
        confirmLabel="Delete space"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
