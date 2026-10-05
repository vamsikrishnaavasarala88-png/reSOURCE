import { CircleCheck, Clock, CircleX, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BookingStatus } from '../types/booking';
import type { RequestStatus } from '../types/request';
import {
  BOOKING_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  requestStatusTone,
  type StatusTone,
} from '../utils/requestOptions';
import { cn } from '../utils/cn';

const TONE_CLASSES: Record<StatusTone, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  confirmed: 'bg-brand-50 text-brand-800 ring-brand-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
  neutral: 'bg-stone-100 text-stone-600 ring-stone-200',
};

const TONE_ICONS: Record<StatusTone, ReactNode> = {
  pending: <Clock className="size-3.5" aria-hidden="true" />,
  confirmed: <CircleCheck className="size-3.5" aria-hidden="true" />,
  rejected: <CircleX className="size-3.5" aria-hidden="true" />,
  neutral: <Minus className="size-3.5" aria-hidden="true" />,
};

interface StatusBadgeProps {
  status: RequestStatus | BookingStatus;
  /** Overrides the standard wording, for example "Confirmed" in a table. */
  label?: string;
  className?: string;
}

/** Shared status pill for requests and bookings. */
export default function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const tone = requestStatusTone(status);
  const text =
    label ??
    (status in REQUEST_STATUS_LABELS
      ? REQUEST_STATUS_LABELS[status as RequestStatus]
      : BOOKING_STATUS_LABELS[status as BookingStatus]);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {TONE_ICONS[tone]}
      {text}
    </span>
  );
}
