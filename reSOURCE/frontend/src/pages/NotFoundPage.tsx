import { Compass } from 'lucide-react';
import ButtonLink from '../components/ButtonLink';

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
        <Compass className="size-6" aria-hidden="true" />
      </span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">404</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
        This page does not exist
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-stone-600 sm:text-base">
        The link may be out of date. Head back to the home page and pick a marketplace to explore.
      </p>
      <ButtonLink to="/" className="mt-8">
        Back to home
      </ButtonLink>
    </div>
  );
}
