import { useState } from 'react';
import {
  CalendarCheck,
  Home,
  LandPlot,
  LayoutDashboard,
  LogOut,
  Menu,
  Recycle,
  Send,
  X,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { NavItem } from '../types/navigation';
import { cn } from '../utils/cn';
import BackendStatusBadge from './BackendStatusBadge';
import BrandMark from './BrandMark';

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', to: '/', icon: Home },
  { label: 'Spaces', to: '/spaces', icon: LandPlot },
  { label: 'Materials', to: '/materials', icon: Recycle },
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
];

/** Only shown once a user is signed in: these pages need an account. */
const ACCOUNT_ITEMS: NavItem[] = [
  { label: 'Requests', to: '/requests', icon: Send },
  { label: 'Bookings', to: '/bookings', icon: CalendarCheck },
];

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-full px-4 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
  );

const mobileNavLinkClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-700 hover:bg-stone-100',
  );

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { status, user, logout } = useAuth();

  const navItems =
    status === 'authenticated' ? [...NAV_ITEMS, ...ACCOUNT_ITEMS] : NAV_ITEMS;

  function handleLogout() {
    setIsMenuOpen(false);
    // Protected pages redirect to /login on their own once the session ends.
    logout();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <NavLink to="/" aria-label="reSOURCE home" className="rounded-xl">
          <BrandMark />
        </NavLink>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {navItems.map(({ label, to }) => (
            <NavLink key={to} to={to} end={to === '/'} className={navLinkClasses}>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Desktop only: on small screens the badge lives inside the menu. */}
          <div className="hidden lg:flex">
            <BackendStatusBadge />
          </div>

          {status === 'authenticated' && user ? (
            <div className="hidden items-center gap-2 md:flex">
              <NavLink to="/profile" className={navLinkClasses}>
                {user.name.split(' ')[0]}
              </NavLink>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Logout
              </button>
            </div>
          ) : null}

          {status === 'anonymous' ? (
            <div className="hidden items-center gap-2 md:flex">
              <NavLink to="/login" className={navLinkClasses}>
                Login
              </NavLink>
              <NavLink
                to="/register"
                className="rounded-full bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
              >
                Sign up
              </NavLink>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-navigation"
            aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="inline-flex size-10 items-center justify-center rounded-full text-stone-600 transition-colors hover:bg-stone-100 md:hidden"
          >
            {isMenuOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {isMenuOpen ? (
        <div id="mobile-navigation" className="border-t border-stone-200 bg-white md:hidden">
          <nav
            aria-label="Mobile"
            className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-3 sm:px-6"
          >
            {navItems.map(({ label, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                // Close the panel on navigation instead of watching the route.
                onClick={() => setIsMenuOpen(false)}
                className={mobileNavLinkClasses}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </NavLink>
            ))}

            <div className="mt-1 space-y-1 border-t border-stone-200 pt-3">
              {status === 'authenticated' && user ? (
                <>
                  <p className="px-3 pb-1 text-xs text-stone-500">Signed in as {user.email}</p>
                  <NavLink
                    to="/profile"
                    onClick={() => setIsMenuOpen(false)}
                    className={mobileNavLinkClasses}
                  >
                    Profile
                  </NavLink>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Logout
                  </button>
                </>
              ) : null}

              {status === 'anonymous' ? (
                <>
                  <NavLink
                    to="/login"
                    onClick={() => setIsMenuOpen(false)}
                    className={mobileNavLinkClasses}
                  >
                    Login
                  </NavLink>
                  <NavLink
                    to="/register"
                    onClick={() => setIsMenuOpen(false)}
                    className={mobileNavLinkClasses}
                  >
                    Create account
                  </NavLink>
                </>
              ) : null}

              <div className="pt-2">
                <BackendStatusBadge />
              </div>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
