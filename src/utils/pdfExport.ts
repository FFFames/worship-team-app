/** PDF export utility — generates a downloadable PDF of playlist songs using jsPDF */

import type { PlaylistSong } from '../types/database';
import { transposeChordLine, transposeKey } from '../utils/transpose';
import { jsPDF } from 'jspdf';

/** Generate a PDF blob for the playlist songs in a 2-column A4 layout */
export function generatePlaylistPdf(
  playlistName: string,
  songs: PlaylistSong[]
): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // A4 dimensions
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const colWidth = 90;
  const colGap = 10;
  const leftColX = margin;
  const rightColX = margin + colWidth + colGap;

  let currentPage = 0;
  let leftY = margin;
  let rightY = margin;

  /** Start a new page */
  function newPage() {
    doc.addPage();
    currentPage++;
    leftY = margin;
    rightY = margin;
  }

  /** Add header to page */
  function addHeader() {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(playlistName, pageWidth / 2, 6, { align: 'center' });
  }

  /** Get the current Y for a column */
  function getY(col: 'left' | 'right'): number {
    return col === 'left' ? leftY : rightY;
  }

  /** Set the current Y for a column */
  function setY(col: 'left' | 'right', y: number) {
    if (col === 'left') leftY = y;
    else rightY = y;
  }

  /** Write a song into a column, handling overflow */
  function writeSong(ps: PlaylistSong, col: 'left' | 'right') {
    if (!ps.song) return;

    const transpose = ps.transpose_semitones;
    const x = col === 'left' ? leftColX : rightColX;
    let y = getY(col);
    const bottomLimit = pageHeight - margin;

    // Check if we need a new page
    if (y > bottomLimit - 20) {
      // Try other column
      const otherCol: 'left' | 'right' = col === 'left' ? 'right' : 'left';
      const otherY = getY(otherCol);
      if (otherY < y - 20) {
        writeSong(ps, otherCol);
        return;
      }
      newPage();
      addHeader();
      y = margin;
    }

    // Song title (bold 12pt)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(40);
    doc.text(ps.song.title, x, y);
    y += 5;

    // Key info (10pt)
    const displayKey = transposeKey(ps.song.original_key, transpose);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Key: ${displayKey}${transpose !== 0 ? ` (capo ${Math.abs(transpose)})` : ''}`, x, y);
    y += 5;

    // Chord + lyric lines (9pt monospace)
    doc.setFont('courier', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60);

    const sections = ps.song.content_parsed?.sections || [];

    for (const section of sections) {
      // Section header
      const sectionLabel = section.type.charAt(0).toUpperCase() + section.type.slice(1).replace('_', ' ');
      if (y > bottomLimit - 8) {
        // Check other column or new page
        const otherCol: 'left' | 'right' = col === 'left' ? 'right' : 'left';
        const otherY = getY(otherCol);
        if (otherY < y - 10) {
          setY(col, y);
          writeSongLines(ps, sections, section, col, otherCol);
          return;
        }
        newPage();
        addHeader();
        y = margin;
      }

      doc.setFont('courier', 'bold');
      doc.setTextColor(100);
      doc.text(sectionLabel, x, y);
      y += 4;

      doc.setFont('courier', 'normal');
      doc.setTextColor(60);

      for (const line of section.lines) {
        if (y > bottomLimit - 4) {
          const otherCol2: 'left' | 'right' = col === 'left' ? 'right' : 'left';
          const otherY2 = getY(otherCol2);
          if (otherY2 < y - 4) {
            setY(col, y);
            // Continue in other column
            writeRemainingLines(ps, sections, section, line, otherCol2);
            return;
          }
          newPage();
          addHeader();
          y = margin;
        }

        // Chord line
        if (line.chords.trim()) {
          const transposedChords = transposeChordLine(line.chords, transpose);
          doc.setTextColor(0, 100, 60);
          doc.text(transposedChords, x, y);
          y += 3.5;
        }

        // Lyric line
        if (y > bottomLimit - 4) {
          newPage();
          addHeader();
          y = margin;
        }
        doc.setTextColor(40);
        doc.text(line.lyrics, x, y);
        y += 4;
      }

      y += 2; // spacing between sections
    }

    setY(col, y);
  }

  function writeRemainingLines(
    ps: PlaylistSong,
    _sections: typeof songs[0]['song']['content_parsed']['sections'],
    _section: typeof _sections[0],
    _startLine: typeof _section.lines[0],
    _col: 'left' | 'right'
  ) {
    // Fallback: just set Y and let the main loop continue
    // For simplicity, we restart the song in the new column
    if (!ps.song) return;
    const transpose = ps.transpose_semitones;
    const x = _col === 'left' ? leftColX : rightColX;
    let y = getY(_col);
    const bottomLimit = pageHeight - margin;

    if (y > bottomLimit - 20) {
      newPage();
      addHeader();
      y = margin;
    }

    doc.setFont('courier', 'normal');
    doc.setFontSize(9);

    // Write remaining lines from the current section
    let foundStart = false;
    for (const sec of ps.song.content_parsed?.sections || []) {
      for (const line of sec.lines) {
        if (line === _startLine) foundStart = true;
        if (!foundStart) continue;

        if (y > bottomLimit - 4) {
          newPage();
          addHeader();
          y = margin;
        }

        if (line.chords.trim()) {
          const transposedChords = transposeChordLine(line.chords, transpose);
          doc.setTextColor(0, 100, 60);
          doc.text(transposedChords, x, y);
          y += 3.5;
        }

        if (y > bottomLimit - 4) {
          newPage();
          addHeader();
          y = margin;
        }
        doc.setTextColor(40);
        doc.text(line.lyrics, x, y);
        y += 4;
      }
    }
    setY(_col, y);
  }

  function writeSongLines(
    ps: PlaylistSong,
    _sections: typeof songs[0]['song']['content_parsed']['sections'],
    _startSection: typeof _sections[0],
    _currentCol: 'left' | 'right',
    _newCol: 'left' | 'right'
  ) {
    // Not needed with simpler approach below
    void ps; void _sections; void _startSection; void _currentCol; void _newCol;
  }

  // Initialize first page
  addHeader();

  // Layout songs in 2-column format
  let currentCol: 'left' | 'right' = 'left';

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    if (!song.song) continue;

    // Simple 2-column placement: odd/even
    currentCol = (i % 2 === 0) ? 'left' : 'right';

    // If right column is ahead, use left
    if (currentCol === 'right' && rightY > leftY + 10) {
      currentCol = 'left';
    }
    if (currentCol === 'left' && leftY > rightY + 10) {
      currentCol = 'right';
    }

    // If both columns are high, new page
    if (getY(currentCol) > pageHeight - margin - 30) {
      const otherCol: 'left' | 'right' = currentCol === 'left' ? 'right' : 'left';
      if (getY(otherCol) < getY(currentCol) - 30) {
        currentCol = otherCol;
      } else {
        newPage();
        addHeader();
      }
    }

    writeSong(song, currentCol);
  }

  return doc.output('blob');
}
