import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from './Alert';
import Button from './Button';
import ButtonLink from './ButtonLink';
import ConfirmDialog from './ConfirmDialog';
import { EmptyPanel, ErrorPanel } from './StatePanel';
import { deleteMaterial, fetchMyMaterials } from '../services/materialService';
import type { MaterialSummary } from '../types/material';
import { MATERIAL_STATUS_LABELS, formatMaterialPrice, formatQuantity } from '../utils/materialOptions';

interface FlashState {
  flash?: string;
  flashTone?: 'success' | 'error';
}

/**
 * "My Materials" on the dashboard: everything the signed-in user listed, active
 * and paused, with view, edit and delete. Deleted listings are gone on purpose.
 */
export default function MyMaterialsSection({ flash }: FlashState) {
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryToken, setRetryToken] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<MaterialSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(flash ?? null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    return fetchMyMaterials(signal)
      .then((response) => {
        setMaterials(response);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (error instanceof Error && error.message === 'The request was cancelled.') {
          return;
        }

        setStatus('error');
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    return () => controller.abort();
  }, [load, retryToken]);

  function retry() {
    setStatus('loading');
    setRetryToken((token) => token + 1);
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    setDeleting(true);
    setActionError(null);

    try {
      await deleteMaterial(pendingDelete.id);
      setMaterials((current) => current.filter((entry) => entry.id !== pendingDelete.id));
      setActionMessage('Material listing deleted.');
      setPendingDelete(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'The listing could not be deleted.',
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section aria-labelledby="my-materials-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="my-materials-heading" className="text-lg font-semibold text-stone-900">
            My Materials
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Surplus material you listed. Paused listings stay here but are hidden from the
            marketplace.
          </p>
        </div>

        <ButtonLink to="/materials/create" variant="primary" className="shrink-0">
          <Plus className="size-4" aria-hidden="true" />
          List material
        </ButtonLink>
      </div>

      {actionMessage ? <Alert tone="success">{actionMessage}</Alert> : null}
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}

      {status === 'loading' ? (
        <ul className="space-y-3" role="status" aria-label="Loading your materials">
          {Array.from({ length: 2 }, (_, index) => (
            <li
              key={index}
              className="h-28 animate-pulse rounded-2xl border border-stone-200 bg-white"
            />
          ))}
        </ul>
      ) : status === 'error' ? (
        <ErrorPanel
          title="Unable to load your materials."
          description="Your listings could not be fetched. Check your connection and try again."
          onRetry={retry}
        />
      ) : materials.length === 0 ? (
        <EmptyPanel
          title="You have not listed any material yet."
          description="List bricks, cement, tiles, timber or metal that someone else can reuse."
          icon={<Package className="size-5" aria-hidden="true" />}
          action={
            <ButtonLink to="/materials/create" variant="primary">
              <Plus className="size-4" aria-hidden="true" />
              List material
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-3">
          {materials.map((material) => (
            <li
              key={material.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
            >
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-stone-900">
                  {material.title}
                </h3>
                <p className="mt-1 text-sm text-stone-600">
                  {material.categoryLabel} · {formatQuantity(material.quantity, material.unit)} ·{' '}
                  {material.conditionLabel}
                </p>
                <p className="mt-1 text-sm font-semibold text-stone-900">
                  {formatMaterialPrice(material.price, material.isFree)}
                  <span className="ml-2 text-xs font-medium text-stone-500">
                    {MATERIAL_STATUS_LABELS[material.status]}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/materials/${material.id}`}
                  className="inline-flex items-center rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 ring-1 ring-stone-300 transition-colors hover:bg-stone-100 sm:text-sm"
                >
                  View
                </Link>

                <Link
                  to={`/materials/${material.id}/edit`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 ring-1 ring-stone-300 transition-colors hover:bg-stone-100 sm:text-sm"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit
                </Link>

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => {
                    setActionMessage(null);
                    setPendingDelete(material);
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        tone="danger"
        title="Delete this material listing?"
        description="Are you sure you want to delete this material listing? It will no longer appear in the marketplace."
        confirmLabel="Delete listing"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
