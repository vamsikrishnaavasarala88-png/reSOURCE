import { useCallback } from 'react';
import BookingList from '../components/BookingList';
import PageHeader from '../components/PageHeader';
import { fetchMyBookings, fetchOwnerBookings } from '../services/bookingService';

/**
 * Bookings of the signed-in user, split into the two roles a single account can
 * hold at once: the spaces they booked, and the spaces they host.
 */
export default function BookingsPage() {
  const loadMine = useCallback(() => fetchMyBookings(), []);
  const loadHosted = useCallback(() => fetchOwnerBookings(), []);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <PageHeader
        eyebrow="Account"
        title="Bookings"
        description="Confirmed bookings from both sides: the spaces you booked and the spaces you host. Contact details appear once a booking is confirmed."
      />

      <div className="mt-8 space-y-10">
        <section>
          <h2 className="text-lg font-semibold text-stone-900">My Bookings</h2>
          <p className="mt-1 mb-4 text-sm text-stone-600">
            Spaces you booked from other owners.
          </p>
          <BookingList
            load={loadMine}
            viewerRole="requester"
            loadingLabel="Loading your bookings"
            emptyTitle="No bookings yet."
            emptyDescription="Send a request for a space; once the owner accepts it, the booking appears here with their contact details."
          />
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900">Bookings I host</h2>
          <p className="mt-1 mb-4 text-sm text-stone-600">
            Confirmed bookings on the spaces you own.
          </p>
          <BookingList
            load={loadHosted}
            viewerRole="owner"
            loadingLabel="Loading hosted bookings"
            emptyTitle="Nothing booked on your spaces yet."
            emptyDescription="When you accept a request for one of your spaces, the confirmed booking shows up here."
          />
        </section>
      </div>
    </div>
  );
}
