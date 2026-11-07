import {
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from 'react';
import {
  canonicalToViNumberInput,
  caretAfterSignificant,
  formatViNumberInput,
  sameCanonicalNumber,
  significantBefore,
  viNumberInputToCanonical,
} from '@/shared/lib/numeric/vi-number-input';

type ViNumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  /** Canonical string (`1234.5`), the same value forms already keep. */
  value: string;
  /** Receives the canonical string; return false to reject the keystroke. */
  onChange: (canonical: string) => boolean | void;
  maxFractionDigits: number;
};

/** Text input that shows `1.234,5` while the form keeps `1234.5`. */
export function ViNumberInput({
  value,
  onChange,
  maxFractionDigits,
  onBlur,
  inputMode,
  ...rest
}: ViNumberInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const [display, setDisplay] = useState(() => canonicalToViNumberInput(value));
  // Follow value changes made by the form itself (reset, quick amount, load).
  if (!sameCanonicalNumber(viNumberInputToCanonical(display), value)) {
    setDisplay(canonicalToViNumberInput(value));
  }

  useLayoutEffect(() => {
    if (caret.current === null || document.activeElement !== input.current)
      return;
    input.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [display]);

  return (
    <input
      {...rest}
      ref={input}
      type="text"
      autoComplete="off"
      inputMode={inputMode ?? (maxFractionDigits > 0 ? 'decimal' : 'numeric')}
      value={display}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        const next = formatViNumberInput(raw, maxFractionDigits);
        if (onChange(viNumberInputToCanonical(next)) === false) return;
        caret.current = caretAfterSignificant(
          next,
          significantBefore(
            raw,
            event.currentTarget.selectionStart ?? raw.length,
          ),
        );
        setDisplay(next);
      }}
      onBlur={(event) => {
        // Drop a dangling comma or zero-only decimals once the person leaves.
        setDisplay(canonicalToViNumberInput(value.replace(/\.$/, '')));
        onBlur?.(event);
      }}
    />
  );
}
