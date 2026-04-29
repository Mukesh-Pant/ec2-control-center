import { useEffect, useRef } from 'react';

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  length?: number;
}

/**
 * Six-digit (configurable) OTP grid. Auto-advances on input, Backspace
 * walks left when current cell is empty, and onComplete fires when all
 * cells are filled — the consuming form decides whether to auto-submit.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  length = 6,
}: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const setDigit = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, 1);
    const next = [...value];
    next[i] = v;
    onChange(next);
    if (v && i < length - 1) refs.current[i + 1]?.focus();
    if (next.every((d) => d) && next.length === length) {
      onComplete?.(next.join(''));
    }
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!text) return;
    e.preventDefault();
    const next = Array.from({ length }, (_, i) => text[i] ?? '');
    onChange(next);
    const lastFilled = Math.min(text.length, length) - 1;
    refs.current[lastFilled]?.focus();
    if (text.length === length) onComplete?.(text);
  };

  return (
    <div className="lf-otp-row">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="lf-otp"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          disabled={disabled}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
