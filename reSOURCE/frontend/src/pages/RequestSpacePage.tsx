import { ArrowLeft, CalendarCheck, Info } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import Alert from '../components/Alert';
import Button from '../components/Button';
import { NumberField, SelectField, TextAreaField } from '../components/Fields';
import FormField from '../components/FormField';
import PageHeader from '../components/PageHeader';
import { EmptyPanel, ErrorPanel } from '../components/StatePanel';
import { createRequest } from '../services/requestService';
import { fetchSpace } from '../services/spaceService';
import type { ActivityType, SpaceDetail } from '../types/space';
import { formatAmount } from '../utils/requestOptions';

interface FormValues {
  purpose: ActivityType | '';
  requestDate: string;
  startTime: string;
  endTime: string;
  expectedPeople: string;
  message: string;
}

const EMPTY_FORM: FormValues = {
  purpose: '',
  requestDate: '',
  startTime: '09:00',
  endTime: '14:00',
  expectedPeople: '',
  message: '',
};

/** Today in `yyyy-mm-dd`, so the date input cannot offer the past. */
function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/**
 * "Request This Space": pick an activity, a date and a time range.
 *
 * <p>The price shown comes from the owner's pricing for the chosen activity; the
 * backend re-checks it and decides nothing itself.</p>
 */
export default function RequestSpacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [space, setSpace] = useState<SpaceDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>(
    id ? 'loading' : 'notfound',
  );
  const [retryToken, setRetryToken] = useState(0);

  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    if (!id) {
      return () => controller.abort();
    }

    fetchSpace(id, controller.signal)
      .then((response) => {
        setSpace(response);
        setStatus('ready');
        setValues((current) => ({
          ...current,
          purpose: current.purpose || response.pricing[0]?.activityType || '',
        }));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (error instanceof Error && error.message === 'The request was cancelled.') {
          return;
        }

        const code = (error as { status?: number | null }).status ?? null;
        setStatus(code === 404 || code === 400 ? 'notfound' : 'error');
      });

    return () => controller.abort();
  }, [id, retryToken]);

  /** The owner's pricing row for the activity that is currently chosen. */
  const selectedPricing = useMemo(
    () => space?.pricing.find((entry) => entry.activityType === values.purpose) ?? null,
    [space, values.purpose],
  );

  function update<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  /** Mirrors the backend rules so mistakes are caught before the round trip. */
  function validate(): Record<string, string> {
    const found: Record<string, string> = {};

    if (!values.purpose) {
      found.purpose = 'Choose what the space is needed for.';
    }

    if (!values.requestDate) {
      found.requestDate = 'Choose the date you need the space.';
    } else if (values.requestDate < today()) {
      found.requestDate = 'Choose today or a later date.';
    }

    if (!values.startTime) {
      found.startTime = 'Choose a start time.';
    }

    if (!values.endTime) {
      found.endTime = 'Choose an end time.';
    } else if (values.startTime && values.endTime <= values.startTime) {
      found.endTime = 'The end time must be after the start time.';
    }

    const people = Number(values.expectedPeople);

    if (!values.expectedPeople.trim()) {
      found.expectedPeople = 'Enter how many people are expected.';
    } else if (!Number.isFinite(people) || people < 1) {
      found.expectedPeople = 'Expected people must be at least 1.';
    }

    if (values.message.length > 1000) {
      found.message = 'Keep the message under 1000 characters.';
    }

    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!space) {
      return;
    }

    const validationErrors = validate();
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      const created = await createRequest({
        resourceType: 'SPACE',
        resourceId: space.id,
        purpose: values.purpose as ActivityType,
        requestDate: values.requestDate,
        startTime: values.startTime,
        endTime: values.endTime,
        expectedPeople: Number(values.expectedPeople),
        message: values.message.trim() || null,
      });

      navigate(`/requests/${created.id}`, {
        state: { flash: 'Request sent successfully.' },
      });
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

  if (status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <Link
          to="/spaces"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to spaces
        </Link>

        <div className="animate-pulse space-y-4" role="status" aria-label="Loading the request form">
          <div className="h-8 w-1/2 rounded-full bg-stone-200" />
          <div className="h-40 w-full rounded-3xl bg-stone-200" />
        </div>
      </div>
    );
  }

  if (!space) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        {status === 'notfound' ? (
          <EmptyPanel
            title="This space is no longer listed."
            description="It may have been deleted by its owner, so no request can be sent."
            action={
              <Link
                to="/spaces"
                className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Back to spaces
              </Link>
            }
          />
        ) : (
          <div className="space-y-4">
            <ErrorPanel
              title="Unable to load this space."
              description="The space could not be loaded, so the request form cannot be shown."
              onRetry={() => {
                setStatus('loading');
                setRetryToken((token) => token + 1);
              }}
            />

            <Link
              to="/spaces"
              className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to spaces
            </Link>
          </div>
        )}
      </div>
    );
  }

  if (space.isOwner) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <EmptyPanel
          title="This is your own listing."
          description="You cannot send a request to yourself. Incoming requests appear on your dashboard."
          action={
            <span className="inline-flex flex-wrap items-center justify-center gap-3">
              <Link
                to={`/spaces/${space.id}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back to {space.title}
              </Link>

              <Link
                to="/requests"
                className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                View incoming requests
              </Link>
            </span>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <Link
        to={`/spaces/${space.id}`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to {space.title}
      </Link>

      <PageHeader
        eyebrow="Request this space"
        title="Request Space"
        description={`Tell ${space.owner.name} when you need ${space.title} and for what. Nothing is confirmed until the owner accepts.`}
      />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-8 space-y-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
      >
        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <SelectField
          id="purpose"
          label="Purpose / Activity"
          value={values.purpose}
          placeholderOption="Choose an activity"
          options={space.pricing.map((entry) => ({
            value: entry.activityType,
            label: entry.activityLabel,
          }))}
          error={errors.purpose}
          hint="The price comes from what the owner set for this activity."
          onChange={(value) => update('purpose', value as ActivityType)}
        />

        {selectedPricing ? (
          <div className="flex items-start gap-2.5 rounded-2xl bg-stone-50 px-3.5 py-3 text-sm text-stone-700">
            <CalendarCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
            <div>
              <p className="font-medium text-stone-900">
                {selectedPricing.activityLabel}: {formatAmount(selectedPricing.price, selectedPricing.isFree)}
              </p>
              <p className="mt-0.5 text-xs text-stone-600">
                {selectedPricing.isFree
                  ? 'The owner offers this activity free of charge.'
                  : 'Set by the owner for this activity.'}
                {selectedPricing.ownerNote ? ` ${selectedPricing.ownerNote}` : ''}
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-3">
          <FormField
            id="requestDate"
            label="Date"
            type="date"
            min={today()}
            value={values.requestDate}
            error={errors.requestDate}
            onChange={(value) => update('requestDate', value)}
          />
          <FormField
            id="startTime"
            label="Start time"
            type="time"
            value={values.startTime}
            error={errors.startTime}
            onChange={(value) => update('startTime', value)}
          />
          <FormField
            id="endTime"
            label="End time"
            type="time"
            value={values.endTime}
            error={errors.endTime}
            onChange={(value) => update('endTime', value)}
          />
        </div>

        <NumberField
          id="expectedPeople"
          label="Expected people"
          min={1}
          value={values.expectedPeople}
          error={errors.expectedPeople}
          hint={`This space fits up to ${space.capacity.toLocaleString('en-IN')} people.`}
          onChange={(value) => update('expectedPeople', value)}
        />

        <TextAreaField
          id="message"
          label="Message"
          rows={4}
          maxLength={1000}
          value={values.message}
          error={errors.message}
          hint="Optional. Anything the owner should know before deciding."
          onChange={(value) => update('message', value)}
        />

        <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
          Your request is sent as pending. The owner can accept it or reject it, and you can cancel
          while it is still pending.
        </div>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="submit" loading={submitting} className="sm:w-auto">
            Send Request
          </Button>
          <Link
            to={`/spaces/${space.id}`}
            className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
