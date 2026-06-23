/** useSongFormatter — prepares text/images and invokes the song-formatting Edge Function */

import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';

export type FormatterImageInput = {
  id: string;
  file: File;
  previewUrl: string;
};

export type SongFormatterResult = {
  status: 'formatted' | 'refused';
  reply: string;
  title: string;
  artist: string;
  formattedText: string;
  warnings: string[];
};

type EdgeImagePayload = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

type EdgeFormatterRequest = {
  message: string;
  rawText: string;
  currentTitle: string;
  currentArtist: string;
  ocrText: string;
  ocrWarnings: string[];
  images: EdgeImagePayload[];
};

type TesseractModule = {
  recognize: (
    image: File,
    language?: string,
  ) => Promise<{
    data: {
      text: string;
    };
  }>;
};

type FormatterState = {
  isFormatting: boolean;
  error: string | null;
};

const MIN_USEFUL_OCR_CHARACTERS = 40;
const MAX_GROQ_IMAGE_SIDE = 1600;
const GROQ_IMAGE_QUALITY = 0.82;

function getDeviceId(): string {
  const storageKey = 'worship2_song_formatter_device_id';
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;

  const id = crypto.randomUUID();
  window.localStorage.setItem(storageKey, id);
  return id;
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('อ่านรูปภาพไม่สำเร็จ'));
    image.src = dataUrl;
  });
}

async function prepareImageForGroq(file: File): Promise<EdgeImagePayload> {
  const originalDataUrl = await fileToDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const scale = Math.min(1, MAX_GROQ_IMAGE_SIDE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    return {
      name: file.name,
      mimeType: file.type,
      dataUrl: originalDataUrl,
    };
  }

  context.drawImage(image, 0, 0, width, height);

  return {
    name: file.name,
    mimeType: 'image/jpeg',
    dataUrl: canvas.toDataURL('image/jpeg', GROQ_IMAGE_QUALITY),
  };
}

async function runBrowserOcr(images: FormatterImageInput[]): Promise<{ text: string; warnings: string[] }> {
  if (images.length === 0) return { text: '', warnings: [] };

  try {
    const tesseract = (await import('tesseract.js')) as TesseractModule;
    const results = await Promise.all(
      images.map(async (image, index) => {
        try {
          const result = await tesseract.recognize(image.file, 'tha+eng');
          return `ภาพที่ ${index + 1}\n${result.data.text.trim()}`.trim();
        } catch {
          return '';
        }
      }),
    );
    const text = results.filter(Boolean).join('\n\n');
    const warnings = text.replace(/\s/g, '').length < MIN_USEFUL_OCR_CHARACTERS
      ? ['OCR จากรูปยังไม่ชัด ระบบจะให้ AI ช่วยอ่านภาพเพิ่มเติม กรุณาตรวจสอบ']
      : ['กรุณาตรวจสอบ'];

    return { text, warnings };
  } catch {
    return {
      text: '',
      warnings: ['OCR ใน browser ใช้งานไม่ได้ ระบบจะให้ AI ช่วยอ่านภาพ กรุณาตรวจสอบ'],
    };
  }
}

export function useSongFormatter() {
  const [state, setState] = useState<FormatterState>({
    isFormatting: false,
    error: null,
  });

  const formatSong = useCallback(
    async ({
      message,
      rawText,
      images,
      currentTitle,
      currentArtist,
    }: {
      message: string;
      rawText: string;
      images: FormatterImageInput[];
      currentTitle: string;
      currentArtist: string;
    }): Promise<SongFormatterResult | null> => {
      setState({ isFormatting: true, error: null });

      try {
        const [ocrResult, imagePayloads] = await Promise.all([
          runBrowserOcr(images),
          Promise.all(
            images.map(async (image) => prepareImageForGroq(image.file)),
          ),
        ]);

        const request: EdgeFormatterRequest = {
          message,
          rawText,
          currentTitle,
          currentArtist,
          ocrText: ocrResult.text,
          ocrWarnings: ocrResult.warnings,
          images: imagePayloads,
        };

        const { data, error } = await supabase.functions.invoke<SongFormatterResult>('format-song', {
          body: request,
          headers: {
            'x-worship-device-id': getDeviceId(),
          },
        });

        if (error) throw error;
        if (!data) throw new Error('ไม่ได้รับคำตอบจากระบบแปลงเพลง');

        return data;
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'แปลงเพลงไม่สำเร็จ';
        setState({ isFormatting: false, error: messageText });
        return null;
      } finally {
        setState((current) => ({ ...current, isFormatting: false }));
      }
    },
    [],
  );

  return {
    ...state,
    formatSong,
  };
}
