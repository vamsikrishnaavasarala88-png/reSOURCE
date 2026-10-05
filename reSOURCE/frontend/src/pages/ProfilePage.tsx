import { BadgeCheck, LoaderCircle, LogOut, Pencil, Save, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import Alert from '../components/Alert';
import FormField from '../components/FormField';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { getMyProfile } from '../services/userService';
import type { AuthUser } from '../types/auth';
import { validateProfile } from '../utils/validation';

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
}

function toForm(user: AuthUser): ProfileForm {
  return { name: user.name, email: user.email, phone: user.phone ?? '' };
}

export default function ProfilePage() {
  const { user, updateProfile, logout } = useAuth();

  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState<ProfileForm>({ name: '', email: '', phone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load the freshest profile from GET /api/users/me.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    getMyProfile(controller.signal)
      .then((me) => {
        if (cancelled) return;
        setProfile(me);
        setValues(toForm(me));
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // A rejected token already ended the session.
        if (error instanceof ApiError && error.status === 401) {
          return;
        }
        setLoadError('We could not load your profile. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const current = profile ?? user;

  function startEditing() {
    if (current) {
      setValues(toForm(current));
    }
    setErrors({});
    setFormError(null);
    setNotice(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const validationErrors = validateProfile(values);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSaving(true);

    try {
      const updated = await updateProfile({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
      });
      setProfile(updated);
      setValues(toForm(updated));
      setIsEditing(false);
      setNotice('Your profile has been updated.');
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setErrors(error.fields);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleLogout() {
    // ProtectedRoute sends this page to /login as soon as the session ends.
    logout();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Your details, and the account you use across both marketplaces."
      />

      {notice ? (
        <Alert tone="success" className="mt-8">
          {notice}
        </Alert>
      ) : null}

      <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        {isLoading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-stone-500">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Loading your profile…
          </p>
        ) : loadError ? (
          <Alert tone="error">{loadError}</Alert>
        ) : isEditing ? (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <h2 className="text-lg font-semibold text-stone-900">Edit profile</h2>

            {formError ? <Alert tone="error">{formError}</Alert> : null}

            <FormField
              id="name"
              label="Name"
              value={values.name}
              onChange={(name) => setValues((previous) => ({ ...previous, name }))}
              autoComplete="name"
              error={errors.name}
              required
            />

            <FormField
              id="email"
              label="Email"
              type="email"
              value={values.email}
              onChange={(email) => setValues((previous) => ({ ...previous, email }))}
              autoComplete="email"
              error={errors.email}
              required
            />

            <FormField
              id="phone"
              label="Phone"
              type="tel"
              value={values.phone}
              onChange={(phone) => setValues((previous) => ({ ...previous, phone }))}
              autoComplete="tel"
              inputMode="tel"
              placeholder="+91 98765 43210"
              error={errors.phone}
            />

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-brand-700/60"
              >
                {isSaving ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="size-4" aria-hidden="true" />
                    Save changes
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={cancelEditing}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed"
              >
                <X className="size-4" aria-hidden="true" />
                Cancel
              </button>
            </div>
          </form>
        ) : current ? (
          <div className="space-y-6">
            <dl className="grid gap-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Name
                </dt>
                <dd className="mt-1 text-sm text-stone-900">{current.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Email
                </dt>
                <dd className="mt-1 break-all text-sm text-stone-900">{current.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Phone
                </dt>
                <dd className="mt-1 text-sm text-stone-900">{current.phone ?? 'Not added'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Role
                </dt>
                <dd className="mt-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">
                    <BadgeCheck className="size-3.5" aria-hidden="true" />
                    {current.role}
                  </span>
                </dd>
              </div>
            </dl>

            <div className="flex flex-col gap-3 border-t border-stone-200 pt-6 sm:flex-row">
              <button
                type="button"
                onClick={startEditing}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
              >
                <Pencil className="size-4" aria-hidden="true" />
                Edit Profile
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 transition-colors hover:bg-stone-100"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Logout
              </button>
            </div>
          </div>
        ) : (
          <Alert tone="error">We could not find your account details.</Alert>
        )}
      </section>
    </div>
  );
}
