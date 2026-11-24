import { useState } from 'react';
import { Wind } from 'lucide-react';

interface SmogWiseBrandProps {
  variant?: 'lockup' | 'icon';
  className?: string;
}

/**
 * Renders the official SmogWise brand assets extracted from the user's brand sheet,
 * preserving original aspect ratios on crisp light surfaces with accessible alt text.
 */
export function SmogWiseBrand({ variant = 'lockup', className = '' }: SmogWiseBrandProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return variant === 'icon' ? (
      <span
        className={`w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0 ${className}`}
        aria-label="SmogWise"
      >
        <Wind className="w-4 h-4" aria-hidden="true" />
      </span>
    ) : (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <span className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
          <Wind className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap">
          SmogWise
        </span>
      </span>
    );
  }

  if (variant === 'icon') {
    return (
      <img
        src="/smogwise-logo-icon.png"
        alt="SmogWise"
        width={34}
        height={34}
        decoding="async"
        onError={() => setImgFailed(true)}
        className={`h-8 w-8 object-contain shrink-0 select-none ${className}`}
      />
    );
  }

  return (
    <img
      src="/smogwise-logo-lockup.png"
      alt="SmogWise — Your Urban Air Quality Companion"
      width={176}
      height={56}
      decoding="async"
      onError={() => setImgFailed(true)}
      className={`h-11 w-auto max-w-[184px] object-contain shrink-0 select-none ${className}`}
    />
  );
}
