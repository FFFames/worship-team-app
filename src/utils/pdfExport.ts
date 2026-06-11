/** PDF generation utility — exports a full playlist to a downloadable A4 PDF.
 *  Uses html2canvas to render song content as images for perfect Thai font support,
 *  then assembles them into a multi-page PDF via jsPDF.
 *  This approach handles วรรณยุกต์ (tone marks) and complex Thai shaping correctly
 *  because the browser's text renderer handles all OpenType GPOS/GSUB lookups. */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { PlaylistSong, Section } from '../types/database';
import { transposeChordLine, transposeKey } from './transpose';

const PAGE_W = 210; // A4 width mm
const PAGE_H = 297; // A4 height mm
const MARGIN = 12;

/** A4 at 96 DPI → 794×1123 px. Scale 2x for crisp rendering. */
const PX_PER_MM = 96 / 25.4;
const RENDER_SCALE = 2;

/**
 * Build the HTML for all songs in a playlist, render via html2canvas,
 * split into A4 pages, and save as PDF.
 */
export async function exportPlaylistToPDF(
  playlistName: string,
  playlistSongs: PlaylistSong[],
): Promise<void> {
  // 1. Build the full HTML content
  const html = buildPlaylistHTML(playlistName, playlistSongs);

  // 2. Create a hidden container and inject the HTML
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; top: -9999px; left: 0;
    width: ${(PAGE_W - MARGIN * 2) * PX_PER_MM}px;
    font-family: 'Sukhumvit Set', 'Thonburi', 'Sarabun', sans-serif;
    background: white; color: #000; padding: 0; margin: 0;
    line-height: 1.5;
  `;
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    // 3. Render to canvas via html2canvas
    const canvas = await html2canvas(container, {
      scale: RENDER_SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    // 4. Split the tall canvas into A4 pages and build PDF
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const contentWidthMM = PAGE_W - MARGIN * 2;
    const contentHeightMM = PAGE_H - MARGIN * 2;

    // How many mm the canvas represents total
    const totalHeightMM = canvas.height / PX_PER_MM / RENDER_SCALE;
    const pagesNeeded = Math.ceil(totalHeightMM / contentHeightMM);

    for (let page = 0; page < pagesNeeded; page++) {
      if (page > 0) doc.addPage();

      // Calculate slice bounds in canvas pixels
      const srcY = Math.round(page * (canvas.height / pagesNeeded));
      const srcH = Math.round(canvas.height / pagesNeeded);

      // Create a temporary canvas for this page slice
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = srcH;
      const ctx = pageCanvas.getContext('2d')!;
      ctx.drawImage(
        canvas,
        0, srcY, canvas.width, srcH,
        0, 0, canvas.width, srcH,
      );

      const imgData = pageCanvas.toDataURL('image/jpeg', 0.92);
      doc.addImage(
        imgData,
        'JPEG',
        MARGIN,
        MARGIN,
        contentWidthMM,
        contentHeightMM,
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
    // Clean up the hidden container
    document.body.removeChild(container);
  }
}

/** Build the HTML string for the full playlist content */
function buildPlaylistHTML(playlistName: string, songs: PlaylistSong[]): string {
  const parts: string[] = [];

  // Title
  parts.push(`
    <div style="text-align: center; padding-bottom: 16px; border-bottom: 2px solid #e0e0e0; margin-bottom: 20px;">
      <div style="font-size: 28px; font-weight: bold; margin-bottom: 4px;">${esc(playlistName)}</div>
      <div style="font-size: 14px; color: #666;">${songs.length} song${songs.length !== 1 ? 's' : ''}</div>
    </div>
  `);

  for (const ps of songs) {
    const song = ps.song;
    if (!song) continue;

    const transpose = ps.transpose_semitones ?? 0;
    const transposedKey =
      transpose !== 0 ? transposeKey(song.original_key, transpose) : song.original_key;

    const sections: Section[] = song.content_parsed?.sections ?? [];

    parts.push(`<div style="margin-bottom: 24px;">`);

    // Song title
    parts.push(`<div style="font-size: 18px; font-weight: bold; margin-bottom: 2px;">${esc(song.title)}</div>`);

    // Artist
    if (song.artist) {
      parts.push(`<div style="font-size: 12px; color: #888; margin-bottom: 2px;">${esc(song.artist)}</div>`);
    }

    // Key
    const keyLabel = transpose !== 0
      ? `Key: ${song.original_key} → ${transposedKey}`
      : `Key: ${song.original_key}`;
    parts.push(`<div style="font-size: 11px; color: #555; margin-bottom: 10px;">${esc(keyLabel)}</div>`);

    // Sections
    for (const section of sections) {
      // Section marker
      if (section.marker) {
        parts.push(`<div style="font-size: 11px; color: #999; font-style: italic; margin-top: 8px; margin-bottom: 4px;">${esc(section.marker)}</div>`);
      }

      for (const line of section.lines) {
        // Chord line — green monospace
        if (line.chords) {
          const transposedChords = transpose !== 0
            ? transposeChordLine(line.chords, transpose)
            : line.chords;
          parts.push(`<div style="font-family: 'Courier New', monospace; font-size: 12px; color: #008050; line-height: 1.3; white-space: pre;">${esc(transposedChords)}</div>`);
        }

        // Lyrics line
        if (line.lyrics) {
          parts.push(`<div style="font-size: 13px; line-height: 1.5; white-space: pre-wrap;">${esc(line.lyrics)}</div>`);
        }
      }

      // Gap between sections
      parts.push(`<div style="height: 6px;"></div>`);
    }

    parts.push(`</div>`);

    // Divider between songs
    parts.push(`<div style="border-top: 1px solid #e8e8e8; margin: 8px 0 20px 0;"></div>`);
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
