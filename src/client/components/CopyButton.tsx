import React, { useState, useCallback } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  onCopy?: (text: string) => void;
  label?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({ text, onCopy, label }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      onCopy?.(text);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Silently fail
    }
  }, [text, onCopy]);

  return (
    <button
      className={['copy-btn', copied ? 'copy-btn--success' : ''].filter(Boolean).join(' ')}
      onClick={handleCopy}
      aria-label={label || `Copy ${text.slice(0, 20)}`}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
      type="button"
    >
      {copied ? <Check size={14} strokeWidth={1.75} aria-hidden /> : <Copy size={14} strokeWidth={1.75} aria-hidden />}
    </button>
  );
};
