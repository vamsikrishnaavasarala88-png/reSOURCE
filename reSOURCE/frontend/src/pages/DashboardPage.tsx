import { Recycle } from 'lucide-react';
import { Link } from 'react-router-dom';
import MyMaterialsSection from '../components/MyMaterialsSection';
import MySpacesSection from '../components/MySpacesSection';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <PageHeader
        eyebrow="Account"
        title={user ? `Hello, ${user.name.split(' ')[0]}` : 'Dashboard'}
        description="Your listings. Requests you send and receive live under Requests."
      />

      <div className="mt-8">
        <MySpacesSection />
      </div>

      <div className="mt-10 border-t border-stone-200 pt-10">
        <MyMaterialsSection />
      </div>

      <section aria-labelledby="dashboard-next-heading" className="mt-10">
        <h2
          id="dashboard-next-heading"
          className="flex items-center gap-2 text-base font-semibold text-stone-900"
        >
          <Recycle className="size-4 text-stone-400" aria-hidden="true" />
          Browse the marketplaces
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
          Both marketplaces are live: spaces for booking, and surplus material for reuse. Payments,
          notifications and automatic space-to-material matching are not built, so nothing here
          pretends to work.
        </p>

        <div className="mt-3 flex flex-wrap gap-4">
          <Link
            to="/spaces"
            className="inline-flex text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            Browse all spaces →
          </Link>
          <Link
            to="/materials"
            className="inline-flex text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            Browse all materials →
          </Link>
        </div>
      </section>
    </div>
  );
}
