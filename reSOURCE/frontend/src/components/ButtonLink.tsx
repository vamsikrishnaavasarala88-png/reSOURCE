import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../utils/cn';

export type ButtonLinkVariant = 'primary' | 'secondary' | 'onDark' | 'onDarkOutline';

export type ButtonLinkSize = 'sm' | 'md';

const SIZE_CLASSES: Record<ButtonLinkSize, string> = {
  sm: 'px-3.5 py-2 text-xs sm:text-sm',
  md: 'px-5 py-3 text-sm sm:text-base',
};

const VARIANT_CLASSES: Record<ButtonLinkVariant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800',
  secondary: 'bg-white text-stone-800 ring-1 ring-stone-300 hover:bg-stone-100',
  onDark: 'bg-white text-brand-900 shadow-sm hover:bg-brand-50',
  onDarkOutline: 'bg-transparent text-white ring-1 ring-white/40 hover:bg-white/10',
};

interface ButtonLinkProps {
  to: string;
  children: ReactNode;
  variant?: ButtonLinkVariant;
  size?: ButtonLinkSize;
  className?: string;
}

/** Router link styled as a button, shared by the hero, cards and placeholder pages. */
export default function ButtonLink({
  to,
  children,
  variant = 'primary',
  size = 'md',
  className,
}: ButtonLinkProps) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
