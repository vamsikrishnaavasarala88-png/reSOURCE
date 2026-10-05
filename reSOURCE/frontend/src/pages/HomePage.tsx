import { Fragment } from 'react';
import { ArrowRight, Handshake, LandPlot, ListChecks, Recycle, Search, Sprout } from 'lucide-react';
import ButtonLink from '../components/ButtonLink';
import MarketplaceCard from '../components/MarketplaceCard';
import StepCard from '../components/StepCard';

const STEPS = [
  {
    title: 'List',
    description: 'An owner adds a space or surplus material with a few simple details.',
    icon: ListChecks,
  },
  {
    title: 'Discover',
    description: 'People nearby browse what is available in the two marketplaces.',
    icon: Search,
  },
  {
    title: 'Request',
    description: 'Interested users ask the owner about availability and terms.',
    icon: Handshake,
  },
  {
    title: 'Reuse',
    description: 'The handover happens locally and the resource stays in use.',
    icon: Sprout,
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-stone-50 to-stone-50">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-brand-200/50 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 -left-24 size-72 rounded-full bg-clay-200/40 blur-3xl"
        />

        <div className="relative mx-auto w-full max-w-6xl px-4 pt-14 pb-14 sm:px-6 sm:pt-20 lg:px-8 lg:pt-24">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-brand-800">reSOURCE</p>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-5xl">
              Reuse. Reimagine. Reconnect.
            </h1>

            <p className="mt-5 text-base leading-relaxed text-stone-600 sm:text-lg">
              Find the spaces and materials you need — from resources already around you.
            </p>

            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <ButtonLink to="/spaces" className="w-full sm:w-auto">
                <LandPlot className="size-4" aria-hidden="true" />
                Find Spaces
              </ButtonLink>
              <ButtonLink to="/materials" variant="secondary" className="w-full sm:w-auto">
                <Recycle className="size-4" aria-hidden="true" />
                Find Materials
              </ButtonLink>
            </div>

            <p className="mt-6 text-xs text-stone-500">
              Two independent marketplaces — spaces and surplus materials — built local-first.
            </p>
          </div>
        </div>
      </section>

      {/* The two marketplaces */}
      <section aria-labelledby="marketplaces-heading" className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 id="marketplaces-heading" className="sr-only">
          Marketplaces
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          <MarketplaceCard
            title="Space Marketplace"
            description="Discover underused spaces for temporary needs."
            highlights={[
              'Rooms, halls, terraces and plots',
              'Short-term and flexible use',
              'Listed by owners nearby',
            ]}
            to="/spaces"
            ctaLabel="Browse spaces"
            icon={LandPlot}
            tone="brand"
          />
          <MarketplaceCard
            title="Surplus Marketplace"
            description="Find useful construction materials that others no longer need."
            highlights={[
              'Bricks, timber, tiles and steel offcuts',
              'Left over from sites close to you',
              'Kept out of the skip, kept in use',
            ]}
            to="/materials"
            ctaLabel="Browse materials"
            icon={Recycle}
            tone="clay"
          />
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-it-works-heading" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">
            How reSOURCE works
          </p>
          <h2
            id="how-it-works-heading"
            className="mt-2 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl"
          >
            A short loop that keeps resources in use
          </h2>

          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold text-stone-700 sm:text-base">
            {STEPS.map(({ title }, index) => (
              <Fragment key={title}>
                <span>{title}</span>
                {index < STEPS.length - 1 ? (
                  <ArrowRight className="size-4 text-brand-600" aria-hidden="true" />
                ) : null}
              </Fragment>
            ))}
          </div>
        </div>

        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ title, description, icon }, index) => (
            <StepCard
              key={title}
              step={index + 1}
              title={title}
              description={description}
              icon={icon}
            />
          ))}
        </ol>
      </section>

      {/* Closing call to action */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-brand-800 px-6 py-12 text-center sm:px-12">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Something lying idle could be exactly what someone nearby needs.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-brand-100 sm:text-base">
            Start with the marketplace you need. Every phase adds a little more of the loop.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink to="/spaces" variant="onDark" className="w-full sm:w-auto">
              <LandPlot className="size-4" aria-hidden="true" />
              Find Spaces
            </ButtonLink>
            <ButtonLink to="/materials" variant="onDarkOutline" className="w-full sm:w-auto">
              <Recycle className="size-4" aria-hidden="true" />
              Find Materials
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
