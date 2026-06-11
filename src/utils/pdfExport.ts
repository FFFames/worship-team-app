/** PDF generation utility — exports a full playlist to a downloadable A4 PDF.
 *  Two-column layout with song-aware column breaks: each song stays within
 *  one column. If a song doesn't fit, it moves to the next column.
 *  Exception: the first song on page 1 may span both columns.
 *  Uses html2canvas for perfect Thai วรรณยุกต์ rendering. */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { PlaylistSong, Section } from '../types/database';
import { transposeChordLine, transposeKey } from './transpose';
import { parseChordLyrics } from './chordParser';

const PAGE_W = 210; // A4 width mm
const PAGE_H = 297; // A4 height mm
const MARGIN_X = 10;
const MARGIN_Y = 15;
const COL_GAP = 4; // mm between columns
const COL_W = (PAGE_W - MARGIN_X * 2 - COL_GAP) / 2; // 93mm per column
const COL_CONTENT_H = PAGE_H - MARGIN_Y * 2; // 267mm usable height per column

const PX_PER_MM = 96 / 25.4;
const RENDER_SCALE = 2;
const COL_WIDTH_PX = COL_W * PX_PER_MM;

/** A rendered song image with its height in mm */
interface SongRender {
  dataUrl: string;
  heightMM: number;
}

/** A column slot: holds references to song renders stacked vertically */
interface ColumnSlot {
  songs: { render: SongRender; yMM: number; isOverflow?: boolean; overflowOffsetMM?: number }[];
  totalHeightMM: number;
  hasHeader?: boolean;
}

/** Rendered header image */
interface HeaderRender {
  dataUrl: string;
  heightMM: number;
}

/**
 * Render each song individually, then assign to columns respecting
 * the "don't split a song across columns" rule.
 */
export async function exportPlaylistToPDF(
  playlistName: string,
  playlistSongs: PlaylistSong[],
): Promise<void> {
  if (playlistSongs.length === 0) return;

  // 1. Render the playlist header
  const headerRender = await renderHeader(playlistName, playlistSongs.length);

  // 2. Render each song into its own canvas
  const songRenders: SongRender[] = [];

  for (const ps of playlistSongs) {
    const song = ps.song;
    if (!song) continue;

    const render = await renderSong(song, ps.transpose ?? 0);
    songRenders.push(render);
  }

  // 3. Build column layout — assign songs to columns
  const columns = buildColumnLayout(songRenders, headerRender);

  // 4. Assemble into PDF pages (2 columns per page)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let isFirstPage = true;

  for (let i = 0; i < columns.length; i += 2) {
    if (!isFirstPage) doc.addPage();
    isFirstPage = false;

    const leftCol = columns[i];
    const rightCol = i + 1 < columns.length ? columns[i + 1] : null;

    // Draw left column (with header on first column)
    drawColumn(doc, leftCol, MARGIN_X, i === 0 ? headerRender : undefined);

    // Draw right column
    if (rightCol && (rightCol.songs.length > 0)) {
      drawColumn(doc, rightCol, MARGIN_X + COL_W + COL_GAP);
    }
  }

  // 4. Page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(`${i} / ${totalPages}`, PAGE_W / 2, PAGE_H - 4, { align: 'center' });
  }

  doc.save(`${playlistName}.pdf`);
}

/** Render the playlist title header into a canvas */
async function renderHeader(name: string, songCount: number): Promise<HeaderRender> {
  const html = `
    <div style="text-align: center; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0; margin-bottom: 12px;">
      <div style="font-size: 18px; font-weight: bold; margin-bottom: 2px;">${esc(name)}</div>
      <div style="font-size: 10px; color: #666;">${songCount} song${songCount !== 1 ? 's' : ''}</div>
    </div>
  `;

  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; top: -9999px; left: 0;
    width: ${COL_WIDTH_PX}px;
    font-family: 'Sukhumvit Set', 'Thonburi', 'Sarabun', sans-serif;
    background: white; color: #000; padding: 0; margin: 0;
    line-height: 1.5;
  `;
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: RENDER_SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });
    const heightMM = canvas.height / PX_PER_MM / RENDER_SCALE;
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), heightMM };
  } finally {
    document.body.removeChild(container);
  }
}

/** Render a single song into a canvas and return its data URL + height in mm */
async function renderSong(
  song: { title: string; artist: string | null; original_key: string; raw_content?: string; sections?: Section[] | null },
  transpose: number,
): Promise<SongRender> {
  const transposedKey =
    transpose !== 0 ? transposeKey(song.original_key, transpose) : song.original_key;
  // Use stored sections (which may have drag-adjusted chord positions) instead of re-parsing
  const sections: Section[] = song.sections?.length
    ? song.sections
    : song.raw_content
      ? parseChordLyrics(song.raw_content).sections
      : [];

  const html = buildSongHTML(song.title, song.artist, transposedKey, song.original_key, transpose, sections);

  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; top: -9999px; left: 0;
    width: ${COL_WIDTH_PX}px;
    font-family: 'Sukhumvit Set', 'Thonburi', 'Sarabun', sans-serif;
    background: white; color: #000; padding: 0; margin: 0;
    line-height: 1.5;
  `;
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: RENDER_SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const heightMM = canvas.height / PX_PER_MM / RENDER_SCALE;

    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
      heightMM,
    };
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Build column assignments:
 * - Each song gets its own column space (no splitting)
 * - If a song doesn't fit in remaining column height, move to next column
 * - Exception: first song on first page may span BOTH columns (left overflow → right)
 */
function buildColumnLayout(songRenders: SongRender[], header: HeaderRender): ColumnSlot[] {
  const columns: ColumnSlot[] = [];
  // First column starts below the header
  let currentCol: ColumnSlot = { songs: [], totalHeightMM: header.heightMM, hasHeader: true };

  for (let i = 0; i < songRenders.length; i++) {
    const render = songRenders[i];
    const remainingSpace = COL_CONTENT_H - currentCol.totalHeightMM;

    if (render.heightMM <= remainingSpace) {
      // Song fits in current column
      currentCol.songs.push({ render, yMM: currentCol.totalHeightMM });
      currentCol.totalHeightMM += render.heightMM;
    } else if (currentCol.songs.length === 0 && columns.length === 0) {
      // FIRST song on FIRST column and it's too tall → allow it to span both columns
      const leftHeight = COL_CONTENT_H;
      const rightHeight = render.heightMM - leftHeight;

      // Put the full image on the left column (it will overflow but we clip via PDF placement)
      currentCol.songs.push({ render, yMM: 0 });
      currentCol.totalHeightMM = render.heightMM;
      columns.push(currentCol);

      // The right column starts with the overflow of this song
      const rightCol: ColumnSlot = {
        songs: [{ render, yMM: 0, isOverflow: true, overflowOffsetMM: leftHeight }],
        totalHeightMM: rightHeight,
      };
      columns.push(rightCol);
      currentCol = { songs: [], totalHeightMM: 0 };
    } else {
      // Song doesn't fit → finish current column, start new one
      columns.push(currentCol);
      currentCol = { songs: [], totalHeightMM: 0 };

      // Place song in new column
      currentCol.songs.push({ render, yMM: 0 });
      currentCol.totalHeightMM = render.heightMM;
    }
  }

  // Push the last column if it has content
  if (currentCol.songs.length > 0) {
    columns.push(currentCol);
  }

  return columns;
}

/** Draw a column's songs onto the PDF at the given x position */
function drawColumn(doc: jsPDF, col: ColumnSlot, xMM: number, header?: HeaderRender): void {
  // Draw header if provided (first column of first page)
  // The column layout already accounts for header height in song yMM offsets,
  // but only the first column has the header — other columns' yMM starts at 0
  if (header && col.hasHeader) {
    doc.addImage(header.dataUrl, 'JPEG', xMM, MARGIN_Y, COL_W, header.heightMM);
  }

  for (const entry of col.songs) {
    const yMM = MARGIN_Y + entry.yMM;

    if (entry.isOverflow) {
      // This is the overflow portion of a song that started in the left column
      // We need to draw the same image but offset upward to show only the bottom part
      // Calculate the source crop in image pixels
      const srcOffsetPx = Math.round(entry.overflowOffsetMM! * PX_PER_MM * RENDER_SCALE);
      const srcHeightPx = Math.round(entry.render.heightMM * PX_PER_MM * RENDER_SCALE) - srcOffsetPx;
      const displayHeightMM = entry.render.heightMM - entry.overflowOffsetMM!;

      // We'll load the image, crop it, and add the cropped version
      // jsPDF doesn't support cropping directly, so we use a temp canvas
      const img = new Image();
      img.src = entry.render.dataUrl;

      // Create a small off-screen canvas for the crop
      const cropCanvas = document.createElement('canvas');
      const imgWidth = Math.round(COL_W * PX_PER_MM * RENDER_SCALE);
      cropCanvas.width = imgWidth;
      cropCanvas.height = srcHeightPx;
      const ctx = cropCanvas.getContext('2d')!;

      // We need to load the image synchronously — it's a data URL so it should be instant
      ctx.drawImage(img, 0, srcOffsetPx, imgWidth, srcHeightPx, 0, 0, imgWidth, srcHeightPx);

      const croppedDataUrl = cropCanvas.toDataURL('image/jpeg', 0.92);
      doc.addImage(croppedDataUrl, 'JPEG', xMM, MARGIN_Y, COL_W, displayHeightMM);
    } else {
      doc.addImage(
        entry.render.dataUrl,
        'JPEG',
        xMM,
        yMM,
        COL_W,
        Math.min(entry.render.heightMM, COL_CONTENT_H - entry.yMM),
      );
    }
  }
}

/** Build the HTML string for a single song */
function buildSongHTML(
  title: string,
  artist: string | null,
  transposedKey: string,
  originalKey: string,
  transpose: number,
  sections: Section[],
): string {
  const parts: string[] = [];

  parts.push(`<div style="margin-bottom: 14px;">`);

  // Song title
  parts.push(`<div style="font-size: 15px; font-weight: bold; margin-bottom: 1px;">${esc(title)}</div>`);

  // Artist
  if (artist) {
    parts.push(`<div style="font-size: 10px; color: #888; margin-bottom: 1px;">${esc(artist)}</div>`);
  }

  // Key
  const keyLabel = transpose !== 0
    ? `Key: ${originalKey} → ${transposedKey}`
    : `Key: ${originalKey}`;
  parts.push(`<div style="font-size: 10px; color: #555; margin-bottom: 8px;">${esc(keyLabel)}</div>`);

  // Sections
  for (const section of sections) {
    if (section.marker) {
      parts.push(`<div style="font-size: 10px; color: #999; font-style: italic; margin-top: 6px; margin-bottom: 3px;">${esc(section.marker)}</div>`);
    }

    for (const line of section.lines) {
      if (line.chords) {
        const transposedChords = transpose !== 0
          ? transposeChordLine(line.chords, transpose)
          : line.chords;
        parts.push(`<div style="font-family: 'Courier New', monospace; font-size: 10px; color: #008050; line-height: 1.2; white-space: pre;">${esc(transposedChords)}</div>`);
      }

      if (line.lyrics) {
        parts.push(`<div style="font-size: 12px; line-height: 1.4; white-space: pre-wrap;">${esc(line.lyrics)}</div>`);
      }
    }

    parts.push(`<div style="height: 4px;"></div>`);
  }

  parts.push(`</div>`);
  parts.push(`<div style="border-top: 1px solid #e8e8e8; margin: 4px 0 10px 0;"></div>`);

  return parts.join('');
}

/** Escape HTML special characters */
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
