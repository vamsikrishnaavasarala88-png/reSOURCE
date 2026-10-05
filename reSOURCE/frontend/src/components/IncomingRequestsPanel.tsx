import { Inbox } from 'lucide-react';
import { useCallback, useState } from 'react';
import Alert from './Alert';
import ButtonLink from './ButtonLink';
import ConfirmDialog from './ConfirmDialog';
import RequestList from './RequestList';
import { acceptRequest, fetchIncomingRequests, rejectRequest } from '../services/requestService';
import type { RequestSummary } from '../types/request';

interface IncomingRequestsPanelProps {
  /** Kept for the panels that want a shorter list; the Requests page shows all. */
  limit?: number;
}

type PendingAction = { request: RequestSummary; action: 'accept' | 'reject' };

/**
 * "Incoming requests": what other people asked for on the spaces the signed-in
 * user owns. Accepting is what creates the booking, so it is confirmed here.
 */
export default function IncomingRequestsPanel({ limit }: IncomingRequestsPanelProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // `reloadKey` is a trigger: bumping it re-runs the list's effect.
  const load = useCallback(() => fetchIncomingRequests(), []); // eslint-disable-line react-hooks/exhaustive-deps
  void reloadKey;

  async function confirm() {
    if (!pending) {
      return;
    }

    setBusy(true);
    setActionError(null);

    try {
      if (pending.action === 'accept') {
        const accepted = await acceptRequest(pending.request.id);
        setMessage(
          accepted.booking
            ? `Request accepted. Booking confirmed for ${accepted.space?.title ?? 'the space'}.`
            : accepted.resourceType === 'MATERIAL'
              ? `Material request accepted. Contact details for ${accepted.material?.title ?? 'the material'} are now visible to both of you.`
              : 'Request accepted.',
        );
      } else {
        await rejectRequest(pending.request.id);
        setMessage('Request rejected.');
      }

      setPending(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      // A 409 means the slot was taken in the meantime, or the request moved on.
      setActionError(
        error instanceof Error ? error.message : 'The request could not be updated.',
      );
      setPending(null);
      setReloadKey((key) => key + 1);
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
        limit={limit}
        loadingLabel="Loading incoming requests"
        emptyTitle="No incoming requests yet."
        emptyDescription="When someone asks for one of your spaces or materials, the request appears here and you decide what to do with it."
        emptyIcon={<Inbox className="size-5" aria-hidden="true" />}
        renderActions={(request) => (
          <>
            {request.status === 'PENDING' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    setPending({ request, action: 'accept' });
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    setPending({ request, action: 'reject' });
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
                >
                  Reject
                </button>
              </>
            ) : request.bookingId ? (
              <ButtonLink to="/bookings" variant="secondary" size="sm">
                View Booking
              </ButtonLink>
            ) : null}
          </>
        )}
      />

      <ConfirmDialog
        open={pending !== null}
        tone={pending?.action === 'accept' ? 'primary' : 'danger'}
        title={pending?.action === 'accept' ? 'Accept this request?' : 'Reject this request?'}
        description={
          pending?.action === 'accept'
            ? 'A booking is confirmed for this slot and both of you can see each other’s contact details. If the slot is already booked, the acceptance is refused instead.'
            : 'The requester is told the request was rejected. No booking is created and no contact details are shared.'
        }
        confirmLabel={pending?.action === 'accept' ? 'Accept request' : 'Reject request'}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
