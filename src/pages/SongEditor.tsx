/** SongEditor — create or edit a song with raw text input, live preview, and key selection */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSongEditorStore } from '../store/songEditorStore';
import { useSong } from '../hooks/useSongs';
import { useSongs as useSongsList } from '../hooks/useSongs';
import ChordDisplay from '../components/ChordDisplay';
import TransposeControls, { ALL_KEYS } from '../components/TransposeControls';
import { CHROMATIC_SHARP, CHROMATIC_FLAT } from '../utils/transpose';

/** All unique keys for the dropdown (sharps + flats, deduplicated) */
const KEY_OPTIONS = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F',
  'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
];

/** Song Editor page — paste raw chord+lyrics, parse, preview, and save */
export default function SongEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const { song, loading: songLoading } = useSong(id);
  const { addSong, updateSong } = useSongsList();

  const {
    rawText,
    parsedContent,
    detectedKey,
    transpose,
    useFlats,
    editingSongId,
    setRawText,
    parse,
    setTranspose,
    setUseFlats,
    setEditingSongId,
    reset,
  } = useSongEditorStore();

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [selectedKey, setSelectedKey] = useState('C');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load existing song in edit mode
  useEffect(() => {
    if (isEditing && id) {
      setEditingSongId(id);
    }
    return () => {
      reset();
    };
  }, [id, isEditing, setEditingSongId, reset]);

  useEffect(() => {
    if (song && isEditing && editingSongId === song.id) {
      setTitle(song.title);
      setArtist(song.artist ?? '');
      setSelectedKey(song.original_key);
      setRawText(song.content_raw);
      // Auto-parse on load
      parse();
    }
  }, [song, isEditing, editingSongId, setRawText, parse]);

  // Sync detected key to selected key when it changes
  useEffect(() => {
    if (detectedKey && !isEditing) {
      setSelectedKey(detectedKey);
    }
  }, [detectedKey, isEditing]);

  const handleParse = () => {
    parse();
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setSaveError('Title is required');
      return;
    }
    if (!rawText.trim()) {
      setSaveError('Song content is required');
      return;
    }

    // Make sure we've parsed before saving
    const content = parsedContent ?? { sections: [] };

    setSaving(true);
    setSaveError(null);

    try {
      if (isEditing && id) {
        await updateSong(id, {
          title: title.trim(),
          artist: artist.trim() || null,
          original_key: selectedKey,
          content_raw: rawText,
          content_parsed: content,
        });
        navigate(`/songs/${id}`);
      } else {
        const newSong = await addSong({
          title: title.trim(),
          artist: artist.trim() || null,
          original_key: selectedKey,
          content_raw: rawText,
          content_parsed: content,
        });
        navigate(`/songs/${newSong.id}`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save song');
    } finally {
      setSaving(false);
    }
  };

  if (isEditing && songLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f0f0f]">
        <div className="text-[#898989] text-sm">Loading song...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#242424]">
        <h1 className="text-lg font-medium text-[#fafafa]">
          {isEditing ? 'Edit Song' : 'New Song'}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-1.5 rounded border border-[#2e2e2e] text-sm text-[#b4b4b4] hover:text-[#fafafa] hover:border-[#363636] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-full bg-[#3ecf8e] text-[#0f0f0f] text-sm font-medium hover:bg-[#2db87a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      {/* Error banner */}
      {saveError && (
        <div className="px-6 py-2 bg-red-900/30 border-b border-red-800 text-red-300 text-sm">
          {saveError}
        </div>
      )}

      {/* Body — metadata + editor + preview */}
      <div className="flex-1 flex min-h-0">
        {/* Left side — metadata and editor */}
        <div className="w-1/2 flex flex-col border-r border-[#242424]">
          {/* Metadata fields */}
          <div className="px-6 py-4 space-y-3 border-b border-[#242424]">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-[#898989] mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Song title"
                  className="w-full px-3 py-2 rounded bg-[#171717] border border-[#2e2e2e] text-sm text-[#fafafa] placeholder-[#898989] focus:outline-none focus:border-[#3ecf8e] transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-[#898989] mb-1">Artist</label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="Artist name"
                  className="w-full px-3 py-2 rounded bg-[#171717] border border-[#2e2e2e] text-sm text-[#fafafa] placeholder-[#898989] focus:outline-none focus:border-[#3ecf8e] transition-colors"
                />
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-xs text-[#898989] mb-1">Key</label>
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  className="px-3 py-2 rounded bg-[#171717] border border-[#2e2e2e] text-sm text-[#fafafa] focus:outline-none focus:border-[#3ecf8e] transition-colors"
                >
                  {KEY_OPTIONS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              {detectedKey && (
                <span className="text-xs text-[#898989] pb-2">
                  Auto-detected: <span className="text-[#3ecf8e]">{detectedKey}</span>
                </span>
              )}
            </div>
          </div>

          {/* Raw text editor */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-6 py-2 border-b border-[#242424]">
              <span className="text-xs text-[#898989] uppercase tracking-wider">
                Raw Chord + Lyrics
              </span>
              <button
                onClick={handleParse}
                className="px-3 py-1 rounded border border-[#3ecf8e] text-xs text-[#3ecf8e] hover:bg-[#3ecf8e] hover:text-[#0f0f0f] transition-colors"
              >
                Parse
              </button>
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Paste chord+lyrics here...\n\nExample:\nC        G          Am       F\nAmazing grace how sweet the sound\n\nOr ChordPro format:\n[C]Amazing [G]grace [Am]how [F]sweet`}
              className="flex-1 w-full px-6 py-4 bg-[#171717] text-sm text-[#fafafa] font-mono placeholder-[#898989] resize-none focus:outline-none"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Right side — live preview */}
        <div className="w-1/2 flex flex-col">
          <div className="px-6 py-2 border-b border-[#242424]">
            <TransposeControls
              originalKey={selectedKey}
              transpose={transpose}
              useFlats={useFlats}
              onTransposeChange={setTranspose}
              onFlatsChange={setUseFlats}
            />
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {parsedContent && parsedContent.sections.length > 0 ? (
              <ChordDisplay
                content={parsedContent}
                transpose={transpose}
                useFlats={useFlats}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-[#898989] text-sm">
                    Paste chord+lyrics text and click <strong className="text-[#3ecf8e]">Parse</strong> to see a preview
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
