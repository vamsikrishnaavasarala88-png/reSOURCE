import { CalendarDays, Clock, MapPin, Package, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import type { RequestSummary } from '../types/request';
import { formatQuantity } from '../utils/materialOptions';
import { formatAmount, formatLongDate, formatTimeRange } from '../utils/requestOptions';

interface RequestCardProps {
  request: RequestSummary;
  /** Accept/Reject for an owner, Cancel for a requester - whatever fits. */
  actions?: ReactNode;
}

/**
 * One request, used by "My requests", "Incoming requests" and both dashboard
 * sections. Contact details are never part of a list response.
 *
 * <p>Material requests read differently from space requests on purpose: they say
 * "Material", name the listing, and show the quantity asked for instead of a
 * date, a time window and a headcount.</p>
 */
export default function RequestCard({ request, actions }: RequestCardProps) {
  const counterpartLabel = `${request.viewerRole === 'OWNER' ? 'From' : 'To'} ${request.counterpart.name}`;
  const isMaterial = request.resourceType === 'MATERIAL';
  const material = request.material;
  const title = isMaterial
    ? material
      ? `Material request · ${material.title}`
      : 'Material request'
    : (request.purposeLabel ?? 'Space request');
  const unit = request.unit ?? '';

  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-stone-900">
            <Link to={`/requests/${request.id}`} className="hover:underline">
              {title}
            </Link>
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-600">
            {isMaterial ? (
              <>
                <Package className="size-3.5 shrink-0 text-stone-400" aria-hidden="true" />
                {material ? (
                  <Link to={`/materials/${material.id}`} className="truncate hover:underline">
                    {material.categoryLabel}
                  </Link>
                ) : (
                  <span>Surplus material</span>
                )}
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                  Material
                </span>
              </>
            ) : (
              <>
                <MapPin className="size-3.5 shrink-0 text-stone-400" aria-hidden="true" />
                <Link to={`/spaces/${request.spaceId}`} className="truncate hover:underline">
                  {request.spaceTitle}
                </Link>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-stone-500">{counterpartLabel}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={request.status} label={request.statusLabel} />
          <span className="text-sm font-semibold text-stone-900">
            {formatAmount(request.amount, request.isFree)}
            {request.isFree ? (
              <span className="sr-only"> (the owner offers this activity free)</span>
            ) : null}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {isMaterial ? (
          <>
            <div className="rounded-2xl bg-stone-50 p-3">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                <Package className="size-3.5" aria-hidden="true" />
                Quantity asked
              </dt>
              <dd className="mt-1 font-semibold text-stone-900">
                {request.quantityRequested === null
                  ? '—'
                  : formatQuantity(request.quantityRequested, unit)}
              </dd>
            </div>

            <div className="rounded-2xl bg-stone-50 p-3">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                Requested on
              </dt>
              <dd className="mt-1 font-semibold text-stone-900">
                {new Date(request.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </dd>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-stone-50 p-3">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                Date
              </dt>
              <dd className="mt-1 font-semibold text-stone-900">
                {request.requestDate ? formatLongDate(request.requestDate) : '—'}
              </dd>
            </div>

            <div className="rounded-2xl bg-stone-50 p-3">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                <Clock className="size-3.5" aria-hidden="true" />
                Time
              </dt>
              <dd className="mt-1 font-semibold text-stone-900">
                {request.startTime && request.endTime
                  ? formatTimeRange(request.startTime, request.endTime)
                  : '—'}
              </dd>
            </div>

            <div className="rounded-2xl bg-stone-50 p-3">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
                <Users className="size-3.5" aria-hidden="true" />
                Expected people
              </dt>
              <dd className="mt-1 font-semibold text-stone-900">
                {request.expectedPeople === null
                  ? '—'
                  : request.expectedPeople.toLocaleString('en-IN')}
              </dd>
            </div>
          </>
        )}
      </dl>

      {request.message ? (
        <p className="whitespace-pre-line rounded-2xl bg-stone-50 px-3.5 py-3 text-sm leading-relaxed text-stone-700">
          {request.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/requests/${request.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
        >
          View details
        </Link>
        {actions}
      </div>
    </article>
  );
}
