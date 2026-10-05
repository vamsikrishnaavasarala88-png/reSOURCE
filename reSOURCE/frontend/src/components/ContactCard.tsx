import { Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import type { ContactDetails } from '../types/request';

interface ContactCardProps {
  title: string;
  contact: ContactDetails;
}

/**
 * Contact details of the other party of a confirmed booking.
 *
 * <p>Only rendered when the API sent the details, which it does for the two
 * parties of a confirmed booking and never before acceptance.</p>
 */
export default function ContactCard({ title, contact }: ContactCardProps) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-900">
        <ShieldCheck className="size-4 text-brand-600" aria-hidden="true" />
        {title}
      </h3>

      <dl className="mt-3 space-y-2 text-sm text-brand-900">
        <div className="flex items-center gap-2">
          <dt className="sr-only">Name</dt>
          <UserRound className="size-4 text-brand-600" aria-hidden="true" />
          <dd className="font-medium">{contact.name}</dd>
        </div>

        <div className="flex items-center gap-2">
          <dt className="sr-only">Phone</dt>
          <Phone className="size-4 text-brand-600" aria-hidden="true" />
          <dd>{contact.phone?.trim() || 'No phone number on file'}</dd>
        </div>

        <div className="flex items-center gap-2">
          <dt className="sr-only">Email</dt>
          <Mail className="size-4 text-brand-600" aria-hidden="true" />
          <dd className="break-all">{contact.email}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {contact.phone?.trim() ? (
          <a
            href={`tel:${contact.phone.replace(/\s+/g, '')}`}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <Phone className="size-4" aria-hidden="true" />
            Call
          </a>
        ) : null}

        <a
          href={`mailto:${contact.email}`}
          className="inline-flex items-center gap-2 rounded-full border border-brand-300 bg-white px-3.5 py-2 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50"
        >
          <Mail className="size-4" aria-hidden="true" />
          Email
        </a>
      </div>
    </div>
  );
}
