import { useLocation } from 'react-router-dom';
import MySpacesSection from '../components/MySpacesSection';
import PageHeader from '../components/PageHeader';

interface FlashState {
  flash?: string;
}

/** Owner view of every listing they own, including paused ones. */
export default function MySpacesPage() {
  const location = useLocation();
  const flashState = (location.state as FlashState | null) ?? {};

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <PageHeader
        eyebrow="Module 1"
        title="My spaces"
        description="Every space you listed, with its current state. Deleted listings are removed for good and never appear in search."
      />

      <div className="mt-8">
        <MySpacesSection flash={flashState.flash} />
      </div>
    </div>
  );
}
