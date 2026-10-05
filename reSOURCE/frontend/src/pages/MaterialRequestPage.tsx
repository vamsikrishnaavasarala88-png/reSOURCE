import { ArrowLeft, Package, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Alert from '../components/Alert';
import Button from '../components/Button';
import ButtonLink from '../components/ButtonLink';
import { TextAreaField } from '../components/Fields';
import { EmptyPanel, ErrorPanel } from '../components/StatePanel';
import { useMaterialDetail } from '../hooks/useMaterialDetail';
import { ApiError } from '../api/client';
import { createRequest } from '../services/requestService';
import { formatQuantity } from '../utils/materialOptions';

/** Asks the owner for a quantity of a material. The owner decides what to do next. */
export default function MaterialRequestPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { material, status, errorMessage, retry } = useMaterialDetail(id);

  const [quantity, setQuantity] = useState('');
  const [message, setMessage] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 lg:py-16">
        <Link
          to="/materials"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to materials
        </Link>

        <div className="animate-pulse space-y-4" role="status" aria-label="Loading the material">
          <div className="h-8 w-1/3 rounded-full bg-stone-200" />
          <div className="h-40 w-full rounded-3xl bg-stone-200" />
        </div>
      </div>
    );
  }

  if (status === 'notfound' || !material) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        {status === 'notfound' ? (
          <EmptyPanel
            title="Material not found."
            description="It may have been removed by its owner, or the link is not valid."
            action={
              <ButtonLink to="/materials" variant="primary">
                Back to materials
              </ButtonLink>
            }
          />
        ) : (
          <div className="space-y-4">
            <ErrorPanel
              title="Unable to load this material."
              description={errorMessage ?? 'The listing could not be fetched. Please try again.'}
              onRetry={retry}
            />

            <Link
              to="/materials"
              className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to materials
            </Link>
          </div>
        )}
      </div>
    );
  }

  if (material.isOwner) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <EmptyPanel
          title="This is your own listing."
          description="You cannot request your own material. Open it to edit the details instead."
          action={
            <ButtonLink to={`/materials/${material.id}/edit`} variant="primary">
              Edit listing
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const listing = material;

  async function handleSubmit() {
    const trimmed = quantity.trim();
    const parsed = Number(trimmed);

    setSubmitError(null);

    if (trimmed === '' || !Number.isFinite(parsed) || parsed <= 0) {
      setFieldError('Enter how much material you need.');
      return;
    }

    if (parsed > listing.quantity) {
      setFieldError(
        `You cannot request more than the available quantity. This listing has ${formatQuantity(
          listing.quantity,
          listing.unit,
        )}.`,
      );
      return;
    }

    setFieldError(null);
    setSubmitting(true);

    try {
      await createRequest({
        resourceType: 'MATERIAL',
        resourceId: listing.id,
        quantityRequested: parsed,
        message: message.trim() === '' ? null : message.trim(),
      });
      navigate('/requests', {
        state: { flash: 'Material request sent.', flashTone: 'success' },
      });
    } catch (error) {
      if (error instanceof ApiError && error.fields?.quantityRequested) {
        setFieldError(error.fields.quantityRequested);
      }

      setSubmitError(error instanceof Error ? error.message : 'The request could not be sent.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:py-14">
      <Link
        to={`/materials/${material.id}`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to listing
      </Link>

      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-brand-700 uppercase">
          <Package className="size-3.5" aria-hidden="true" />
          {material.categoryLabel}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">{material.title}</h1>
        <p className="mt-1 text-sm text-stone-600">
          Available: <span className="font-semibold">{formatQuantity(material.quantity, material.unit)}</span>{' '}
          · {material.conditionLabel} · {material.address}
        </p>

        <div className="mt-6 space-y-4">
          {submitError ? <Alert tone="error">{submitError}</Alert> : null}

          <div>
            <label htmlFor="material-request-quantity" className="block text-sm font-medium text-stone-700">
              How much do you need?
              <span className="ml-0.5 text-clay-600">*</span>
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="material-request-quantity"
                name="material-request-quantity"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="50"
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? 'material-request-quantity-error' : undefined}
                className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none"
              />
              <span className="shrink-0 rounded-xl bg-stone-100 px-3.5 py-2.5 text-sm font-semibold text-stone-700">
                {material.unit}
              </span>
            </div>
            {fieldError ? (
              <p id="material-request-quantity-error" className="mt-1.5 text-xs font-medium text-red-600">
                {fieldError}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-stone-500">
                Same unit as the listing: {material.unit}.
              </p>
            )}
          </div>

          <TextAreaField
            id="material-request-message"
            label="Message to the owner (optional)"
            value={message}
            onChange={setMessage}
            placeholder="When could I collect it?"
            rows={3}
            maxLength={500}
            hint="Phone and email stay hidden until the owner accepts your request."
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSubmit} loading={submitting} loadingLabel="Sending…">
              Send request
            </Button>

            <ButtonLink to={`/materials/${material.id}`} variant="secondary">
              Cancel
            </ButtonLink>
          </div>

          <p className="flex items-start gap-2 rounded-xl bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-stone-600">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-stone-400" aria-hidden="true" />
            The backend checks this request against the available quantity. Nothing is reserved
            until the owner accepts.
          </p>
        </div>
      </div>
    </div>
  );
}
