import { useId, useState, type FocusEvent } from 'react';
import {
  editingGrammarFor,
  numericErrorMessages,
  validateCanonicalNumber,
  type NumericKind,
} from '@/shared/lib/numeric/canonical-number';

type NumericFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  kind: NumericKind;
  precision: number;
  required?: boolean;
  positive?: boolean;
  disabled?: boolean;
  name?: string;
  helperText?: string;
  error?: string;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
};

export function NumericField({
  label,
  value,
  onChange,
  kind,
  precision,
  required = false,
  positive = false,
  disabled = false,
  name,
  helperText,
  error,
  onBlur,
}: NumericFieldProps) {
  const generatedId = useId();
  const inputId = `numeric-${generatedId}`;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const [localError, setLocalError] = useState<string | null>(null);
  const visibleError = error ?? localError;

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-2 block text-sm font-medium text-slate-800"
      >
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(visibleError)}
        aria-describedby={
          [helperText ? helperId : null, visibleError ? errorId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          if (!editingGrammarFor(kind).test(nextValue)) {
            setLocalError(numericErrorMessages.NUMBER_FORMAT_INVALID);
            return;
          }

          setLocalError(null);
          onChange(nextValue);
        }}
        onBlur={(event) => {
          const result = validateCanonicalNumber(value, {
            kind,
            precision,
            required,
            positive,
          });
          setLocalError(result.ok ? null : result.message);
          onBlur?.(event);
        }}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition-colors focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      />
      {helperText ? (
        <p id={helperId} className="mt-2 text-sm text-slate-600">
          {helperText}
        </p>
      ) : null}
      {visibleError ? (
        <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">
          {visibleError}
        </p>
      ) : null}
    </div>
  );
}
