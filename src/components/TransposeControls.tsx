/** TransposeControls — per-song transpose buttons (-2, -1, key, +1, +2) */

import { transposeKey } from '../utils/transpose';

interface TransposeControlsProps {
  originalKey: string;
  semitones: number;
  onChange: (semitones: number) => void;
  size?: 'sm' | 'md';
}

export function TransposeControls({
  originalKey,
  semitones,
  onChange,
  size = 'sm',
}: TransposeControlsProps) {
  const displayKey = transposeKey(originalKey, semitones);
  const btnClass = size === 'sm'
    ? 'px-1.5 py-0.5 text-xs'
    : 'px-2.5 py-1 text-sm';

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(semitones - 2)}
        className={`${btnClass} rounded bg-[var(--color-bg-deepest)] border border-[var(--color-border-standard)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-prominent)] transition-colors`}
        title="Transpose down 2"
      >
        -2
      </button>
      <button
        type="button"
        onClick={() => onChange(semitones - 1)}
        className={`${btnClass} rounded bg-[var(--color-bg-deepest)] border border-[var(--color-border-standard)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-prominent)] transition-colors`}
        title="Transpose down 1"
      >
        -1
      </button>
      <span className={`${size === 'sm' ? 'text-xs' : 'text-sm'} min-w-[2rem] text-center font-medium text-[var(--color-text-primary)]`}>
        {displayKey}
      </span>
      <button
        type="button"
        onClick={() => onChange(semitones + 1)}
        className={`${btnClass} rounded bg-[var(--color-bg-deepest)] border border-[var(--color-border-standard)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-prominent)] transition-colors`}
        title="Transpose up 1"
      >
        +1
      </button>
      <button
        type="button"
        onClick={() => onChange(semitones + 2)}
        className={`${btnClass} rounded bg-[var(--color-bg-deepest)] border border-[var(--color-border-standard)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-prominent)] transition-colors`}
        title="Transpose up 2"
      >
        +2
      </button>
    </div>
  );
}
