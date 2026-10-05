import { Handshake, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from './Alert';
import ButtonLink from './ButtonLink';
import ConfirmDialog from './ConfirmDialog';
import RequestList from './RequestList';
import { cancelRequest, fetchMyRequests } from '../services/requestService';
import type { RequestSummary } from '../types/request';

interface MyRequestsPanelProps {
  /** Shown after a cancel or when arriving from another page. */
  flash?: string | null;
}

/**
 * "Requests you sent": requests the signed-in user sent, with cancel for the
 * pending ones. Shown on `/requests`, under the incoming list.
 */
export default function MyRequestsPanel({ flash = null }: MyRequestsPanelProps) {
  const [message, setMessage] = useState<string | null>(flash);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<RequestSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // `reloadKey` is a trigger: bumping it re-runs the list's effect.
  const load = useCallback(() => fetchMyRequests(), []); // eslint-disable-line react-hooks/exhaustive-deps
  void reloadKey;

  async function confirmCancel() {
    if (!pendingCancel) {
      return;
    }

    setBusy(true);
    setActionError(null);

    try {
      await cancelRequest(pendingCancel.id);
      setMessage('Request cancelled.');
      setPendingCancel(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The request could not be cancelled.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {message ? <Alert tone="success">{message}</Alert> : null}
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}

      <RequestList
        load={load}
        loadingLabel="Loading your requests"
        emptyTitle="You have not requested anything yet."
        emptyDescription="Find a space or a material you need and send the owner a request. It shows up here once it is sent."
        emptyIcon={<Handshake className="size-5" aria-hidden="true" />}
        header={
          <div className="flex flex-wrap justify-end gap-2">
            <ButtonLink to="/spaces" variant="secondary" size="sm">
              <Plus className="size-4" aria-hidden="true" />
              Find a space
            </ButtonLink>
            <ButtonLink to="/materials" variant="secondary" size="sm">
              <Plus className="size-4" aria-hidden="true" />
              Find material
            </ButtonLink>
          </div>
        }
        renderActions={(request) =>
          request.status === 'PENDING' ? (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setPendingCancel(request);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Cancel Request
            </button>
          ) : request.bookingId ? (
            <Link
              to="/bookings"
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              View Booking
            </Link>
          ) : null
        }
      />

      <ConfirmDialog
        open={pendingCancel !== null}
        title="Cancel this request?"
        description="The owner will no longer see it as something to respond to. You can send a new request later."
        confirmLabel="Cancel request"
        cancelLabel="Keep it"
        busy={busy}
        tone="danger"
        onConfirm={confirmCancel}
        onCancel={() => setPendingCancel(null)}
      />
    </div>
  );
}
