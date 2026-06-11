/** TransposeControls — semitone transpose button bar with flat/sharp toggle */

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

  return (
    <div className="flex flex-wrap items-center gap-1 md:gap-2 rounded-lg border border-[#2e2e2e] bg-[#171717] p-2.5">
      {offsets.map((offset) => {
        const isCenter = offset === 0;

        if (isCenter) {
          // Center key display
          return (
            <button
              key={offset}
              className="flex h-8 min-w-[2.5rem] items-center justify-center rounded-md border border-[rgba(62,207,142,0.3)] bg-[rgba(62,207,142,0.15)] px-2 text-sm font-medium text-[#3ecf8e]"
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
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#2e2e2e] bg-[#242424] text-xs font-medium text-[#b4b4b4] transition-colors hover:bg-[#2e2e2e] hover:text-[#fafafa] active:bg-[#363636]"
          >
            {label}
          </button>
        );
      })}

      {/* Flat / Sharp toggle */}
      <button
        onClick={onFlatsToggle}
        className="ml-1 flex h-8 w-8 items-center justify-center rounded-md border border-[#2e2e2e] bg-[#242424] text-sm font-medium text-[#b4b4b4] transition-colors hover:bg-[#2e2e2e] hover:text-[#fafafa] active:bg-[#363636]"
        title={useFlats ? 'Switch to sharps' : 'Switch to flats'}
      >
        {useFlats ? '♭' : '♯'}
      </button>
    </div>
  );
}
