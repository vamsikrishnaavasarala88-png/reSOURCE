import { Info, LoaderCircle, LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import Alert from '../components/Alert';
import BrandMark from '../components/BrandMark';
import FormField from '../components/FormField';
import { useAuth } from '../hooks/useAuth';
import { isSessionPersistent } from '../utils/tokenStorage';
import { validateLogin } from '../utils/validation';

export default function LoginPage() {
  const { login, status, sessionEndReason } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Storage can be blocked (private modes, embedded frames); say so instead of
  // letting the user wonder why a reload signs them out again.
  const storageBlocked = !isSessionPersistent();

  // Return to the page that asked for a login, otherwise the dashboard.
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  if (status === 'authenticated') {
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const validationErrors = validateLogin(values);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      await login({ email: values.email.trim(), password: values.password });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setErrors(error.fields);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 sm:px-6 lg:py-20">
      <div className="flex flex-col items-center gap-3 text-center">
        <BrandMark />
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">Welcome back</h1>
        <p className="text-sm text-stone-600">
          Log in to manage your listings and requests.
        </p>
      </div>

      {sessionEndReason && !formError ? (
        <div className="mb-5">
          <Alert tone="error">
            {sessionEndReason === 'expired'
              ? 'Your session ended because the saved sign-in expired. Please sign in again.'
              : 'The reSOURCE API could not be reached, so your saved session could not be checked. Please sign in again.'}
          </Alert>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
      >
        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <FormField
          id="email"
          label="Email"
          type="email"
          value={values.email}
          onChange={(email) => setValues((previous) => ({ ...previous, email }))}
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email}
          required
        />

        <FormField
          id="password"
          label="Password"
          type="password"
          value={values.password}
          onChange={(password) => setValues((previous) => ({ ...previous, password }))}
          autoComplete="current-password"
          placeholder="Your password"
          error={errors.password}
          required
        />

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-brand-700/60 sm:text-base"
        >
          {submitting ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Logging in…
            </>
          ) : (
            <>
              <LogIn className="size-4" aria-hidden="true" />
              Login
            </>
          )}
        </button>

        {storageBlocked ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-clay-50 px-3 py-2.5 text-xs leading-relaxed text-stone-700">
            <Info className="mt-0.5 size-3.5 shrink-0 text-clay-600" aria-hidden="true" />
            Your browser is blocking site storage here, so this session lasts until the page is
            reloaded. Opening the app in its own browser tab keeps you signed in.
          </p>
        ) : null}

        <p className="text-center text-sm text-stone-600">
          New to reSOURCE?{' '}
          <Link to="/register" className="font-semibold text-brand-700 hover:text-brand-800">
            Create an account
          </Link>
        </p>
      </form>
    </div>
  );
}
