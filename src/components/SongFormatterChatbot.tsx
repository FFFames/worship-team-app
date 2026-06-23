/** SongFormatterChatbot — sidebar tool that formats raw chord/lyrics text and images */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  type FormatterImageInput,
  useSongFormatter,
} from '../hooks/useSongFormatter';

export type SongFormatterApplyPayload = {
  title: string;
  artist: string;
  formattedText: string;
};

type SongFormatterChatbotProps = {
  rawText: string;
  title: string;
  artist: string;
  onApply: (payload: SongFormatterApplyPayload) => void;
};

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

type FormatterNotice = {
  tone: 'success' | 'warning';
  text: string;
};

function createImageInput(file: File): FormatterImageInput {
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

function isSupportedImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.has(file.type);
}

function getImagesFromClipboard(data: DataTransfer): File[] {
  const fileImages = Array.from(data.files).filter(isSupportedImage);
  const itemImages = Array.from(data.items)
    .filter((item) => item.kind === 'file' && ACCEPTED_IMAGE_TYPES.has(item.type))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);

  const uniqueFiles = new Map<string, File>();
  for (const file of [...fileImages, ...itemImages]) {
    uniqueFiles.set(`${file.name}:${file.size}:${file.lastModified}:${file.type}`, file);
  }

  return Array.from(uniqueFiles.values());
}

export function SongFormatterChatbot({
  rawText,
  title,
  artist,
  onApply,
}: SongFormatterChatbotProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<FormatterImageInput[]>([]);
  const { isFormatting, error, formatSong } = useSongFormatter();

  const [message, setMessage] = useState('');
  const [images, setImages] = useState<FormatterImageInput[]>([]);
  const [notice, setNotice] = useState<FormatterNotice | null>(null);
  const [localWarning, setLocalWarning] = useState<string | null>(null);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => (
    () => {
      for (const image of imagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
    }
  ), []);

  const imageCountLabel = useMemo(() => {
    if (images.length === 0) return 'ยังไม่มีรูป';
    return `${images.length} รูป`;
  }, [images.length]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const nextImages = Array.from(files).filter(isSupportedImage).map(createImageInput);
    if (nextImages.length === 0) {
      setLocalWarning('รองรับเฉพาะ JPG และ PNG');
      return;
    }

    setImages((current) => [...current, ...nextImages]);
    setLocalWarning(null);
    setNotice(null);
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((image) => image.id !== id);
    });
  }, []);

  const clearImages = useCallback(() => {
    setImages((current) => {
      for (const image of current) {
        URL.revokeObjectURL(image.previewUrl);
      }
      return [];
    });
  }, []);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLElement>) => {
      const files = getImagesFromClipboard(event.clipboardData);
      if (files.length > 0) {
        event.preventDefault();
        addFiles(files);
      }
    },
    [addFiles],
  );

  const handleFormat = useCallback(async () => {
    const hasInput = message.trim().length > 0 || rawText.trim().length > 0 || images.length > 0;
    if (!hasInput) {
      setLocalWarning('ใส่ raw chord/lyrics หรือแนบรูปก่อนครับ');
      setNotice(null);
      return;
    }

    const nextResult = await formatSong({
      message,
      rawText,
      images,
      currentTitle: title,
      currentArtist: artist,
    });

    if (nextResult) {
      setLocalWarning(null);
      if (nextResult.status === 'formatted') {
        onApply({
          title: nextResult.title,
          artist: nextResult.artist,
          formattedText: nextResult.formattedText,
        });
        setMessage('');
        clearImages();
        setNotice({
          tone: 'success',
          text: nextResult.warnings.length > 0
            ? `อัปเดตข้อความด้านซ้ายแล้ว · ${nextResult.warnings.join(' · ')}`
            : 'อัปเดตข้อความด้านซ้ายแล้ว · กรุณาตรวจสอบ',
        });
      } else {
        setNotice({
          tone: 'warning',
          text: nextResult.reply,
        });
      }
    }
  }, [artist, clearImages, formatSong, images, message, onApply, rawText, title]);

  return (
    <aside
      className="surface"
      onPaste={handlePaste}
      style={{ flex: '0 0 360px', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}
    >
      <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="section-label">AI แปลงคอร์ด/เนื้อเพลง</div>
        <p style={{ color: 'var(--fg-tertiary)', fontSize: '0.8125rem', lineHeight: 1.5, margin: 'var(--space-xs) 0 0' }}>
          เครื่องมือนี้ทำได้แค่จัด raw chord/lyrics ให้เป็น format มาตรฐานเท่านั้น
        </p>
      </div>

      <div style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', overflowY: 'auto' }}>
        <div>
          <label className="field-label">คำสั่ง / raw text เพิ่มเติม</label>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={rawText.trim() ? 'พิมพ์คำสั่งแก้ข้อความด้านซ้าย เช่น “แก้ Hook บรรทัดแรกให้คอร์ดเป็น F G Em Am F”' : 'วางคอร์ด เนื้อเพลง หรือรูปภาพจาก clipboard ได้ที่นี่'}
            spellCheck={false}
            className="input-field"
            style={{ minHeight: 120, resize: 'vertical', lineHeight: 1.5 }}
          />
          <p style={{ margin: 'var(--space-xs) 0 0', color: 'var(--fg-tertiary)', fontSize: '0.75rem', lineHeight: 1.5 }}>
            {rawText.trim()
              ? 'ถ้าช่องซ้ายมีเพลงอยู่แล้ว คำสั่งนี้จะใช้แก้ข้อความปัจจุบัน'
              : 'ระบบจะอัปเดตช่องข้อความด้านซ้ายทันทีหลังแปลงสำเร็จ'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-sm)' }}>
          <span style={{ color: 'var(--fg-tertiary)', fontSize: '0.8125rem' }}>{imageCountLabel}</span>
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            {images.length > 0 && (
              <button type="button" className="btn-ghost" onClick={clearImages}>
                ล้างรูป
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
              แนบรูป
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            multiple
            hidden
            onChange={(event) => {
              if (event.currentTarget.files) {
                addFiles(event.currentTarget.files);
                event.currentTarget.value = '';
              }
            }}
          />
        </div>

        {images.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-xs)' }}>
            {images.map((image) => (
              <div key={image.id} style={{ position: 'relative', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <img src={image.previewUrl} alt={image.file.name} style={{ width: '100%', height: 72, objectFit: 'cover', display: 'block' }} />
                <button
                  type="button"
                  onClick={() => removeImage(image.id)}
                  aria-label={`ลบรูป ${image.file.name}`}
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: 9999,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--fg-primary)',
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {(localWarning || error) && (
          <div style={{ color: 'var(--status-error-text)', background: 'var(--status-error-bg)', border: '1px solid var(--status-error-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-sm)', fontSize: '0.8125rem' }}>
            {localWarning || error}
          </div>
        )}

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={handleFormat}
          disabled={isFormatting}
          className="btn-primary"
          style={{ opacity: isFormatting ? 0.6 : 1, cursor: isFormatting ? 'not-allowed' : 'pointer' }}
        >
          {isFormatting ? 'กำลัง OCR/แปลง…' : 'แปลง / แก้ไข'}
        </motion.button>

        {notice && (
          <div
            style={{
              color: notice.tone === 'success' ? 'var(--accent)' : 'var(--status-error-text)',
              background: notice.tone === 'success' ? 'var(--accent-bg)' : 'var(--status-error-bg)',
              border: notice.tone === 'success' ? '1px solid var(--accent-muted)' : '1px solid var(--status-error-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-sm)',
              fontSize: '0.8125rem',
              lineHeight: 1.5,
            }}
          >
            {notice.text}
          </div>
        )}
      </div>
    </aside>
  );
}
