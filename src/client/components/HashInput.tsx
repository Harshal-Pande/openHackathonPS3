import React, { useRef, useCallback } from 'react';
import { extractHash } from '../lib/extractHash.js';

interface HashInputProps {
  value: string;
  onChange: (val: string) => void;
  hasError?: boolean;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  'data-testid'?: string;
  onSubmit?: () => void;
}

export const HashInput: React.FC<HashInputProps> = ({
  value,
  onChange,
  hasError,
  id = 'txHash',
  placeholder = '0x...',
  disabled = false,
  'data-testid': testId,
  onSubmit,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const len = value.replace(/^0x/, '').length;
  const isComplete = len === 64;

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const extracted = extractHash(pasted);
    if (extracted && extracted !== pasted.trim()) {
      e.preventDefault();
      onChange(extracted);
    }
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSubmit?.();
  }, [onSubmit]);

  return (
    <div className="hash-input-wrap">
      <input
        ref={inputRef}
        id={id}
        type="text"
        className={['hash-input', hasError ? 'hash-input--error' : ''].filter(Boolean).join(' ')}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        data-testid={testId}
        onChange={e => onChange(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        aria-invalid={hasError ? 'true' : 'false'}
      />
      <span className={['hash-input__counter', isComplete ? 'hash-input__counter--done' : ''].filter(Boolean).join(' ')}>
        {len}/64
      </span>
    </div>
  );
};
