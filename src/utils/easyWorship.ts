/**
 * Reads paired EasyWorship SQLite song databases locally in the browser.
 * EasyWorship stores song details and RTF lyric slides in separate SQLite files.
 */

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { decodeEasyWorshipText, rtfFontCodePage } from './easyWorshipEncoding';
import type { DesignParagraphFormat, DesignTextRun, DesignTextStyle, SlidePlaybackSettings, SlideTransition, SongAppearance } from '../types/slideDesign';
import { compactTextRuns, sliceTextRuns } from './slideDesign';
import { songTagsFromText } from './songTags';
import { normalizeEasyWorshipUid } from './easyWorshipSongIdentity';
import { importIdentity } from './importIdentity';
import type { WithMediaBlob } from './zipAsset';
import { easyWorshipParagraphList, maxListMarkerLength } from './slideParagraphLists';

export type EasyWorshipSection = {
  label: string;
  slideLabel?: string;
  lines: string[];
  lyricRuns?: DesignTextRun[];
  transition?: SlideTransition;
  playback?: SlidePlaybackSettings;
};

export type EasyWorshipSong = {
  sourceId: string;
  sourceUid?: string;
  title: string;
  author: string | null;
  copyright: string | null;
  administrator?: string;
  description?: string;
  tags?: string[];
  ccli: string | null;
  sections: EasyWorshipSection[];
  appearance?: SongAppearance;
  layoutLink?: { presentationId: string; slideIds: (string | null)[] };
  wordsRecovery?: { id: string; recordId?: string; title: string; lyricsOnly: boolean };
};

export type EasyWorshipImport = {
  songs: EasyWorshipSong[];
  skipped: Array<{
    sourceId: string;
    title: string;
    reason: string;
  }>;
  warnings?: string[];
  recoveredLyricsOnly?: true;
  readAppearanceAsset?: (path: string) => Promise<Blob>;
  withAppearanceAsset?: WithMediaBlob;
};

export const easyWorshipLyricsRecoveryNotice = 'กู้เฉพาะเนื้อร้องจาก SongWords ระบบใช้ชื่อชั่วคราว เก็บไฟล์นี้ไว้และนำเข้าคู่กับ Songs.db ของโปรไฟล์เดียวกันเมื่อพบไฟล์ เพื่อเติมข้อมูลในเพลงเดิม';

type SqlRow = Record<string, unknown>;

let sqlPromise: Promise<SqlJsStatic> | undefined;

export function getEasyWorshipSql(): Promise<SqlJsStatic> {
  const options = typeof window === 'undefined' ? undefined : {
    useOldExtensionFunctions: false,
    locateFile: () => sqlWasmUrl,
  };
  sqlPromise ??= initSqlJs(options).catch((error: unknown) => {
    sqlPromise = undefined;
    throw error;
  });
  return sqlPromise;
}

function quoteIdentifier(identifier: string): string {
  return '"' + identifier.replace(/"/g, '""') + '"';
}

function rows(db: Database, query: string): SqlRow[] {
  const statement = db.prepare(query);
  const result: SqlRow[] = [];

  try {
    while (statement.step()) {
      result.push(statement.getAsObject());
    }
  } finally {
    statement.free();
  }

  return result;
}

function findTable(db: Database, acceptedNames: string[]): string | undefined {
  const tables = rows(db, "SELECT name FROM sqlite_master WHERE type = 'table'");
  return tables
    .map((table) => String(table.name))
    .find((name) => acceptedNames.includes(name.toLowerCase()));
}

function getColumns(db: Database, table: string): string[] {
  return rows(db, `PRAGMA table_info(${quoteIdentifier(table)})`)
    .map((column) => String(column.name));
}

function findColumn(columns: string[], names: string[]): string | undefined {
  return columns.find((column) => names.includes(column.toLowerCase()));
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'number' ? String(value) : stringOrNull(value);
}

export function isEasyWorshipSqliteDatabase(bytes: Uint8Array): boolean {
  const sqliteHeader = 'SQLite format 3\u0000';
  return bytes.length >= sqliteHeader.length
    && sqliteHeader.split('').every((character, index) => bytes[index] === character.charCodeAt(0));
}

/**
 * Converts the RTF used in EasyWorship song records to display text.
 * Paragraphs are lyric lines and `\\page` remains a slide separator.
 */
type RtfState = {
  codePage: string;
  hiddenParagraph: boolean;
  inFontTable: boolean;
  inColorTable?: boolean;
  font?: number;
  characterFont?: number | null;
  characterStyle?: RtfCharacterStyle;
  paragraphAlign?: DesignTextRun['align'];
  paragraph?: RtfParagraph;
  listMarker?: { destination: string; text: string };
  fallbackCharacters: number;
  skipDestination: boolean;
  unicodeFallbackLength: number;
};

const RTF_EFFECT_FIELDS = [
  ['sdstrokecolor', 'outlineColor'], ['sdstrokealpha', 'outlineAlpha'], ['sdstrokewidthf', 'outlineWidth'],
  ['sdshadcolor', 'shadowColor'], ['sdshadalpha', 'shadowAlpha'], ['sdshadradiusf', 'shadowBlur'],
  ['sdshadoffsf', 'shadowOffset'], ['sdshadangle', 'shadowAngle'],
] as const;
type RtfEffectProperty = typeof RTF_EFFECT_FIELDS[number][1];
const RTF_EFFECT_PROPERTIES = new Map<string, RtfEffectProperty>(RTF_EFFECT_FIELDS);
type RtfCharacterStyle = {
  color?: number; size?: number; bold?: boolean; italic?: boolean; underline?: boolean;
  outline?: boolean; shadow?: boolean; strike?: boolean; baseline?: 'super' | 'sub' | 'normal'; textAlpha?: number;
} & Partial<Record<RtfEffectProperty, number>>;
const RTF_PARAGRAPH_FIELDS = new Map<string, keyof RtfParagraph>([
  ['li', 'leftIndent'], ['ri', 'rightIndent'], ['fi', 'firstLineIndent'], ['sb', 'spaceBefore'], ['sa', 'spaceAfter'],
  ['sl', 'lineSpacing'], ['slmult', 'spacingMultiplier'],
  ['sdbullettype', 'listType'], ['sdlistlevel', 'listLevel'], ['ilvl', 'listLevel'],
  ['sdewparalistindexstart', 'listStart'],
]);
type RtfParagraph = Partial<Record<'leftIndent' | 'rightIndent' | 'firstLineIndent' | 'spaceBefore' | 'spaceAfter'
  | 'lineSpacing' | 'spacingMultiplier' | 'listType' | 'listLevel' | 'listStart', number>> & {
  bulletText?: string;
  literalMarker?: string;
};
type RtfRun = { text: string; style: RtfCharacterStyle | undefined; font: number | undefined; align: DesignTextRun['align']; paragraphIndex: number };
type RtfFormatting = {
  runs: RtfRun[]; colors: (string | undefined)[]; fonts: Map<number, string>;
  paragraphs?: Map<number, RtfParagraph | undefined>;
  inheritThemeFont?: boolean;
};
type RtfTagReplacement = (uid: string, text: string) => string;

const RTF_DESTINATIONS = new Set([
  'annotation', 'atnid', 'author', 'colortbl', 'comment', 'creatim',
  'datafield', 'datastore', 'doccomm', 'fonttbl', 'footer', 'footerf',
  'footerl', 'footerr', 'footnote', 'generator', 'header', 'headerf',
  'headerl', 'headerr', 'info', 'keywords', 'listlevel', 'listoverridetable',
  'listtable', 'listtext', 'manager', 'nonshppict', 'object', 'operator', 'pict', 'pn', 'pntext',
  'sdbullettext',
  'private', 'revtim', 'rsidtbl', 'shppict', 'stylesheet', 'subject',
  'themedata', 'title', 'userprops', 'xmlattr', 'xmlclose', 'xmlopen',
]);

// EasyWorship writes fractional text effects as ignorable destinations, separate from the text.
const RTF_EFFECT_FACTOR = /^\{\\\*\\(sdstrokewidthf|sdshadradiusf|sdshadoffsf)\s+([-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*\}/i;

function rtfToText(rtf: string, fallbackCodePage: string, mode: 'all' | 'visible' | 'labels', replaceTag?: RtfTagReplacement, format?: RtfFormatting): string {
  const output: string[] = [];
  const fontCodePages = new Map<number, string>();
  let defaultFont: number | undefined;
  const states: RtfState[] = [{
    codePage: fallbackCodePage,
    hiddenParagraph: false,
    inFontTable: false,
    fallbackCharacters: 0,
    skipDestination: false,
    unicodeFallbackLength: 1,
  }];
  let index = 0;
  let paragraphIndex = 0;
  let tag: { uid: string; start: number; depth: number; firstRun: number; fallbackRun: RtfRun } | undefined;
  let color: Partial<Record<'red' | 'green' | 'blue', number>> = {};

  function write(value: string, state: RtfState) {
    if (state.listMarker) {
      const available = maxListMarkerLength * 2 - state.listMarker.text.length;
      if (available > 0) state.listMarker.text += value.slice(0, available);
      return;
    }
    output.push(value);
    if (!format) return;
    const style = state.characterStyle;
    const font = state.characterFont === null ? undefined
      : state.characterFont ?? (format.inheritThemeFont ? undefined : defaultFont);
    const align = state.paragraphAlign;
    const last = format.runs[format.runs.length - 1];
    if (format.paragraphs && !format.paragraphs.has(paragraphIndex)) format.paragraphs.set(paragraphIndex, state.paragraph);
    if (last && tag?.firstRun !== format.runs.length && last.style === style && last.font === font && last.align === align
      && (!format.paragraphs || last.paragraphIndex === paragraphIndex)) last.text += value;
    else format.runs.push({ text: value, style, font, align, paragraphIndex });
  }

  function readParagraphControl(state: RtfState, controlWord: string, number: number) {
    if (!format?.paragraphs || state.hiddenParagraph || state.listMarker) return;
    const field = RTF_PARAGRAPH_FIELDS.get(controlWord);
    if (controlWord === 'pard') state.paragraph = undefined;
    else if (field && Number.isSafeInteger(number)) state.paragraph = { ...state.paragraph, [field]: number };
    else return;
    if (format.paragraphs.has(paragraphIndex)) format.paragraphs.set(paragraphIndex, state.paragraph);
  }

  function nextParagraph(state: RtfState) {
    if (state.skipDestination || state.listMarker) return;
    if (!state.hiddenParagraph) paragraphIndex++;
    if (state.paragraph?.literalMarker !== undefined || state.paragraph?.listStart !== undefined) {
      state.paragraph = { ...state.paragraph, literalMarker: undefined, listStart: undefined };
    }
  }

  function canWrite(state: RtfState) {
    return !state.skipDestination && (mode === 'labels' ? state.hiddenParagraph : !state.hiddenParagraph);
  }

  function append(state: RtfState, value: string) {
    if (!canWrite(state)) return;
    if (state.fallbackCharacters > 0) state.fallbackCharacters--;
    else write(value, state);
  }

  function readTableCharacter(state: RtfState, character: string) {
    if (!format) return;
    if (state.inColorTable && character === ';') {
      const channels = [color.red, color.green, color.blue];
      format.colors.push(channels.some((channel) => channel !== undefined)
        ? '#' + channels.map((channel) => (channel ?? 0).toString(16).padStart(2, '0')).join('') : undefined);
      color = {};
    } else if (state.inFontTable && state.font !== undefined) {
      const previous = format.fonts.get(state.font) ?? '';
      if (previous.length <= 80 && !previous.endsWith(';')) format.fonts.set(state.font, previous + character);
    }
  }

  function finishTag() {
    if (!tag || !replaceTag) return;
    const original = output.splice(tag.start).join('');
    const replacement = replaceTag(tag.uid, original);
    output.push(replacement);
    if (format && replacement !== original) {
      const first = format.runs[tag.firstRun] ?? tag.fallbackRun;
      format.runs.splice(tag.firstRun);
      if (replacement) format.runs.push({ ...first, text: replacement });
    }
    tag = undefined;
  }

  while (index < rtf.length) {
    const state = states[states.length - 1];
    const character = rtf[index];

    if (character === '{') {
      if (format?.paragraphs && !state.skipDestination && !state.hiddenParagraph && !state.listMarker) {
        const marker = /^\{(?:\\\*)?\\(sdbullettext|listtext|pntext)(?![a-zA-Z])[ ]?/i.exec(rtf.slice(index, index + 30));
        if (marker) {
          states.push({ ...state, fallbackCharacters: 0, listMarker: { destination: marker[1].toLowerCase(), text: '' } });
          index += marker[0].length;
          continue;
        }
      }
      if (format && !state.skipDestination && rtf[index + 1] === '\\' && rtf[index + 2] === '*') {
        const factor = RTF_EFFECT_FACTOR.exec(rtf.slice(index, index + 100));
        if (factor) {
          const property = RTF_EFFECT_PROPERTIES.get(factor[1].toLowerCase());
          const value = Number(factor[2]);
          if (property && Number.isFinite(value) && value >= 0) state.characterStyle = { ...state.characterStyle, [property]: value };
          index += factor[0].length;
          continue;
        }
      }
      if (replaceTag && !state.skipDestination && !state.hiddenParagraph) {
        const marker = /^\{\\\*\\sdewtagguid\s+((?:\\[{}\\]|[^{}]){1,160})\}/i.exec(rtf.slice(index, index + 192));
        if (marker) {
          finishTag();
          tag = {
            uid: marker[1].replace(/\\([{}\\])/g, '$1').trim(), start: output.length, depth: states.length,
            firstRun: format?.runs.length ?? 0,
            fallbackRun: { text: '', style: state.characterStyle, font: state.characterFont === null ? undefined : state.characterFont ?? defaultFont, align: state.paragraphAlign, paragraphIndex },
          };
          index += marker[0].length;
          continue;
        }
      }
      states.push({ ...state });
      index++;
      continue;
    }
    if (character === '}') {
      if (tag?.depth === states.length) finishTag();
      if (states.length > 1) {
        states.pop();
        const parent = states[states.length - 1];
        if (state.listMarker && !parent.listMarker) {
          const key = state.listMarker.destination === 'sdbullettext' ? 'bulletText' : 'literalMarker';
          parent.paragraph = { ...parent.paragraph, [key]: state.listMarker.text };
          if (format?.paragraphs?.has(paragraphIndex)) format.paragraphs.set(paragraphIndex, parent.paragraph);
        }
      }
      index++;
      continue;
    }
    if (character !== '\\') {
      if (character !== '\r' && character !== '\n') {
        if (state.skipDestination) readTableCharacter(state, character);
        else append(state, character);
      }
      index++;
      continue;
    }

    const next = rtf[index + 1];
    if (next === undefined) break;
    if (next === '*') {
      state.skipDestination = true;
      if (format) { state.inFontTable = false; state.inColorTable = false; }
      index += 2;
      continue;
    }
    if (next === '\\' || next === '{' || next === '}') {
      append(state, next);
      index += 2;
      continue;
    }
    if (next === '~') {
      append(state, ' ');
      index += 2;
      continue;
    }
    if (next === '_') {
      append(state, '‑');
      index += 2;
      continue;
    }
    if (next === '-') {
      index += 2;
      continue;
    }
    if (next === "'") {
      const bytes: number[] = [];
      while (rtf[index] === '\\' && rtf[index + 1] === "'") {
        const hex = rtf.slice(index + 2, index + 4);
        if (!/^[0-9a-f]{2}$/i.test(hex)) break;
        bytes.push(Number.parseInt(hex, 16));
        index += 4;
      }
      if (bytes.length) {
        if (canWrite(state)) {
          const skipped = Math.min(state.fallbackCharacters, bytes.length);
          state.fallbackCharacters -= skipped;
          const font = state.font ?? defaultFont;
          const page = font === undefined ? state.codePage : fontCodePages.get(font) ?? state.codePage;
          if (skipped < bytes.length) write(decodeEasyWorshipText(Uint8Array.from(bytes.slice(skipped)), page), state);
        }
        continue;
      }
    }

    const control = rtf.slice(index + 1).match(/^([a-zA-Z]+)(-?\d+)? ?/);
    if (!control) {
      index += 2;
      continue;
    }

    const [token, word, numberText] = control;
    const controlWord = word.toLowerCase();
    index += token.length + 1;

    if (controlWord === 'sdewtexttag' && numberText === '0' && !state.skipDestination) finishTag();
    if (mode !== 'all' && controlWord === 'sdparawysiwghidden') {
      state.hiddenParagraph = numberText !== '0';
      continue;
    }
    if (controlWord === 'pard') state.hiddenParagraph = false;
    if (RTF_DESTINATIONS.has(controlWord)) {
      state.skipDestination = true;
      if (controlWord === 'fonttbl') state.inFontTable = true;
      if (controlWord === 'colortbl' && format) state.inColorTable = true;
      continue;
    }
    if (controlWord === 'f' && numberText) {
      state.font = Number(numberText);
      if (format) state.characterFont = state.font;
      continue;
    }
    if (controlWord === 'deff' && numberText && !state.skipDestination) {
      defaultFont = Number(numberText);
      continue;
    }
    if ((controlWord === 'fcharset' || controlWord === 'cpg') && numberText && state.inFontTable && state.font !== undefined) {
      const page = controlWord === 'cpg' ? numberText : rtfFontCodePage(Number(numberText));
      if (page) fontCodePages.set(state.font, page);
      continue;
    }
    if (controlWord === 'ansicpg' && numberText) {
      state.codePage = numberText;
      continue;
    }
    if (format) {
      const value = Number(numberText);
      if (state.inColorTable && Number.isInteger(value) && value >= 0 && value <= 255
        && (controlWord === 'red' || controlWord === 'green' || controlWord === 'blue')) color[controlWord] = value;
      if (!state.skipDestination) {
        readParagraphControl(state, controlWord, value);
        const style = state.characterStyle;
        const effectProperty = RTF_EFFECT_PROPERTIES.get(controlWord);
        if (controlWord === 'pard') state.paragraphAlign = undefined;
        else if (controlWord === 'ql') state.paragraphAlign = 'left';
        else if (controlWord === 'qc') state.paragraphAlign = 'center';
        else if (controlWord === 'qr') state.paragraphAlign = 'right';
        else if (controlWord === 'plain') {
          state.characterStyle = undefined;
          state.characterFont = format.inheritThemeFont ? undefined : defaultFont;
        }
        else if (controlWord === 'fntnamaut') state.characterFont = value === 0 ? state.font : null;
        else if (controlWord === 'b') state.characterStyle = { ...style, bold: value !== 0 };
        else if (controlWord === 'i') state.characterStyle = { ...style, italic: value !== 0 };
        else if (controlWord === 'ul' || controlWord === 'ulnone' || controlWord === 'ulw' || controlWord === 'uldb') {
          state.characterStyle = { ...style, underline: controlWord !== 'ulnone' && value !== 0 };
        }
        else if (controlWord === 'strike') state.characterStyle = { ...style, strike: value !== 0 };
        else if (controlWord === 'super' || controlWord === 'sub' || controlWord === 'nosupersub') {
          state.characterStyle = { ...style, baseline: controlWord === 'nosupersub' || value === 0 ? 'normal' : controlWord };
        }
        else if (controlWord === 'sdtxtalpha' && Number.isInteger(value) && value >= 0 && value <= 255) {
          state.characterStyle = { ...style, textAlpha: value };
        }
        else if (controlWord === 'shad' || controlWord === 'sdnotshad') state.characterStyle = { ...style, shadow: controlWord === 'shad' && value !== 0 };
        else if (controlWord === 'sdstroke' || controlWord === 'sdnotstroke' || controlWord === 'outl') {
          state.characterStyle = { ...style, outline: controlWord !== 'sdnotstroke' && value !== 0 };
        }
        else if (effectProperty) state.characterStyle = { ...style, [effectProperty]: numberText !== undefined && Number.isFinite(value) ? value : undefined };
        else if (controlWord === 'cf' && Number.isInteger(value) && value >= 0) state.characterStyle = { ...style, color: value };
        else if (controlWord === 'fs' && Number.isInteger(value) && value > 0) state.characterStyle = { ...style, size: value };
      }
    }
    if (controlWord === 'uc' && numberText) {
      state.unicodeFallbackLength = Math.max(0, Number.parseInt(numberText, 10));
      continue;
    }
    if (controlWord === 'u' && numberText) {
      const value = Number.parseInt(numberText, 10);
      append(state, String.fromCharCode(value < 0 ? value + 65_536 : value));
      if (canWrite(state)) state.fallbackCharacters = state.unicodeFallbackLength;
      continue;
    }
    if (controlWord === 'par' || controlWord === 'line') {
      append(state, '\n');
      if (controlWord === 'par') {
        nextParagraph(state);
        state.hiddenParagraph = false;
      }
    } else if (controlWord === 'page') {
      append(state, '\n\f\n');
      nextParagraph(state);
    } else if (controlWord === 'tab') {
      append(state, '\t');
    } else if (controlWord === 'bullet') {
      append(state, '•');
    } else if (controlWord === 'bin' && numberText) {
      index += Math.max(0, Number.parseInt(numberText, 10));
    }
  }

  finishTag();
  return output.join('').replace(/\r\n?/g, '\n');
}

function isRtf(value: string): boolean {
  return value.trimStart().startsWith('{\\rtf');
}

function normalizeText(value: string, fallbackCodePage = '1252', hideParagraphs = false, replaceTag?: RtfTagReplacement): string {
  return (isRtf(value) ? rtfToText(value, fallbackCodePage, hideParagraphs ? 'visible' : 'all', replaceTag) : value)
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

export function textFromEasyWorshipRtf(value: string, fallbackCodePage?: string): string {
  return normalizeText(value, fallbackCodePage);
}

export function textFromEasyWorshipTaggedRtf(value: string, replaceTag: RtfTagReplacement): string {
  return normalizeText(value, undefined, false, replaceTag);
}

/** EasyWorship hides section markers on output but retains them in the song editor. */
export function displayTextFromEasyWorshipRtf(value: string): string {
  return normalizeText(value, undefined, true);
}

/** Reads labels stored as hidden paragraphs in a native song text layer. */
export function songLabelFromEasyWorshipRtf(value: string): string | undefined {
  if (!/\\sdparawysiwghidden(?=[^a-z]|$)/i.test(value) || !isRtf(value)) return;
  const labels = rtfToText(value, '1252', 'labels').replace(/\u0000/g, '')
    .split(/[\r\n\f]+/).map((label) => label.trim()).filter(Boolean);
  return labels.length ? labels.join(' · ') : undefined;
}

/** Reads the styled fragments of a native slide's visible text. */
export function displayRunsFromEasyWorshipRtf(value: string, base: DesignTextStyle, fallbackCodePage?: string): { text: string; runs?: DesignTextRun[] } {
  return runsFromEasyWorshipRtf(value, base, { hideParagraphs: true, codePage: fallbackCodePage });
}

/** Legacy editor headings stay in the source so the section reader can identify slide boundaries. */
export function legacyRunsFromEasyWorshipRtf(value: string, codePage: string) {
  return runsFromEasyWorshipRtf(value, { align: 'left' }, { includeParagraphs: true, codePage });
}

export function alertRunsFromEasyWorshipRtf(value: string, replaceTag: RtfTagReplacement) {
  return runsFromEasyWorshipRtf(value, {}, { replaceTag });
}

function rtfEffectColor(colors: RtfFormatting['colors'], index?: number, alpha?: number) {
  const color = index === undefined ? undefined : colors[index];
  if (alpha === undefined || !Number.isInteger(alpha) || alpha < 0 || alpha > 255) return color;
  return `${color ?? '#000000'}${alpha.toString(16).padStart(2, '0')}`;
}

function rtfTextEffects(source: RtfCharacterStyle | undefined, colors: RtfFormatting['colors']): Pick<NonNullable<DesignTextRun['style']>, 'outline' | 'textShadow'> {
  if (!source) return {};
  const result: ReturnType<typeof rtfTextEffects> = {};
  if (source.outline !== undefined) {
    result.outline = source.outline && {
      color: rtfEffectColor(colors, source.outlineColor, source.outlineAlpha), width: source.outlineWidth,
    };
  }
  if (source.shadow !== undefined) {
    result.textShadow = source.shadow && {
      color: rtfEffectColor(colors, source.shadowColor, source.shadowAlpha), blur: source.shadowBlur,
      offset: source.shadowOffset, angle: source.shadowAngle,
    };
  }
  return result;
}

function displayParagraph(index: number, source: RtfParagraph | undefined, nominalSize: number): DesignParagraphFormat {
  const format: DesignParagraphFormat = { index };
  const twipsPerEm = nominalSize * 10; // RTF character sizes are half-points.
  for (const field of ['leftIndent', 'rightIndent', 'firstLineIndent', 'spaceBefore', 'spaceAfter'] as const) {
    if (source?.[field]) format[field] = source[field] / twipsPerEm;
  }
  const spacing = source?.lineSpacing;
  if (spacing && source?.spacingMultiplier === 1 && spacing > 0) format.lineSpacing = { mode: 'multiple', value: spacing / 240 };
  else if (spacing) format.lineSpacing = { mode: spacing < 0 ? 'exact' : 'minimum', value: Math.abs(spacing) / twipsPerEm };
  const list = easyWorshipParagraphList(source?.listType, source?.listLevel, source?.bulletText, source?.listStart, source?.literalMarker);
  if (list !== undefined) format.list = list;
  return format;
}

function runsFromEasyWorshipRtf(value: string, base: DesignTextStyle, {
  hideParagraphs = false, includeParagraphs = hideParagraphs, inheritThemeFont, codePage, replaceTag,
}: { hideParagraphs?: boolean; includeParagraphs?: boolean; inheritThemeFont?: boolean; codePage?: string;
  replaceTag?: RtfTagReplacement }): { text: string; runs?: DesignTextRun[] } {
  if (!isRtf(value)) return { text: normalizeText(value) };
  const formatting: RtfFormatting = { runs: [], colors: [], fonts: new Map(), inheritThemeFont,
    ...(includeParagraphs ? { paragraphs: new Map() } : {}) };
  const clean = (text: string) => text.replace(/\u0000/g, '').replace(/\r\n?/g, '\n');
  const raw = clean(rtfToText(value, codePage ?? '1252', hideParagraphs ? 'visible' : 'all', replaceTag, formatting));
  const text = raw.trim();
  const start = raw.length - raw.trimStart().length;
  const end = start + text.length;
  const nominalSize = formatting.runs.find((run) => run.text.trim() && run.style?.size)?.style?.size;
  const paragraphs = new Map([...(formatting.paragraphs ?? [])].map(([index, source]) => [index, displayParagraph(index, source, nominalSize ?? 24)]));
  const hasParagraphLayout = [...paragraphs.values()].some((format) => Object.keys(format).length > 1)
    || ((inheritThemeFont || codePage !== undefined) && formatting.runs.some((run) => run.align && run.align !== base.align));
  const runs: DesignTextRun[] = [];
  let offset = 0;
  let differs = false;
  for (const run of formatting.runs) {
    const source = clean(run.text);
    const visible = source.slice(Math.max(0, start - offset), Math.max(0, end - offset));
    offset += source.length;
    if (!visible) continue;
    const font = run.font === undefined ? undefined : formatting.fonts.get(run.font)?.replace(/;$/, '').trim();
    const color = run.style?.color === undefined ? undefined : formatting.colors[run.style.color];
    const style: NonNullable<DesignTextRun['style']> = rtfTextEffects(run.style, formatting.colors);
    if (run.style?.textAlpha !== undefined) style.fontOpacity = run.style.textAlpha / 255 * 100;
    if (run.style?.strike !== undefined) style.strike = run.style.strike;
    if (run.style?.baseline !== undefined) style.baseline = run.style.baseline;
    if (font && font !== base.fontFamily) style.fontFamily = font;
    if (color && color !== base.color) style.color = color;
    if (nominalSize && run.style?.size && run.style.size !== nominalSize) style.sizeScale = run.style.size / nominalSize;
    if (Object.keys(style).length) differs = true;
    for (const name of ['bold', 'italic', 'underline'] as const) {
      const active = Boolean(run.style?.[name]);
      if (run.style?.[name] !== undefined || base[name]) style[name] = active;
      if (active !== Boolean(base[name]) || (!hideParagraphs && run.style?.[name] !== undefined)) differs = true;
    }
    const formatted = Object.keys(style).length ? style : undefined;
    const align = !includeParagraphs || run.align === base.align ? undefined : run.align;
    const paragraph = hasParagraphLayout ? paragraphs.get(run.paragraphIndex) : undefined;
    if (align || paragraph) differs = true;
    runs.push({ text: visible, ...(formatted ? { style: formatted } : {}), ...(align ? { align } : {}), ...(paragraph ? { paragraph } : {}) });
  }
  return differs && runs.map((run) => run.text).join('') === text ? { text, runs: compactTextRuns(runs) } : { text };
}

function isSectionHeading(line: string): boolean {
  return /^(?:verse|chorus|bridge|pre[- ]?chorus|intro|outro|ending|end|tag|interlude|instrumental|solo)(?:\s+\d+)?\s*:?$/i.test(line);
}

function uniqueLabel(base: string, sectionCount: number): string {
  return base === 'Slide' ? `Slide ${sectionCount + 1}` : base;
}

/** Preserves EasyWorship slide boundaries and promotes familiar lyric headings to section labels. */
function splitSections(rawWords: string, offset = 0): EasyWorshipSection[] {
  const { text, runs } = runsFromEasyWorshipRtf(rawWords, {}, { includeParagraphs: true, inheritThemeFont: true });
  const sections: EasyWorshipSection[] = [];
  let cursor = 0;
  for (const slide of text.split(/\n?\f\n?|\n{2,}/)) {
    const start = text.indexOf(slide, cursor);
    cursor = start + slide.length;
    const lines = [...slide.matchAll(/[^\n]+/g)].filter(([line]) => line.trim());
    if (!lines.length) continue;
    const heading = lines[0][0].trim();
    const hasHeading = isSectionHeading(heading);
    const label = hasHeading ? heading.replace(/:$/, '') : uniqueLabel('Slide', offset + sections.length);
    if (hasHeading) lines.shift();
    const section: EasyWorshipSection = { label, lines: lines.map(([line]) => line.trim()) };
    if (runs) {
      const formatted = lines.flatMap(({ 0: line, index: position }, index) => {
        const from = start + position + line.length - line.trimStart().length;
        const fragments = sliceTextRuns(runs, from, from + section.lines[index].length);
        return index ? [{ ...fragments[0], text: '\n' }, ...fragments] : fragments;
      });
      if (formatted.some((run) => run.style || run.align || (run.paragraph && Object.keys(run.paragraph).length > 1))) {
        section.lyricRuns = compactTextRuns(formatted);
      }
    }

    sections.push(section);
  }
  return sections;
}

function metadataColumn(columns: string[], names: string[]): string | undefined {
  return findColumn(columns, names) ?? columns.find((column) =>
    names.some((name) => column.toLowerCase().includes(name)),
  );
}

type WordRecord = { words: string; slideIds: string[] };
const nativeSlideId = /^[1-9]\d*-(?!00000000-0000-0000-0000-000000000000$)[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function readWordRecords(database: Database, table: string) {
  const columns = getColumns(database, table);
  const songId = findColumn(columns, ['song_id', 'songid']);
  const words = metadataColumn(columns, ['words', 'word']);
  if (!songId || !words) throw new Error('ไฟล์ EasyWorship ไม่มีข้อมูลเนื้อร้องที่จำเป็นสำหรับการนำเข้า');
  const slideUids = findColumn(columns, ['slide_uids']);
  const selectedSlides = slideUids ? `, ${quoteIdentifier(slideUids)} AS slide_uids` : '';
  const songs = new Map<string, WordRecord[]>();
  const seenSlideIds = new Set<string>();
  const duplicateSlideIds = new Set<string>();
  for (const record of rows(
    database,
    `SELECT CAST(${quoteIdentifier(songId)} AS TEXT) AS song_id, ${quoteIdentifier(words)} AS words${selectedSlides} FROM ${quoteIdentifier(table)} ORDER BY ${quoteIdentifier(songId)}, rowid`,
  )) {
    const id = String(record.song_id);
    const entries = songs.get(id) ?? [];
    const slideIds = typeof record.slide_uids === 'string' ? record.slide_uids.split(',').map((uid) => uid.trim()) : [];
    for (const value of slideIds) {
      const uid = value.toLowerCase();
      if (seenSlideIds.has(uid)) duplicateSlideIds.add(uid);
      seenSlideIds.add(uid);
    }
    if (typeof record.words === 'string') entries.push({ words: record.words, slideIds });
    songs.set(id, entries);
  }
  return { songs, duplicateSlideIds };
}

function readSongSections(records: WordRecord[]) {
  const sections: EasyWorshipSection[] = [];
  const slideIds: (string | null)[] = [];
  for (const record of records) {
    const lyricSlides = splitSections(record.words, sections.length);
    sections.push(...lyricSlides);
    slideIds.push(...lyricSlides.map((_, index) => lyricSlides.length === record.slideIds.length ? record.slideIds[index] || null : null));
  }
  return { sections, slideIds };
}

function wordsRecordIdentity(sourceId: string, records: WordRecord[], duplicateSlideIds: Set<string>) {
  const source = records.map(({ words, slideIds }) => ({
    words, slideIds: slideIds.map((id) => id.toLowerCase()),
  }));
  if (!source.length || source.some(({ slideIds }) => !slideIds.length
    || slideIds.some((id) => !nativeSlideId.test(id) || duplicateSlideIds.has(id)))) return;
  return importIdentity(['easyworship-words-record-v1', sourceId, source]);
}

async function wordsRecovery(snapshot: string, sourceId: string, sections: EasyWorshipSection[], lyricsOnly: boolean,
  recordIdentity?: Promise<string>) {
  const first = sections[0]?.lines[0]?.trim();
  const title = `เพลงกู้คืน #${sourceId}${first ? ` · ${Array.from(first).slice(0, 72).join('')}` : ''}`;
  const [id, recordId] = await Promise.all([importIdentity(['easyworship-words-song-v1', snapshot, sourceId]), recordIdentity]);
  return { id, ...(recordId ? { recordId } : {}), title, lyricsOnly };
}

/** Recovers lyrics from a native words table when its separate song catalog is missing. */
export async function recoverEasyWorshipLyrics(file: File): Promise<EasyWorshipImport> {
  if (file.size > 128 * 1024 * 1024) throw new Error('SongWords มีขนาดเกิน 128 MB');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isEasyWorshipSqliteDatabase(bytes)) throw new Error('SongWords ต้องเป็นฐานข้อมูล SQLite ของ EasyWorship');
  const snapshot = await importIdentity('easyworship-words-snapshot-v1', bytes);
  const SQL = await getEasyWorshipSql();
  const database = new SQL.Database(bytes);
  try {
    const table = findTable(database, ['word', 'words']);
    if (!table) throw new Error('ไม่พบตารางเนื้อร้องใน SongWords');
    const songs: EasyWorshipSong[] = [];
    const skipped: EasyWorshipImport['skipped'] = [];
    let invalid = 0;
    const { songs: words, duplicateSlideIds } = readWordRecords(database, table);
    for (const [sourceId, records] of words) {
      if (!/^[1-9]\d*$/.test(sourceId)) {
        invalid++;
        continue;
      }
      const { sections } = readSongSections(records);
      const recovery = await wordsRecovery(snapshot, sourceId, sections, true, sections.length
        ? wordsRecordIdentity(sourceId, records, duplicateSlideIds) : undefined);
      if (!sections.length) {
        skipped.push({ sourceId, title: recovery.title, reason: 'ไม่พบสไลด์เนื้อร้องที่อ่านได้' });
        continue;
      }
      songs.push({ sourceId, title: recovery.title, author: null, copyright: null, ccli: null, sections, wordsRecovery: recovery });
    }
    return { songs, skipped, recoveredLyricsOnly: true,
      ...(invalid ? { warnings: [`ข้ามเนื้อร้องที่ไม่มีรหัสเพลงที่อ่านได้ ${invalid} กลุ่ม`] } : {}) };
  } finally {
    database.close();
  }
}

/**
 * Reads an EasyWorship `Songs.db` and matching `SongWords.db` pair.
 * File bytes stay in the user's browser throughout parsing.
 */
export async function readEasyWorshipSongs(
  songsFile: File,
  wordsFile: File,
): Promise<EasyWorshipImport> {
  const SQL = await getEasyWorshipSql();
  let songsDatabase: Database | undefined;
  let wordsDatabase: Database | undefined;
  let snapshot: string;

  try {
    const songsBytes = new Uint8Array(await songsFile.arrayBuffer());
    const wordsBytes = new Uint8Array(await wordsFile.arrayBuffer());
    if (!isEasyWorshipSqliteDatabase(songsBytes) || !isEasyWorshipSqliteDatabase(wordsBytes)) {
      throw new Error('ไฟล์นี้ไม่ใช่ฐานข้อมูล SQLite อาจเป็นฐานข้อมูล EasyWorship รุ่นเก่าหรือไฟล์เสียหาย');
    }
    songsDatabase = new SQL.Database(songsBytes);
    wordsDatabase = new SQL.Database(wordsBytes);
    snapshot = await importIdentity('easyworship-words-snapshot-v1', wordsBytes);
  } catch {
    songsDatabase?.close();
    wordsDatabase?.close();
    throw new Error('เปิดฐานข้อมูล EasyWorship ไม่สำเร็จ โปรดเลือก Songs.db และ SongWords.db ที่เป็น SQLite');
  }

  try {
    const songTable = findTable(songsDatabase, ['song', 'songs']);
    const wordTable = findTable(wordsDatabase, ['word', 'words']);
    if (!songTable || !wordTable) {
      throw new Error('ไม่พบตารางเพลงและเนื้อร้องของ EasyWorship ในไฟล์ที่เลือก');
    }

    const songColumns = getColumns(songsDatabase, songTable);
    const titleColumn = metadataColumn(songColumns, ['title']);
    if (!titleColumn) {
      throw new Error('ไฟล์ EasyWorship ไม่มีข้อมูลเพลงที่จำเป็นสำหรับการนำเข้า');
    }

    const authorColumn = metadataColumn(songColumns, ['author', 'writer']);
    const copyrightColumn = metadataColumn(songColumns, ['copyright']);
    const administratorColumn = metadataColumn(songColumns, ['administrator']);
    const descriptionColumn = metadataColumn(songColumns, ['description']);
    const tagsColumn = metadataColumn(songColumns, ['tags']);
    const ccliColumn = findColumn(songColumns, ['reference_number', 'song_number', 'ccli'])
      ?? metadataColumn(songColumns, ['ccli']);
    const presentationColumn = findColumn(songColumns, ['presentation_id']);
    const uidColumn = findColumn(songColumns, ['song_uid']);
    const itemUidColumn = findColumn(songColumns, ['song_item_uid']);
    const selectedColumns = [
      `CAST(rowid AS TEXT) AS source_id`,
      `${quoteIdentifier(titleColumn)} AS title`,
      authorColumn ? `${quoteIdentifier(authorColumn)} AS author` : 'NULL AS author',
      copyrightColumn ? `${quoteIdentifier(copyrightColumn)} AS copyright` : 'NULL AS copyright',
      administratorColumn ? `${quoteIdentifier(administratorColumn)} AS administrator` : 'NULL AS administrator',
      descriptionColumn ? `${quoteIdentifier(descriptionColumn)} AS description` : 'NULL AS description',
      tagsColumn ? `${quoteIdentifier(tagsColumn)} AS tags` : 'NULL AS tags',
      ccliColumn ? `${quoteIdentifier(ccliColumn)} AS ccli` : 'NULL AS ccli',
      uidColumn ? `${quoteIdentifier(uidColumn)} AS song_uid` : 'NULL AS song_uid',
      itemUidColumn ? `${quoteIdentifier(itemUidColumn)} AS song_item_uid` : 'NULL AS song_item_uid',
      presentationColumn ? `${quoteIdentifier(presentationColumn)} AS presentation_id` : 'NULL AS presentation_id',
    ].join(', ');
    const sourceSongs = rows(
      songsDatabase,
      `SELECT ${selectedColumns} FROM ${quoteIdentifier(songTable)} ORDER BY rowid`,
    );
    const { songs: wordsBySongId, duplicateSlideIds } = readWordRecords(wordsDatabase, wordTable);
    const songs: EasyWorshipSong[] = [];
    const skipped: EasyWorshipImport['skipped'] = [];

    for (const sourceSong of sourceSongs) {
      const sourceId = String(sourceSong.source_id);
      const title = stringOrNull(sourceSong.title) ?? `เพลงไม่มีชื่อ ${sourceId}`;
      const records = wordsBySongId.get(sourceId) ?? [];
      const { sections, slideIds } = readSongSections(records);

      if (sections.length === 0) {
        skipped.push({ sourceId, title, reason: 'ไม่พบสไลด์เนื้อร้องที่อ่านได้' });
        continue;
      }

      const administrator = stringOrNull(sourceSong.administrator);
      const description = stringOrNull(sourceSong.description);
      const tags = songTagsFromText(stringOrNull(sourceSong.tags) ?? '');
      const sourceUid = normalizeEasyWorshipUid(sourceSong.song_uid) ?? normalizeEasyWorshipUid(sourceSong.song_item_uid);
      songs.push({
        sourceId,
        ...(sourceUid ? { sourceUid } : {}),
        title,
        author: stringOrNull(sourceSong.author),
        copyright: stringOrNull(sourceSong.copyright),
        ...(administrator ? { administrator } : {}),
        ...(description ? { description } : {}),
        ...(tags.length ? { tags } : {}),
        ccli: textOrNull(sourceSong.ccli),
        sections,
        ...(/^[1-9]\d*$/.test(sourceId) ? {
          wordsRecovery: await wordsRecovery(snapshot, sourceId, sections, false, wordsRecordIdentity(sourceId, records, duplicateSlideIds)),
        } : {}),
        ...(typeof sourceSong.presentation_id === 'number' && sourceSong.presentation_id > 0
          ? { layoutLink: { presentationId: String(sourceSong.presentation_id), slideIds } } : {}),
      });
    }

    return { songs, skipped };
  } finally {
    songsDatabase.close();
    wordsDatabase.close();
  }
}
