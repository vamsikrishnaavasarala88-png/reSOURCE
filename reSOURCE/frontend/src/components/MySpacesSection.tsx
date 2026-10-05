import { LandPlot, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from './Alert';
import Button from './Button';
import ButtonLink from './ButtonLink';
import ConfirmDialog from './ConfirmDialog';
import { SpaceSummaryRow } from './SpaceCard';
import { EmptyPanel, ErrorPanel } from './StatePanel';
import { deleteSpace, fetchMySpaces } from '../services/spaceService';
import type { SpaceSummary } from '../types/space';

interface MySpacesSectionProps {
  /** Success message handed over by a page after a create, update or delete. */
  flash?: string | null;
}

/**
 * The owner's listings: active and paused spaces with view, edit and delete.
 * Shared by the dashboard and the dedicated `/spaces/mine` page.
 */
export default function MySpacesSection({ flash }: MySpacesSectionProps) {
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryToken, setRetryToken] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<SpaceSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(flash ?? null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    return fetchMySpaces(signal)
      .then((response) => {
        setSpaces(response);
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
      await deleteSpace(pendingDelete.id);
      setSpaces((current) => current.filter((space) => space.id !== pendingDelete.id));
      setActionMessage('Space deleted successfully.');
      setPendingDelete(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'The space could not be deleted.',
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section aria-labelledby="my-spaces-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="my-spaces-heading" className="text-lg font-semibold text-stone-900">
            My Spaces
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Listings you own. Paused listings stay here but are hidden from search.
          </p>
        </div>

        <ButtonLink to="/spaces/create" variant="primary" className="shrink-0">
          <Plus className="size-4" aria-hidden="true" />
          List a space
        </ButtonLink>
      </div>

      {actionMessage ? <Alert tone="success">{actionMessage}</Alert> : null}
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}

      {status === 'loading' ? (
        <ul className="space-y-3" role="status" aria-label="Loading your spaces">
          {Array.from({ length: 2 }, (_, index) => (
            <li
              key={index}
              className="h-28 animate-pulse rounded-2xl border border-stone-200 bg-white"
            />
          ))}
        </ul>
      ) : status === 'error' ? (
        <ErrorPanel
          title="Unable to load your spaces."
          description="Your listings could not be fetched. Check your connection and try again."
          onRetry={retry}
        />
      ) : spaces.length === 0 ? (
        <EmptyPanel
          title="You have not listed a space yet."
          description="List a ground, hall or terrace with its facilities and per-activity pricing."
          icon={<LandPlot className="size-5" aria-hidden="true" />}
          action={
            <ButtonLink to="/spaces/create" variant="primary">
              <Plus className="size-4" aria-hidden="true" />
              List your space
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-3">
          {spaces.map((space) => (
            <SpaceSummaryRow
              key={space.id}
              space={space}
              actions={
                <>
                  <Link
                    to={`/spaces/${space.id}`}
                    className="inline-flex items-center rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 ring-1 ring-stone-300 transition-colors hover:bg-stone-100 sm:text-sm"
                  >
                    View
                  </Link>

                  <Link
                    to={`/spaces/${space.id}/edit`}
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
                      setPendingDelete(space);
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Delete
                  </Button>
                </>
              }
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this space?"
        description="Are you sure you want to delete this space? This listing will no longer appear in search."
        confirmLabel="Delete space"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
