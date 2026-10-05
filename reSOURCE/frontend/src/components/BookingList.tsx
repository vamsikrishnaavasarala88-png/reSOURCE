import { CalendarX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import BookingCard from './BookingCard';
import { EmptyPanel, ErrorPanel } from './StatePanel';
import type { Booking } from '../types/booking';

interface BookingListProps {
  load: (signal?: AbortSignal) => Promise<Booking[]>;
  emptyTitle: string;
  emptyDescription: string;
  loadingLabel: string;
  viewerRole: 'requester' | 'owner';
}

/** Loading, empty and error handling around a list of bookings. */
export default function BookingList({
  load,
  emptyTitle,
  emptyDescription,
  loadingLabel,
  viewerRole,
}: BookingListProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    load(controller.signal)
      .then((response) => {
        setBookings(response);
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

    return () => controller.abort();
  }, [load, retryToken]);

  const retry = useCallback(() => setRetryToken((token) => token + 1), []);

  if (status === 'loading') {
    return (
      <div className="space-y-4" role="status" aria-label={loadingLabel}>
        {[0, 1].map((row) => (
          <div key={row} className="animate-pulse rounded-3xl border border-stone-200 bg-white p-5">
            <div className="h-5 w-1/3 rounded-full bg-stone-200" />
            <div className="mt-4 grid grid-cols-4 gap-3">
              <div className="h-16 rounded-2xl bg-stone-100" />
              <div className="h-16 rounded-2xl bg-stone-100" />
              <div className="h-16 rounded-2xl bg-stone-100" />
              <div className="h-16 rounded-2xl bg-stone-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorPanel
        title="Unable to load bookings."
        description="The reSOURCE API could not be reached. Check your connection and try again."
        onRetry={retry}
      />
    );
  }

  if (bookings.length === 0) {
    return (
      <EmptyPanel
        title={emptyTitle}
        description={emptyDescription}
        icon={<CalendarX className="size-5" aria-hidden="true" />}
      />
    );
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking) => (
        <BookingCard key={booking.id} booking={booking} viewerRole={viewerRole} />
      ))}
    </div>
  );
}
