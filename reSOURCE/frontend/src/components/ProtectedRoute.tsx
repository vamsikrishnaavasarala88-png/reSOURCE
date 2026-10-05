import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function SessionCheck() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-24 text-stone-500">
      <LoaderCircle className="mr-2 size-5 animate-spin" aria-hidden="true" />
      <span className="text-sm">Checking your session…</span>
    </div>
  );
}

/**
 * Wraps routes that require an account. While the stored token is being
 * verified it shows a short loading state instead of bouncing the user to the
 * login page.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'initialising') {
    return <SessionCheck />;
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
