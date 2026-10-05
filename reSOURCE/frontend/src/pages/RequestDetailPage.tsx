import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  Info,
  LandPlot,
  MapPin,
  Package,
  MessageSquare,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Alert from '../components/Alert';
import BookingCard from '../components/BookingCard';
import ConfirmDialog from '../components/ConfirmDialog';
import ContactCard from '../components/ContactCard';
import StatusBadge from '../components/StatusBadge';
import { EmptyPanel, ErrorPanel } from '../components/StatePanel';
import {
  acceptRequest,
  cancelRequest,
  fetchRequest,
  rejectRequest,
} from '../services/requestService';
import type { RequestDetail } from '../types/request';
import { formatQuantity } from '../utils/materialOptions';
import { formatAmount, formatLongDate, formatTimeRange } from '../utils/requestOptions';

type LoadStatus = 'loading' | 'ready' | 'forbidden' | 'notfound' | 'error';
type Action = 'accept' | 'reject' | 'cancel';

const ACTION_COPY: Record<Action, { title: string; description: string; confirm: string; success: string }> = {
  accept: {
    title: 'Accept this request?',
    description:
      'A booking is confirmed for this slot and both of you can see each other’s contact details. If the slot is already booked, the acceptance is refused instead.',
    confirm: 'Accept request',
    success: 'Request accepted. Booking confirmed.',
  },
  reject: {
    title: 'Reject this request?',
    description: 'No booking is created and no contact details are shared.',
    confirm: 'Reject request',
    success: 'Request rejected.',
  },
  cancel: {
    title: 'Cancel this request?',
    description: 'The owner will no longer see it as something to respond to.',
    confirm: 'Cancel request',
    success: 'Request cancelled.',
  },
};

/**
 * One request in full: the space, the slot, the price, and - once the owner has
 * accepted it - the confirmed booking with the other party's contact details.
 */
export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash ?? null;

  const [request, setRequest] = useState<RequestDetail | null>(null);
  // A route without an id cannot be loaded, without touching state in an effect.
  const [status, setStatus] = useState<LoadStatus>(id ? 'loading' : 'notfound');
  const [retryToken, setRetryToken] = useState(0);
  const [message, setMessage] = useState<string | null>(flash);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    if (!id) {
      return () => controller.abort();
    }

    fetchRequest(id, controller.signal)
      .then((response) => {
        setRequest(response);
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
        setStatus(code === 404 ? 'notfound' : code === 403 ? 'forbidden' : 'error');
      });

    return () => controller.abort();
  }, [id, retryToken]);

  const reload = useCallback(() => setRetryToken((token) => token + 1), []);

  function retry() {
    setStatus('loading');
    reload();
  }

  const materialRequestAccept = {
    title: 'Accept this material request?',
    description:
      'Both of you can then see each other’s contact details. No booking is created for a material request — you arrange the pickup between yourselves.',
    confirm: 'Accept request',
    success: 'Material request accepted.',
  };

  async function runAction() {
    if (!pendingAction || !request) {
      return;
    }

    setBusy(true);
    setActionError(null);

    try {
      const action = pendingAction;
      const updated =
        action === 'accept'
          ? await acceptRequest(request.id)
          : action === 'reject'
            ? await rejectRequest(request.id)
            : await cancelRequest(request.id);

      setRequest(updated);
      setMessage(
        action === 'accept' && updated.resourceType === 'MATERIAL'
          ? materialRequestAccept.success
          : ACTION_COPY[action].success,
      );
      setPendingAction(null);
    } catch (error) {
      // 409 covers "the slot was taken meanwhile" and "already answered".
      setActionError(error instanceof Error ? error.message : 'The request could not be updated.');
      setPendingAction(null);
      reload();
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="animate-pulse space-y-4" role="status" aria-label="Loading the request">
          <div className="h-8 w-1/3 rounded-full bg-stone-200" />
          <div className="h-32 w-full rounded-3xl bg-stone-200" />
          <div className="h-24 w-full rounded-3xl bg-stone-200" />
        </div>
      </div>
    );
  }

  if (status === 'forbidden') {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <EmptyPanel
          title="This request is not yours to view."
          description="Only the person who sent a request and the owner of the space can open it."
          action={
            <Link
              to="/requests"
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Back to my requests
            </Link>
          }
        />
      </div>
    );
  }

  if (status === 'notfound' || (status === 'error' && !request) || !request) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        {status === 'notfound' ? (
          <EmptyPanel
            title="Request not found."
            description="It may have been removed, or the link is not valid."
            action={
              <Link
                to="/requests"
                className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Back to my requests
              </Link>
            }
          />
        ) : (
          <ErrorPanel
            title="Unable to load this request."
            description="The reSOURCE API could not be reached. Check your connection and try again."
            onRetry={retry}
          />
        )}
      </div>
    );
  }

  const isOwner = request.viewerRole === 'OWNER';
  const counterpart = isOwner ? request.requester : request.owner;
  const counterpartRole = isOwner ? 'Requester' : 'Owner';
  const isMaterial = request.resourceType === 'MATERIAL';
  const heading = isMaterial
    ? (request.material?.title ?? 'Material request')
    : (request.purposeLabel ?? 'Space request');

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <Link
        to="/requests"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {isOwner ? 'Back to incoming requests' : 'Back to my requests'}
      </Link>

      <div className="space-y-5">
        {message ? <Alert tone="success">{message}</Alert> : null}
        {actionError ? <Alert tone="error">{actionError}</Alert> : null}

        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">
                {isOwner ? 'Incoming request' : 'Your request'}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                {heading}
              </h1>
              {isMaterial ? (
                <>
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-stone-600">
                    <Package className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
                    {request.material ? (
                      <Link to={`/materials/${request.material.id}`} className="hover:underline">
                        {request.material.categoryLabel}
                      </Link>
                    ) : (
                      <span>Surplus material</span>
                    )}
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                      Material request
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    No booking is created: the owner accepts, then you arrange the pickup.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-stone-600">
                    <LandPlot className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
                    {request.space ? (
                      <Link to={`/spaces/${request.space.id}`} className="hover:underline">
                        {request.space.title}
                      </Link>
                    ) : (
                      <span>Space</span>
                    )}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
                    <MapPin className="size-3.5 shrink-0 text-stone-400" aria-hidden="true" />
                    {request.space?.address ?? '—'}
                  </p>
                </>
              )}
            </div>

            <StatusBadge status={request.status} label={request.statusLabel} />
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {isMaterial ? (
              <>
                <div className="rounded-2xl bg-stone-50 p-3">
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                    <Package className="size-3.5" aria-hidden="true" />
                    Quantity asked
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-stone-900">
                    {request.quantityRequested === null
                      ? '—'
                      : formatQuantity(request.quantityRequested, request.unit ?? '')}
                  </dd>
                </div>

                <div className="rounded-2xl bg-stone-50 p-3">
                  <dt className="text-xs font-medium text-stone-500">Unit</dt>
                  <dd className="mt-1 text-sm font-semibold text-stone-900">
                    {request.unit ?? '—'}
                  </dd>
                </div>

                <div className="rounded-2xl bg-stone-50 p-3">
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    Requested on
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-stone-900">
                    {formatLongDate(request.createdAt)}
                  </dd>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-2xl bg-stone-50 p-3">
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    Date
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-stone-900">
                    {request.requestDate ? formatLongDate(request.requestDate) : '—'}
                  </dd>
                </div>

                <div className="rounded-2xl bg-stone-50 p-3">
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                    <Clock className="size-3.5" aria-hidden="true" />
                    Time
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-stone-900">
                    {request.startTime && request.endTime
                      ? formatTimeRange(request.startTime, request.endTime)
                      : '—'}
                  </dd>
                </div>

                <div className="rounded-2xl bg-stone-50 p-3">
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                    <Users className="size-3.5" aria-hidden="true" />
                    Expected people
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-stone-900">
                    {request.expectedPeople === null
                      ? '—'
                      : request.expectedPeople.toLocaleString('en-IN')}
                  </dd>
                </div>
              </>
            )}

            <div className="rounded-2xl bg-stone-50 p-3">
              <dt className="text-xs font-medium text-stone-500">Amount</dt>
              <dd className="mt-1 text-sm font-semibold text-stone-900">
                {formatAmount(request.amount, request.isFree)}
              </dd>
            </div>
          </dl>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-stone-50 p-3.5 text-sm">
              <p className="text-xs font-medium text-stone-500">{counterpartRole}</p>
              <p className="mt-1 font-semibold text-stone-900">{counterpart.name}</p>
            </div>
            <div className="rounded-2xl bg-stone-50 p-3.5 text-sm">
              <p className="text-xs font-medium text-stone-500">Requested on</p>
              <p className="mt-1 font-semibold text-stone-900">{formatLongDate(request.createdAt)}</p>
            </div>
          </div>

          {request.message ? (
            <div className="mt-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                <MessageSquare className="size-4 text-stone-400" aria-hidden="true" />
                Message
              </h2>
              <p className="mt-2 whitespace-pre-line rounded-2xl bg-stone-50 px-3.5 py-3 text-sm leading-relaxed text-stone-700">
                {request.message}
              </p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {isOwner && request.status === 'PENDING' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMessage(null);
                    setActionError(null);
                    setPendingAction('accept');
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                >
                  <Check className="size-4" aria-hidden="true" />
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMessage(null);
                    setActionError(null);
                    setPendingAction('reject');
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
                >
                  <X className="size-4" aria-hidden="true" />
                  Reject
                </button>
              </>
            ) : null}

            {!isOwner && request.status === 'PENDING' ? (
              <button
                type="button"
                onClick={() => {
                  setMessage(null);
                  setActionError(null);
                  setPendingAction('cancel');
                }}
                className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Cancel Request
              </button>
            ) : null}

            {request.booking ? (
              <Link
                to="/bookings"
                className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                View Booking
              </Link>
            ) : null}
          </div>
        </section>

        {request.status === 'PENDING' ? (
          <p className="flex items-start gap-2.5 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm leading-relaxed text-amber-900">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
            {isOwner
              ? isMaterial
                ? 'While this is pending you decide: accepting shares contact details so you can arrange the pickup.'
                : 'While this is pending you decide: accepting confirms a booking and lets you both see contact details.'
              : 'Awaiting owner response. Contact details are shared once the owner accepts.'}
          </p>
        ) : null}

        {request.booking ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-stone-900">Booking</h2>
            <BookingCard booking={request.booking} viewerRole={isOwner ? 'owner' : 'requester'} />
          </section>
        ) : null}

        {request.contact ? (
          <ContactCard
            title={isOwner ? 'Requester details' : 'Owner details'}
            contact={request.contact}
          />
        ) : (
          request.status !== 'PENDING' && request.status !== 'ACCEPTED' ? (
            <p className="rounded-3xl border border-stone-200 bg-white px-4 py-3.5 text-sm text-stone-600">
              No contact details are shared for this request.
            </p>
          ) : null
        )}
      </div>

      <ConfirmDialog
        open={pendingAction !== null}
        tone={pendingAction === 'reject' || pendingAction === 'cancel' ? 'danger' : 'primary'}
        title={
          pendingAction === 'accept' && isMaterial
            ? materialRequestAccept.title
            : pendingAction
              ? ACTION_COPY[pendingAction].title
              : ''
        }
        description={
          pendingAction === 'accept' && isMaterial
            ? materialRequestAccept.description
            : pendingAction
              ? ACTION_COPY[pendingAction].description
              : ''
        }
        confirmLabel={pendingAction ? ACTION_COPY[pendingAction].confirm : ''}
        busy={busy}
        onConfirm={runAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
