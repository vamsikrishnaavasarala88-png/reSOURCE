import { Info, LoaderCircle, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import Alert from '../components/Alert';
import BrandMark from '../components/BrandMark';
import FormField from '../components/FormField';
import { useAuth } from '../hooks/useAuth';
import { isSessionPersistent } from '../utils/tokenStorage';
import { PASSWORD_MIN_LENGTH, validateRegister } from '../utils/validation';

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
};

export default function RegisterPage() {
  const { register, status } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const storageBlocked = !isSessionPersistent();

  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }

  function updateValue(field: keyof typeof EMPTY_FORM) {
    return (value: string) => setValues((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const validationErrors = validateRegister(values);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      // Registers, then signs in with the same credentials.
      await register({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        password: values.password,
      });
      navigate('/dashboard', { replace: true });
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
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          Create your account
        </h1>
        <p className="text-sm text-stone-600">
          One account for both marketplaces — list and request as you go.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
      >
        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <FormField
          id="name"
          label="Name"
          value={values.name}
          onChange={updateValue('name')}
          autoComplete="name"
          placeholder="Ada Lovelace"
          error={errors.name}
          required
        />

        <FormField
          id="email"
          label="Email"
          type="email"
          value={values.email}
          onChange={updateValue('email')}
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email}
          required
        />

        <FormField
          id="phone"
          label="Phone"
          type="tel"
          value={values.phone}
          onChange={updateValue('phone')}
          autoComplete="tel"
          inputMode="tel"
          placeholder="+91 98765 43210"
          hint="Optional — helps people reach you about a listing."
          error={errors.phone}
        />

        <FormField
          id="password"
          label="Password"
          type="password"
          value={values.password}
          onChange={updateValue('password')}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={errors.password}
          required
        />

        <FormField
          id="confirmPassword"
          label="Confirm Password"
          type="password"
          value={values.confirmPassword}
          onChange={updateValue('confirmPassword')}
          autoComplete="new-password"
          placeholder="Repeat your password"
          error={errors.confirmPassword}
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
              Creating account…
            </>
          ) : (
            <>
              <UserPlus className="size-4" aria-hidden="true" />
              Create Account
            </>
          )}
        </button>

        <p className="text-center text-sm text-stone-600">
        {storageBlocked ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-clay-50 px-3 py-2.5 text-xs leading-relaxed text-stone-700">
            <Info className="mt-0.5 size-3.5 shrink-0 text-clay-600" aria-hidden="true" />
            Your browser is blocking site storage here, so this session lasts until the page is
            reloaded. Opening the app in its own browser tab keeps you signed in.
          </p>
        ) : null}

          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-800">
            Login
          </Link>
        </p>
      </form>
    </div>
  );
}
