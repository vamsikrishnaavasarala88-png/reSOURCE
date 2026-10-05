import { CalendarDays, Clock, MapPin, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import ContactCard from './ContactCard';
import StatusBadge from './StatusBadge';
import type { Booking } from '../types/booking';
import { formatAmount, formatLongDate, formatTimeRange } from '../utils/requestOptions';

interface BookingCardProps {
  booking: Booking;
  /** Who the other party is, from this viewer's point of view. */
  viewerRole: 'requester' | 'owner';
}

/** A confirmed booking, with the other party's contact details. */
export default function BookingCard({ booking, viewerRole }: BookingCardProps) {
  const counterpart = viewerRole === 'requester' ? booking.owner : booking.requester;
  const counterpartRole = viewerRole === 'requester' ? 'Owner' : 'Requester';

  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-stone-900">
            <Link to={`/spaces/${booking.space.id}`} className="hover:underline">
              {booking.space.title}
            </Link>
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-600">
            <UserRound className="size-3.5 shrink-0 text-stone-400" aria-hidden="true" />
            {counterpartRole}: {counterpart.name}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
            <MapPin className="size-3.5 shrink-0 text-stone-400" aria-hidden="true" />
            {booking.space.address}
          </p>
        </div>

        <StatusBadge status={booking.status} label={booking.statusLabel} />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-2xl bg-stone-50 p-3">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            Date
          </dt>
          <dd className="mt-1 font-semibold text-stone-900">{formatLongDate(booking.bookingDate)}</dd>
        </div>

        <div className="rounded-2xl bg-stone-50 p-3">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
            <Clock className="size-3.5" aria-hidden="true" />
            Time
          </dt>
          <dd className="mt-1 font-semibold text-stone-900">
            {formatTimeRange(booking.startTime, booking.endTime)}
          </dd>
        </div>

        <div className="rounded-2xl bg-stone-50 p-3">
          <dt className="text-xs font-medium text-stone-500">Amount</dt>
          <dd className="mt-1 font-semibold text-stone-900">{formatAmount(booking.amount)}</dd>
        </div>

        <div className="rounded-2xl bg-stone-50 p-3">
          <dt className="text-xs font-medium text-stone-500">Total</dt>
          <dd className="mt-1 font-semibold text-stone-900">{formatAmount(booking.totalAmount)}</dd>
        </div>
      </dl>

      <p className="text-xs leading-relaxed text-stone-500">
        Platform fee {formatAmount(booking.platformFee)}. Payment is not part of this phase, so no
        money has changed hands through reSOURCE.
      </p>

      {booking.contact ? (
        <ContactCard
          title={viewerRole === 'requester' ? 'Owner contact' : 'Requester contact'}
          contact={booking.contact}
        />
      ) : null}
    </article>
  );
}
