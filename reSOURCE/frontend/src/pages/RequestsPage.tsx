import { Inbox, Send } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import IncomingRequestsPanel from '../components/IncomingRequestsPanel';
import MyRequestsPanel from '../components/MyRequestsPanel';
import PageHeader from '../components/PageHeader';

/**
 * "Requests": the whole request picture in one place - what others asked the
 * signed-in user for, and what the signed-in user asked others for. The two
 * lists are separate panels because the actions differ: an owner accepts or
 * rejects, a requester cancels.
 */
export default function RequestsPage() {
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <PageHeader
        eyebrow="Account"
        title="Requests"
        description="Incoming requests for your spaces and materials, and the requests you sent to other owners."
      />

      <section aria-labelledby="requests-incoming-heading" className="mt-8">
        <h2
          id="requests-incoming-heading"
          className="flex items-center gap-2 text-lg font-semibold text-stone-900"
        >
          <Inbox className="size-4 text-stone-400" aria-hidden="true" />
          Incoming requests
        </h2>

        <p className="mt-1 mb-4 max-w-2xl text-sm leading-relaxed text-stone-600">
          What people asked for on your spaces and materials. Accepting a space request confirms a
          booking; accepting a material request shares contact details so you can arrange pickup.
        </p>

        <IncomingRequestsPanel />
      </section>

      <section
        aria-labelledby="requests-outgoing-heading"
        className="mt-12 border-t border-stone-200 pt-10"
      >
        <h2
          id="requests-outgoing-heading"
          className="flex items-center gap-2 text-lg font-semibold text-stone-900"
        >
          <Send className="size-4 text-stone-400" aria-hidden="true" />
          Requests you sent
        </h2>

        <p className="mt-1 mb-4 max-w-2xl text-sm leading-relaxed text-stone-600">
          Requests you sent to other owners, and their answers. A pending request can be cancelled
          here.
        </p>

        <MyRequestsPanel flash={flash} />
      </section>
    </div>
  );
}
