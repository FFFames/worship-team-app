/** TransposeControls — semitone transpose button bar with flat/sharp toggle
 *
 * Uses CSS variable tokens (no hardcoded hex). Center shows the
 * effective key as an accent pill; surrounding buttons nudge by
 * semitone offsets; the ♯/♭ toggle switches notation.
 */

import { transposeKey } from '../utils/transpose';

export interface TransposeControlsProps {
  currentKey: string;
  transpose: number;
  useFlats: boolean;
  onTransposeChange: (semitones: number) => void;
  onFlatsToggle: () => void;
}

export function TransposeControls({
  currentKey,
  transpose,
  useFlats,
  onTransposeChange,
  onFlatsToggle,
}: TransposeControlsProps) {
  const effectiveKey = transposeKey(currentKey, transpose, useFlats);

  const offsets = [-5, -2, -1, 0, 1, 2, 5];

  const baseBtnStyle: React.CSSProperties = {
    height: 34,
    minWidth: 34,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-sm)',
    fontSize: '0.75rem',
    fontWeight: 500,
    fontFamily: 'var(--font-mono)',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-tertiary)',
    color: 'var(--fg-secondary)',
    cursor: 'pointer',
    transition: 'all var(--duration-fast) var(--ease-out)',
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
        padding: 'var(--space-sm)',
      }}
    >
      {offsets.map((offset) => {
        const isCenter = offset === 0;

        if (isCenter) {
          // Center key display — accent pill
          return (
            <button
              key={offset}
              className="flex h-[34px] min-w-[2.75rem] items-center justify-center px-2.5 text-sm font-semibold"
              style={{
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--accent-muted)',
                background: 'var(--accent-bg)',
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)',
                cursor: 'default',
              }}
              disabled
            >
              {effectiveKey}
            </button>
          );
        }

        const label = offset > 0 ? `+${offset}` : `${offset}`;

        return (
          <button
            key={offset}
            onClick={() => onTransposeChange(transpose + offset)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-prominent)';
              e.currentTarget.style.color = 'var(--fg-primary)';
              e.currentTarget.style.background = 'var(--bg-input)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
              e.currentTarget.style.color = 'var(--fg-secondary)';
              e.currentTarget.style.background = 'var(--bg-tertiary)';
            }}
            style={baseBtnStyle}
          >
            {label}
          </button>
        );
      })}

      {/* Flat / Sharp toggle */}
      <button
        onClick={onFlatsToggle}
        title={useFlats ? 'Switch to sharps' : 'Switch to flats'}
        style={baseBtnStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent-muted)';
          e.currentTarget.style.color = 'var(--accent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-subtle)';
          e.currentTarget.style.color = 'var(--fg-secondary)';
        }}
      >
        {useFlats ? '♭' : '♯'}
      </button>
    </div>
  );
}
