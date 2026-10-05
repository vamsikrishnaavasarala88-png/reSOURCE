import { Link } from 'react-router-dom';
import BrandMark from './BrandMark';

const FOOTER_LINKS = [
  {
    heading: 'Marketplace',
    links: [
      { label: 'Spaces', to: '/spaces' },
      { label: 'Materials', to: '/materials' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Dashboard', to: '/dashboard' },
      { label: 'Requests', to: '/requests' },
      { label: 'Bookings', to: '/bookings' },
      { label: 'Profile', to: '/profile' },
    ],
  },
];

const CURRENT_YEAR = new Date().getFullYear();

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:flex-row lg:justify-between lg:px-8">
        <div className="max-w-sm space-y-3">
          <BrandMark showTagline />
          <p className="text-sm leading-relaxed text-stone-600">
            A local marketplace for underused spaces and surplus construction materials.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:gap-16">
          {FOOTER_LINKS.map(({ heading, links }) => (
            <div key={heading} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                {heading}
              </p>
              <ul className="space-y-2 text-sm">
                {links.map(({ label, to }) => (
                  <li key={to}>
                    <Link to={to} className="text-stone-600 transition-colors hover:text-brand-700">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-stone-200">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-5 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {CURRENT_YEAR} reSOURCE — Reuse. Reimagine. Reconnect.</p>
          <p>Phase 7 · Maps &amp; Location</p>
        </div>
      </div>
    </footer>
  );
}
