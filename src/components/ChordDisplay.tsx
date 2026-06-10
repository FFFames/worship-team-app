/** ChordDisplay — renders aligned chords + lyrics for parsed song sections */

import type { Section } from '../types/database';
import { transposeChordLine } from '../utils/transpose';

export interface ChordDisplayProps {
  sections: Section[];
  transpose: number;
  useFlats?: boolean;
  showChords?: boolean;
  className?: string;
}

export function ChordDisplay({
  sections,
  transpose,
  useFlats = false,
  showChords = true,
  className = '',
}: ChordDisplayProps) {
  return (
    <div className={className}>
      {sections.map((section, si) => (
        <div key={si} className="mb-6">
          {/* Section marker label */}
          {section.marker !== '' && (
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-[#898989]">
              {section.marker}
            </div>
          )}

          {/* Chord + lyric line pairs */}
          {section.lines.map((line, li) => (
            <div key={li}>
              {showChords && line.chords && (
                <div className="font-mono text-sm leading-tight text-[#3ecf8e] whitespace-pre">
                  {transposeChordLine(line.chords, transpose, useFlats)}
                </div>
              )}
              {line.lyrics && (
                <div className="text-base leading-relaxed text-[#fafafa] whitespace-pre">
                  {line.lyrics}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
