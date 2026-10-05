import { cn } from '../utils/cn';

interface FormFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel' | 'password' | 'date' | 'time';
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  inputMode?: 'text' | 'email' | 'tel';
  /** Earliest value for date and time inputs. */
  min?: string;
  /** Latest value for date and time inputs. */
  max?: string;
  /** Keeps long free text inputs honest about their limit. */
  maxLength?: number;
}

/** Labelled input with hint and error text, shared by the auth and profile forms. */
export default function FormField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  placeholder,
  hint,
  error,
  required = false,
  disabled = false,
  inputMode,
  min,
  max,
  maxLength,
}: FormFieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-stone-700">
        {label}
        {required ? <span className="ml-0.5 text-clay-600">*</span> : null}
      </label>

      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        inputMode={inputMode}
        min={min}
        max={max}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          'w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400',
          'transition-colors focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none',
          'disabled:cursor-not-allowed disabled:bg-stone-100',
          error ? 'border-red-400' : 'border-stone-300',
        )}
      />

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
