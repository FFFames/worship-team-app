/** ChordDisplay — renders song sections with chord+lyric lines, section markers, and transpose */

import { SECTION_MARKERS, SECTION_LABELS } from '../types/database';
import type { SongContent, SectionType } from '../types/database';
import { transposeChordLine } from '../utils/transpose';

interface ChordDisplayProps {
  content: SongContent;
  transpose?: number;
  chordFontSize?: string;
  lyricFontSize?: string;
  showChords?: boolean;
}

/** Map section type to display color */
function sectionColor(type: SectionType): string {
  switch (type) {
    case 'chorus': return 'text-[#3ecf8e]';
    case 'bridge': return 'text-[#e0a526]';
    case 'pre_chorus': return 'text-[#6fa3f7]';
    case 'intro':
    case 'outro':
    case 'interlude': return 'text-[#898989]';
    case 'tag': return 'text-[#c084fc]';
    default: return 'text-[#b4b4b4]';
  }
}

export function ChordDisplay({
  content,
  transpose = 0,
  chordFontSize = 'text-xs',
  lyricFontSize = 'text-sm',
  showChords = true,
}: ChordDisplayProps) {
  return (
    <div className="space-y-4">
      {content.sections.map((section, sIdx) => {
        const marker = section.marker || SECTION_MARKERS[section.type];
        const label = SECTION_LABELS[section.type];
        const color = sectionColor(section.type);

        return (
          <div key={sIdx} className="relative">
            {/* Section marker/label */}
            {(marker || label) && (
              <div className={`inline-block mb-1 text-xs font-medium tracking-wide ${color} opacity-80`}>
                {marker} {label}
              </div>
            )}

            {/* Lines */}
            <div className="space-y-0">
              {section.lines.map((line, lIdx) => {
                const transposedChords = showChords && line.chords
                  ? transposeChordLine(line.chords, transpose)
                  : '';

                return (
                  <div key={lIdx} className="font-mono leading-snug">
                    {showChords && transposedChords && (
                      <div className={`${chordFontSize} text-[#3ecf8e] whitespace-pre`}>
                        {transposedChords}
                      </div>
                    )}
                    <div className={`${lyricFontSize} text-[var(--color-text-primary)] whitespace-pre`}>
                      {line.lyrics}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
