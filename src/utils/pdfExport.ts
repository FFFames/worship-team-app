/** PDF generation utility — exports a full playlist to a downloadable A4 PDF.
 *  Uses jsPDF with two-column layout for compact chord chart printing.
 *  Loads Thonburi font at runtime for full Thai character support. */

import { jsPDF } from 'jspdf';
import type { PlaylistSong } from '../types/database';
import { transposeChordLine, transposeKey } from './transpose';

const FONT_NAME = 'Thonburi';
const FONT_URL = '/Thonburi.ttf';

/** Cache the loaded font base64 to avoid re-fetching */
let cachedFontBase64: string | null = null;

/** Fetch and convert the Thonburi font to base64 */
async function loadThaiFont(): Promise<string> {
  if (cachedFontBase64) return cachedFontBase64;

  const response = await fetch(FONT_URL);
  if (!response.ok) throw new Error(`Failed to fetch font: ${response.status}`);

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Convert to base64 in chunks to avoid stack overflow
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  cachedFontBase64 = btoa(binary);
  return cachedFontBase64;
}

const PAGE_W = 210; // A4 width mm
const PAGE_H = 297; // A4 height mm
const MARGIN_TOP = 15;
const MARGIN_BOTTOM = 12;
const COL_LEFT_X = 10;
const COL_RIGHT_X = 110;

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
    state.x = COL_RIGHT_X;
    state.y = MARGIN_TOP;
  } else {
    newPage(doc, state);
  }
  return state;
}

/**
 * Export an entire playlist as a PDF chord chart and trigger a browser download.
 * Loads Thai font on first call, subsequent calls use cached font.
 */
export async function exportPlaylistToPDF(
  playlistName: string,
  playlistSongs: PlaylistSong[],
): Promise<void> {
  // Load Thai font
  const fontBase64 = await loadThaiFont();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Embed Thonburi font for Thai support — register normal, bold, italic variants
  doc.addFileToVFS('Thonburi.ttf', fontBase64);
  doc.addFont('Thonburi.ttf', FONT_NAME, 'normal');
  doc.addFont('Thonburi.ttf', FONT_NAME, 'bold');
  doc.addFont('Thonburi.ttf', FONT_NAME, 'italic');

  // Title page header
  doc.setFont(FONT_NAME, 'bold');
  doc.setFontSize(20);
  doc.text(playlistName, PAGE_W / 2, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont(FONT_NAME, 'normal');
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
    let estimatedHeight = 12;
    for (const section of sections) {
      estimatedHeight += 5;
      for (const line of section.lines) {
        estimatedHeight += line.chords ? 7 : 0;
        estimatedHeight += line.lyrics ? 6 : 0;
      }
      estimatedHeight += 4;
    }
    estimatedHeight += 10;

    if (state.y + Math.min(estimatedHeight, 40) > PAGE_H - MARGIN_BOTTOM) {
      nextColumn(doc, state);
    }

    // --- Song title ---
    doc.setFont(FONT_NAME, 'bold');
    doc.setFontSize(14);
    doc.text(song.title, state.x, state.y);
    state.y += 6;

    // --- Artist ---
    if (song.artist) {
      doc.setFont(FONT_NAME, 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(song.artist, state.x, state.y);
      state.y += 5;
    }

    // --- Key ---
    doc.setFont(FONT_NAME, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    const keyLabel =
      transpose !== 0
        ? `Key: ${song.original_key} → ${transposedKey}`
        : `Key: ${song.original_key}`;
    doc.text(keyLabel, state.x, state.y);
    state.y += 6;

    // --- Chord + lyric lines ---
    doc.setFont(FONT_NAME, 'normal');
    doc.setFontSize(9);

    for (const section of sections) {
      if (state.y + 15 > PAGE_H - MARGIN_BOTTOM) {
        nextColumn(doc, state);
      }

      // Section marker
      if (section.marker) {
        doc.setFont(FONT_NAME, 'italic');
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(section.marker, state.x, state.y);
        state.y += 5;
        doc.setFont(FONT_NAME, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
      }

      for (const line of section.lines) {
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

      state.y += 3;
    }

    state.y += 6;
  }

  // Page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont(FONT_NAME, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(`${i} / ${totalPages}`, PAGE_W / 2, PAGE_H - 5, { align: 'center' });
  }

  doc.save(`${playlistName}.pdf`);
}
