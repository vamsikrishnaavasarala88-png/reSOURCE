import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

/**
 * Extra form controls used by the space marketplace. They share the look of
 * the existing `FormField` input so the marketplace matches Phase 2 forms.
 */

const BASE_CONTROL =
  'w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 ' +
  'transition-colors focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-stone-100';

function controlClasses(error?: string): string {
  return cn(BASE_CONTROL, error ? 'border-red-400' : 'border-stone-300');
}

interface ControlShellProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

function ControlShell({ id, label, hint, error, required, children }: ControlShellProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-stone-700">
        {label}
        {required ? <span className="ml-0.5 text-clay-600">*</span> : null}
      </label>

      {children}

      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-stone-500">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

/** Numeric input with the shared label/hint/error shell. */
export function NumberField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  required = false,
  min,
  max,
  step = 1,
  disabled = false,
}: NumberFieldProps) {
  return (
    <ControlShell id={id} label={label} hint={hint} error={error} required={required}>
      <input
        id={id}
        name={id}
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') ||
          undefined
        }
        className={controlClasses(error)}
      />
    </ControlShell>
  );
}

interface TextAreaFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  rows?: number;
  maxLength?: number;
}

/** Multi-line input for descriptions and notes. */
export function TextAreaField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  required = false,
  rows = 4,
  maxLength,
}: TextAreaFieldProps) {
  return (
    <ControlShell id={id} label={label} hint={hint} error={error} required={required}>
      <textarea
        id={id}
        name={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') ||
          undefined
        }
        className={cn(controlClasses(error), 'resize-y')}
      />
    </ControlShell>
  );
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<SelectOption>;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Optional leading option, e.g. "Any activity". */
  placeholderOption?: string;
  className?: string;
}

/** Native select, styled to match the rest of the forms. */
export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  hint,
  error,
  required = false,
  disabled = false,
  placeholderOption,
  className,
}: SelectFieldProps) {
  return (
    <ControlShell id={id} label={label} hint={hint} error={error} required={required}>
      <select
        id={id}
        name={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') ||
          undefined
        }
        className={cn(controlClasses(error), 'appearance-none pr-9', className)}
      >
        {placeholderOption ? <option value="">{placeholderOption}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </ControlShell>
  );
}

interface CheckboxChipProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Pill style checkbox used for facilities. */
export function CheckboxChip({
  id,
  label,
  checked,
  onChange,
  disabled = false,
}: CheckboxChipProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm',
        checked
          ? 'border-brand-600 bg-brand-50 text-brand-800'
          : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
        disabled ? 'cursor-not-allowed opacity-60' : null,
      )}
    >
      <input
        id={id}
        name={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500"
      />
      {label}
    </label>
  );
}
