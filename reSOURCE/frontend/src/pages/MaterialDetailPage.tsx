import {
  ArrowLeft,
  CalendarDays,
  ImageOff,
  MapPin,
  Package,
  Pencil,
  ShieldCheck,
  Tag,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Alert from '../components/Alert';
import ButtonLink from '../components/ButtonLink';
import ConfirmDialog from '../components/ConfirmDialog';
import { EmptyPanel, ErrorPanel } from '../components/StatePanel';
import LocationCard from '../components/map/LocationCard';
import { useAuth } from '../hooks/useAuth';
import { resolveMediaUrl } from '../api/client';
import { lastKnownCoordinates } from '../services/locationService';
import { deleteMaterial, fetchMaterial } from '../services/materialService';
import type { MaterialDetail } from '../types/material';
import {
  MATERIAL_STATUS_LABELS,
  formatMaterialPrice,
  formatQuantity,
} from '../utils/materialOptions';
import { formatDate } from '../utils/spaceOptions';

type LoadStatus = 'loading' | 'ready' | 'notfound' | 'error';

/**
 * One material listing in full.
 *
 * <p>The owner sees edit and delete; everyone else sees "Request Material". No
 * contact details appear here at all: the backend only reveals them once a
 * material request has been accepted.</p>
 */
export default function MaterialDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const flashState =
    (location.state as { flash?: string; flashTone?: 'success' | 'error' } | null) ?? {};

  const [material, setMaterial] = useState<MaterialDetail | null>(null);
  const [status, setStatus] = useState<LoadStatus>(id ? 'loading' : 'notfound');
  const [activePhoto, setActivePhoto] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    if (!id) {
      return () => controller.abort();
    }

    // The backend calculates the distance; a position granted earlier in this tab
    // is reused without asking the device again.
    fetchMaterial(id, controller.signal, lastKnownCoordinates())
      .then((response) => {
        setMaterial(response);
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
        setStatus(code === 404 ? 'notfound' : 'error');
      });

    return () => controller.abort();
  }, [id, retryToken]);

  const retry = useCallback(() => {
    setStatus('loading');
    setRetryToken((token) => token + 1);
  }, []);

  async function confirmDelete() {
    if (!material) {
      return;
    }

    setDeleting(true);
    setActionError(null);

    try {
      await deleteMaterial(material.id);
      navigate('/materials', { state: { flash: 'Material listing deleted.', flashTone: 'success' } });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'The listing could not be deleted.',
      );
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="animate-pulse space-y-4" role="status" aria-label="Loading the material">
          <div className="h-8 w-1/3 rounded-full bg-stone-200" />
          <div className="h-64 w-full rounded-3xl bg-stone-200" />
          <div className="h-24 w-full rounded-3xl bg-stone-200" />
        </div>
      </div>
    );
  }

  if (status === 'notfound' || !material) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        {status === 'notfound' ? (
          <EmptyPanel
            title="Material not found."
            description="It may have been removed by its owner, or the link is not valid."
            action={
              <ButtonLink to="/materials" variant="primary">
                Back to materials
              </ButtonLink>
            }
          />
        ) : (
          <ErrorPanel
            title="Unable to load this material."
            description="The reSOURCE API could not be reached. Check your connection and try again."
            onRetry={retry}
          />
        )}
      </div>
    );
  }

  const photos = [...material.photos].sort((a, b) => a.displayOrder - b.displayOrder);
  const current = photos[Math.min(activePhoto, Math.max(photos.length - 1, 0))];
  const currentUrl = resolveMediaUrl(current?.imageUrl);
  const isPaused = material.status === 'INACTIVE';

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      <Link
        to="/materials"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to materials
      </Link>

      <div className="space-y-5">
        {flashState.flash ? (
          <Alert tone={flashState.flashTone === 'error' ? 'error' : 'success'}>
            {flashState.flash}
          </Alert>
        ) : null}

        {actionError ? <Alert tone="error">{actionError}</Alert> : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section aria-label="Photos" className="space-y-3">
            <div className="overflow-hidden rounded-3xl border border-stone-200 bg-stone-100">
              {currentUrl ? (
                <img
                  src={currentUrl}
                  alt={material.title}
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 text-stone-400">
                  <ImageOff className="size-8" aria-hidden="true" />
                  <span className="text-sm font-medium">No photo yet</span>
                </div>
              )}
            </div>

            {photos.length > 1 ? (
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {photos.map((photo, index) => {
                  const url = resolveMediaUrl(photo.imageUrl);

                  return (
                    <li key={photo.id}>
                      <button
                        type="button"
                        onClick={() => setActivePhoto(index)}
                        aria-label={`Show photo ${index + 1}`}
                        aria-current={index === activePhoto}
                        className={`block w-full overflow-hidden rounded-xl border-2 ${
                          index === activePhoto ? 'border-brand-600' : 'border-transparent'
                        }`}
                      >
                        {url ? (
                          <img src={url} alt="" className="aspect-square w-full object-cover" />
                        ) : (
                          <span className="block aspect-square w-full bg-stone-200" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          <section className="space-y-4">
            <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-brand-700 uppercase">
                    <Tag className="size-3.5" aria-hidden="true" />
                    {material.categoryLabel}
                  </p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">
                    {material.title}
                  </h1>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-sm font-bold ${
                    material.isFree
                      ? 'bg-brand-600 text-white'
                      : 'bg-stone-100 text-stone-900 ring-1 ring-stone-200'
                  }`}
                >
                  {formatMaterialPrice(material.price, material.isFree)}
                </span>
              </div>

              {isPaused ? (
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  This listing is paused, so it is hidden from the marketplace.
                </p>
              ) : null}

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-stone-500">
                    <Package className="size-4" aria-hidden="true" />
                    Available
                  </dt>
                  <dd className="text-right font-semibold text-stone-900">
                    {formatQuantity(material.quantity, material.unit)}
                  </dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-stone-500">
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    Condition
                  </dt>
                  <dd className="text-right font-semibold text-stone-900">
                    {material.conditionLabel}
                  </dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-stone-500">
                    <MapPin className="size-4" aria-hidden="true" />
                    Location
                  </dt>
                  <dd className="text-right font-semibold text-stone-900">{material.address}</dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-stone-500">
                    <UserRound className="size-4" aria-hidden="true" />
                    Listed by
                  </dt>
                  <dd className="text-right font-semibold text-stone-900">{material.owner.name}</dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-stone-500">
                    <CalendarDays className="size-4" aria-hidden="true" />
                    Listed on
                  </dt>
                  <dd className="text-right font-semibold text-stone-900">
                    {formatDate(material.createdAt)}
                  </dd>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <dt className="text-stone-500">Status</dt>
                  <dd className="text-right font-semibold text-stone-900">
                    {MATERIAL_STATUS_LABELS[material.status]}
                  </dd>
                </div>
              </dl>

              {material.isOwner ? (
                <div className="mt-5 space-y-2">
                  <ButtonLink to={`/materials/${material.id}/edit`} variant="primary" className="w-full">
                    <Pencil className="size-4" aria-hidden="true" />
                    Edit listing
                  </ButtonLink>

                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Delete listing
                  </button>
                </div>
              ) : (
                <div className="mt-5 space-y-2">
                  <ButtonLink to={`/materials/${material.id}/request`} variant="primary" className="w-full">
                    Request Material
                  </ButtonLink>
                  <p className="text-xs leading-relaxed text-stone-500">
                    {user
                      ? 'Tell the owner how much you need. They decide whether to accept.'
                      : 'You will be asked to sign in first. The owner decides whether to accept.'}
                  </p>
                </div>
              )}

              <p className="mt-4 flex items-start gap-2 rounded-xl bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-stone-600">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-stone-400" aria-hidden="true" />
                Phone and email stay private. They become visible to both sides only if the owner
                accepts a request.
              </p>
            </div>
          </section>
        </div>

        <LocationCard
          title={material.title}
          address={material.address}
          latitude={material.latitude}
          longitude={material.longitude}
          distanceKm={material.distanceKm}
        />

        <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-stone-900">About this material</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-700">
            {material.description}
          </p>

          {material.ownerNote ? (
            <div className="mt-4 rounded-2xl bg-stone-50 px-4 py-3">
              <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
                Owner note
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-stone-700">
                {material.ownerNote}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        tone="danger"
        title="Delete this material listing?"
        description="Are you sure you want to delete this material listing? It will no longer appear in the marketplace."
        confirmLabel="Delete listing"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
