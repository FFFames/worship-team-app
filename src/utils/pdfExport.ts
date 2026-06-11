/** PDF generation utility — exports a full playlist to a downloadable A4 PDF.
 *  Uses html2canvas to render song content as images for perfect Thai font support,
 *  then assembles them into a two-column-per-page PDF via jsPDF.
 *  This approach handles วรรณยุกต์ (tone marks) and complex Thai shaping correctly
 *  because the browser's text renderer handles all OpenType GPOS/GSUB lookups. */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { PlaylistSong, Section } from '../types/database';
import { transposeChordLine, transposeKey } from './transpose';

const PAGE_W = 210; // A4 width mm
const PAGE_H = 297; // A4 height mm
const MARGIN_X = 10;
const MARGIN_Y = 15;
const COL_GAP = 4; // mm between columns
const COL_W = (PAGE_W - MARGIN_X * 2 - COL_GAP) / 2; // 93mm per column
const COL_CONTENT_H = PAGE_H - MARGIN_Y * 2; // usable height per column

/** A4 at 96 DPI */
const PX_PER_MM = 96 / 25.4;
const RENDER_SCALE = 2;

/**
 * Build the HTML for all songs in a playlist, render via html2canvas,
 * split into column-height strips, pair them left+right per page, save PDF.
 */
export async function exportPlaylistToPDF(
  playlistName: string,
  playlistSongs: PlaylistSong[],
): Promise<void> {
  // 1. Build the HTML content (single column)
  const html = buildPlaylistHTML(playlistName, playlistSongs);

  // 2. Create a hidden container at column width
  const colWidthPx = COL_W * PX_PER_MM;
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; top: -9999px; left: 0;
    width: ${colWidthPx}px;
    font-family: 'Sukhumvit Set', 'Thonburi', 'Sarabun', sans-serif;
    background: white; color: #000; padding: 0; margin: 0;
    line-height: 1.5;
  `;
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    // 3. Render to canvas
    const canvas = await html2canvas(container, {
      scale: RENDER_SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    // 4. Split into column-height strips, pair 2 per page
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Height of one column in canvas pixels
    const colPxHeight = Math.round(COL_CONTENT_H * PX_PER_MM * RENDER_SCALE);
    const totalColPx = canvas.height;
    const numStrips = Math.ceil(totalColPx / colPxHeight);

    for (let strip = 0; strip < numStrips; strip++) {
      // Every 2 strips = 1 PDF page
      if (strip % 2 === 0) {
        if (strip > 0) doc.addPage();
      }

      const isRightCol = strip % 2 === 1;
      const x = isRightCol ? MARGIN_X + COL_W + COL_GAP : MARGIN_X;

      // Source region in canvas pixels
      const srcY = strip * colPxHeight;
      const srcH = Math.min(colPxHeight, totalColPx - srcY);
      if (srcH <= 0) break;

      // Create slice canvas
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = srcH;
      const ctx = sliceCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0, srcY, canvas.width, srcH,
        0, 0, canvas.width, srcH,
      );

      const imgData = sliceCanvas.toDataURL('image/jpeg', 0.92);

      // Calculate actual rendered height in mm (last strip may be shorter)
      const stripHeightMM = srcH / PX_PER_MM / RENDER_SCALE;

      doc.addImage(
        imgData,
        'JPEG',
        x,
        MARGIN_Y,
        COL_W,
        Math.min(stripHeightMM, COL_CONTENT_H),
      );
    }

    // 5. Page numbers
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text(`${i} / ${totalPages}`, PAGE_W / 2, PAGE_H - 4, { align: 'center' });
    }

    doc.save(`${playlistName}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

/** Build the HTML string for the full playlist content (single column) */
function buildPlaylistHTML(playlistName: string, songs: PlaylistSong[]): string {
  const parts: string[] = [];

  // Title header
  parts.push(`
    <div style="text-align: center; padding-bottom: 12px; border-bottom: 2px solid #e0e0e0; margin-bottom: 16px;">
      <div style="font-size: 22px; font-weight: bold; margin-bottom: 2px;">${esc(playlistName)}</div>
      <div style="font-size: 12px; color: #666;">${songs.length} song${songs.length !== 1 ? 's' : ''}</div>
    </div>
  `);

  for (const ps of songs) {
    const song = ps.song;
    if (!song) continue;

    const transpose = ps.transpose_semitones ?? 0;
    const transposedKey =
      transpose !== 0 ? transposeKey(song.original_key, transpose) : song.original_key;

    const sections: Section[] = song.content_parsed?.sections ?? [];

    parts.push(`<div style="margin-bottom: 18px;">`);

    // Song title
    parts.push(`<div style="font-size: 15px; font-weight: bold; margin-bottom: 1px;">${esc(song.title)}</div>`);

    // Artist
    if (song.artist) {
      parts.push(`<div style="font-size: 10px; color: #888; margin-bottom: 1px;">${esc(song.artist)}</div>`);
    }

    // Key
    const keyLabel = transpose !== 0
      ? `Key: ${song.original_key} → ${transposedKey}`
      : `Key: ${song.original_key}`;
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
    parts.push(`<div style="border-top: 1px solid #e8e8e8; margin: 6px 0 14px 0;"></div>`);
  }

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
