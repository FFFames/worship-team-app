/** ChordDisplay — renders aligned chords + lyrics for parsed song sections
 *
 * Uses CSS variable tokens throughout. Chords use Source Code Pro mono
 * in the accent color; lyrics use the body font in the primary color.
 * Spacing is generous for on-stage readability.
 */

import type { Section } from '../types/database';
import { getSectionDisplayLabel } from '../utils/chordParser';
import { transposeChordLine } from '../utils/transpose';

export interface ChordDisplayProps {
  sections: Section[];
  transpose: number;
  useFlats?: boolean;
  showChords?: boolean;
  className?: string;
  /** Center the entire chart block horizontally (preserves chord/lyric alignment) */
  center?: boolean;
}

export function ChordDisplay({
  sections,
  transpose,
  useFlats = false,
  showChords = true,
  className = '',
  center = false,
}: ChordDisplayProps) {
  const content = (
    <>
      {sections.map((section, si) => (
        <div key={si} style={{ marginBottom: 'var(--space-xl)' }}>
          {/* Section marker label */}
          {getSectionDisplayLabel(section) !== '' && (
            <div
              style={{
                marginBottom: 'var(--space-sm)',
                fontSize: '0.75rem',
                fontWeight: 500,
                color: 'var(--accent)',
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.02em',
              }}
            >
              {getSectionDisplayLabel(section)}
            </div>
          )}

          {/* Chord + lyric line pairs */}
          {section.lines.map((line, li) => (
            <div key={li}>
              {showChords && line.chords && (
                <div
                  className="chord-text"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.9375rem',
                    lineHeight: 1.4,
                    color: 'var(--accent)',
                    whiteSpace: 'pre',
                    fontWeight: 600,
                  }}
                >
                  {transposeChordLine(line.chords, transpose, useFlats)}
                </div>
              )}
              {line.lyrics && (
                <div
                  style={{
                    fontSize: '1.0625rem',
                    lineHeight: 1.6,
                    color: 'var(--fg-primary)',
                    whiteSpace: 'pre',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {line.lyrics}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );

  // When centering: wrap in flex + inline-block so the chart block is
  // centered as a unit while internal chord/lyric alignment is preserved.
  if (center) {
    return (
      <div className={className} style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'inline-block', textAlign: 'left' }}>{content}</div>
      </div>
    );
  }

  return <div className={className}>{content}</div>;
}
