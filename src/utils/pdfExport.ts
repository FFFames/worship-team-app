/** PDF generation utility — exports a full playlist to a downloadable A4 PDF.
 *  Uses jsPDF with two-column layout for compact chord chart printing. */

import { jsPDF } from 'jspdf';
import type { PlaylistSong } from '../types/database';
import { transposeChordLine, transposeKey } from './transpose';

const PAGE_W = 210; // A4 width mm
const PAGE_H = 297; // A4 height mm
const MARGIN_TOP = 15;
const MARGIN_BOTTOM = 12;
const COL_LEFT_X = 10;
const COL_RIGHT_X = 110;
const COL_W = 90;
const CONTENT_H = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM;

interface ColumnState {
  x: number;
  y: number;
  pageIndex: number;
}

function newPage(doc: jsPDF, state: ColumnState): ColumnState {
  state.pageIndex++;
  doc.addPage();
  state.x = COL_LEFT_X;
  state.y = MARGIN_TOP;
  return state;
}

function nextColumn(doc: jsPDF, state: ColumnState): ColumnState {
  if (state.x === COL_LEFT_X) {
    // Move to right column
    state.x = COL_RIGHT_X;
    state.y = MARGIN_TOP;
  } else {
    // Right column filled — new page, left column
    newPage(doc, state);
  }
  return state;
}

/**
 * Export an entire playlist as a PDF chord chart and trigger a browser download.
 *
 * @param playlistName  — used as the document title & filename
 * @param playlistSongs — ordered array with joined `song` data
 */
export function exportPlaylistToPDF(
  playlistName: string,
  playlistSongs: PlaylistSong[],
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Title page header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(playlistName, PAGE_W / 2, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${playlistSongs.length} song${playlistSongs.length !== 1 ? 's' : ''}`,
    PAGE_W / 2,
    27,
    { align: 'center' },
  );

  const state: ColumnState = {
    x: COL_LEFT_X,
    y: 38,
    pageIndex: 0,
  };

  for (const ps of playlistSongs) {
    const song = ps.song;
    if (!song) continue;

    const transpose = ps.transpose_semitones ?? 0;
    const transposedKey =
      transpose !== 0 ? transposeKey(song.original_key, transpose) : song.original_key;

    // --- Estimate song height to check if it fits ---
    const sections = song.content_parsed?.sections ?? [];
    let estimatedHeight = 12; // title + key lines
    for (const section of sections) {
      estimatedHeight += 5; // section header
      for (const line of section.lines) {
        estimatedHeight += line.chords ? 7 : 0;
        estimatedHeight += line.lyrics ? 6 : 0;
      }
      estimatedHeight += 4; // section gap
    }
    estimatedHeight += 10; // inter-song gap

    // If song won't fit in remaining column space, move to next column
    if (state.y + Math.min(estimatedHeight, 40) > PAGE_H - MARGIN_BOTTOM) {
      nextColumn(doc, state);
    }

    // --- Song title ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(song.title, state.x, state.y);
    state.y += 6;

    // --- Key ---
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const keyLabel =
      transpose !== 0
        ? `Key: ${song.original_key} → ${transposedKey}`
        : `Key: ${song.original_key}`;
    doc.text(keyLabel, state.x, state.y);
    state.y += 6;

    // --- Chord + lyric lines ---
    doc.setFont('courier', 'normal');
    doc.setFontSize(9);

    for (const section of sections) {
      // Check if we need a new column
      if (state.y + 15 > PAGE_H - MARGIN_BOTTOM) {
        nextColumn(doc, state);
      }

      // Section marker
      if (section.marker) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(section.marker, state.x, state.y);
        state.y += 5;
        doc.setFont('courier', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
      }

      for (const line of section.lines) {
        // Check column overflow
        if (state.y + 7 > PAGE_H - MARGIN_BOTTOM) {
          nextColumn(doc, state);
        }

        // Chord line
        if (line.chords) {
          const transposedChords =
            transpose !== 0
              ? transposeChordLine(line.chords, transpose)
              : line.chords;
          doc.setTextColor(0, 128, 80);
          doc.text(transposedChords, state.x, state.y);
          state.y += 4;
        }

        // Lyrics line
        if (line.lyrics) {
          doc.setTextColor(0, 0, 0);
          doc.text(line.lyrics, state.x, state.y);
          state.y += 5;
        }
      }

      // Gap between sections
      state.y += 3;
    }

    // Gap between songs
    state.y += 6;
  }

  // Page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(`${i} / ${totalPages}`, PAGE_W / 2, PAGE_H - 5, { align: 'center' });
  }

  doc.save(`${playlistName}.pdf`);
}
