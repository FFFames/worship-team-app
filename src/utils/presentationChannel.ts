/** BroadcastChannel communication for dual-window presentation sync.
 *  Control window sends commands; Presenter window receives and renders. */

import type { MediaClip, MediaKind, MediaPlayback, VideoAlphaMode } from '../types/media'
import type { PlaylistCueAsset } from '../types/database'
import type { DesignTextRun, SlideDesign, SlideTransition } from '../types/slideDesign'
import type { DefaultTheme } from './defaultThemes'
import type { AlertProgress, OutputAlert } from '../types/alertTemplate'
import type { NurseryDisplay } from './nurseryAlerts'
import { updateAlertProgress } from './alertPlayback'
import { withoutCanvasBackground } from './slideDesign'
import type { MediaOutcome } from './slidePlayback'
import { mediaClipKey } from './mediaClip'
import { splitVideoAlpha } from './videoAlpha'
import type { SongProjection } from './songProjection'
import type { CameraInput, FeedVideo } from '../types/liveFeed'
import { cameraLayerKey } from './livePresentation'
import type { DvdPlayback } from '../types/dvdClip'
import type { ScriptureReference } from './scriptureOutput'

export type PresentationMedia = (
  | (({ playlistId: string; archivePath: string; libraryId?: string }
    | { libraryId: string; playlistId?: string; archivePath?: string }) & { kind: MediaKind })
  | { kind: 'web'; url: string; hideScrollbars?: boolean }
  | ({ kind: 'camera'; feedVideo?: FeedVideo } & CameraInput)
) & {
  role?: 'foreground' | 'background';
  runId?: string;
  repeat?: boolean;
  clip?: MediaClip;
  alphaMode?: VideoAlphaMode;
  dvdPlayback?: DvdPlayback;
  playback?: MediaPlayback;
};

export type PresentationSoundtrack = PresentationMedia & { kind: 'audio'; repeat?: boolean };
export type PresentationPlayback = { key: string; playing: boolean; muted: boolean };

/** Creates a standalone soundtrack while keeping inherited audio continuous across slides. */
export function librarySoundtrack(assets: PlaylistCueAsset[] | undefined, itemId: string, restartId?: string): PresentationSoundtrack | undefined {
  const track = assets?.find((asset) => asset.kind === 'audio' && asset.libraryId);
  if (!track?.libraryId) return undefined;
  return { kind: 'audio', libraryId: track.libraryId, role: track.role, repeat: track.repeat, clip: track.clip,
    ...(track.playback ? { playback: track.playback } : {}),
    runId: restartId ?? (track.role === 'background' ? itemId : crypto.randomUUID()) };
}
type AlternateCueOptions = {
  mediaOverride?: 'background' | 'foreground'
  originalDesign?: { design: SlideDesign; playlistId?: string }
  designBackgroundOverride?: boolean
}

export type CueMediaPlayback = { completionId?: string; runId?: string; loop?: boolean; once?: boolean }

export function presentationMediaKey(media: PresentationMedia): string {
  const source = media.kind === 'camera' ? `camera:${media.deviceId}`
    : media.kind === 'web' ? `web:${media.url}`
      : 'libraryId' in media ? `library:${media.libraryId}` : `schedule:${media.playlistId}:${media.archivePath}`
  const mark = mediaClipKey(media.clip)
  const alpha = media.kind === 'video' ? splitVideoAlpha(media.alphaMode) : undefined
  const mute = media.playback?.muted !== undefined ? `muted=${media.playback.muted}`
    : media.kind === 'video' && media.dvdPlayback?.muted !== undefined ? `dvd-muted=${media.dvdPlayback.muted}` : undefined
  const key = [source, mark, alpha, mute].filter(Boolean).join(':')
  return media.runId ? `${key}:${media.runId}` : key
}

export function defaultMediaMuted(media: PresentationMedia): boolean {
  if (media.kind === 'camera') return media.audioLevel === undefined;
  if (typeof media.playback?.muted === 'boolean') return media.playback.muted;
  if (media.kind === 'video' && typeof media.dvdPlayback?.muted === 'boolean') return media.dvdPlayback.muted;
  return media.kind !== 'audio' && (media.role === 'background' || ('archivePath' in media && media.kind === 'video'))
}

export type PresentationMessage =
  | { type: 'SHOW_LYRICS'; lyrics: string; lyricRuns?: DesignTextRun[]; subtitle?: string; background?: string; media?: PresentationMedia; soundtrack?: PresentationSoundtrack; transitionSound?: PresentationSoundtrack; alternate?: AlternateCueOptions; transition?: SlideTransition; cuePlayback?: CueMediaPlayback; songProjection?: SongProjection; songLabel?: string; scripture?: ScriptureReference }
  | { type: 'SHOW_DESIGN'; design: SlideDesign; playlistId?: string; media?: PresentationMedia; background?: string; soundtrack?: PresentationSoundtrack; transitionSound?: PresentationSoundtrack; alternate?: AlternateCueOptions; overlayMedia?: boolean; transition?: SlideTransition; cuePlayback?: CueMediaPlayback; songProjection?: SongProjection; songLabel?: string; scripture?: ScriptureReference }
  | { type: 'SHOW_WELCOME'; welcomeImageUrl?: string; background?: string; logo?: DefaultTheme; runId?: string }
  | { type: 'SHOW_BLACK' }
  | { type: 'SHOW_ALERT'; alert: OutputAlert }
  | { type: 'CLEAR_ALERT' }
  | { type: 'SET_NURSERY_ALERTS'; display: NurseryDisplay | null }
  | { type: 'SET_BACKGROUND'; url: string }
  | { type: 'SET_TEXT_POSITION'; offset: number }
  | { type: 'SET_TEXT_HIDDEN'; hidden: boolean }
  | { type: 'SET_FOREGROUND_CLEARED'; cleared: boolean }
  | { type: 'SET_OUTPUT_BLANKED'; blanked: boolean }
  | { type: 'SET_MEDIA_PLAYBACK'; key: string; playing?: boolean; muted?: boolean }
  | { type: 'STOP_CAMERA'; key: string }
  | { type: 'CLOSE' };

const CHANNEL_NAME = 'worshipteam-presentation';
type PlaybackMessage = Extract<PresentationMessage, { type: 'SET_MEDIA_PLAYBACK' }>;
type CameraStatus = { type: 'CAMERA_STATUS'; key: string; status: string | null };
type AlertProgressMessage = AlertProgress & { type: 'ALERT_PROGRESS' };
type MediaProgress = { type: 'MEDIA_PROGRESS'; id: string; track: string; outcome: 'ended' | 'failed' };
type SongProjectionFailure = { type: 'SONG_PROJECTION_FAILURE'; id: string };
type ScreenCue = Extract<PresentationMessage, { type: 'SHOW_LYRICS' | 'SHOW_DESIGN' }>;

function completionTracks(cue: ScreenCue) {
  const tracks = new Set<string>();
  if (cue.soundtrack) tracks.add('soundtrack');
  if ((cue.media?.kind === 'video' || cue.media?.kind === 'audio') && (cue.type === 'SHOW_LYRICS' || cue.overlayMedia)) tracks.add('media');
  if (cue.type === 'SHOW_DESIGN') {
    const design = cue.overlayMedia && cue.media ? withoutCanvasBackground(cue.design) : cue.design;
    for (const layer of design.layers) {
      if (layer.kind === 'media' && layer.asset.kind === 'video') tracks.add(`layer:${layer.id}`);
    }
  }
  return tracks;
}

/**
 * Creates a control-side channel (the window that drives the presentation).
 * Use `send()` to dispatch messages to the presenter window.
 */
export function createControlChannel(
  session?: string,
  onCameraStatus?: (status: string | null) => void,
  onAlertProgress?: (progress: AlertProgress) => void,
  onMediaComplete?: (id: string, outcome: MediaOutcome) => void,
  onSongProjectionFailure?: () => void,
): {
  send: (msg: PresentationMessage) => void;
  stopLiveInputs: () => void;
  stopSoundtrack: () => void;
  close: () => void;
} {
  const channel = new BroadcastChannel(session ? `${CHANNEL_NAME}:${session}` : CHANNEL_NAME);
  const latest = new Map<string, PresentationMessage>();
  const playback = new Map<string, PlaybackMessage>();
  let mediaKey: string | undefined;
  let soundtrackKey: string | undefined;
  let completion: { id: string; tracks: Set<string> } | undefined;

  function stopLiveInputs() {
    const current = latest.get('screen');
    if (current?.type === 'SHOW_WELCOME' && current.logo) {
      const { logo: _logo, ...fallback } = current;
      latest.set('screen', fallback);
      channel.postMessage(fallback);
      return;
    }
    if (current?.type !== 'SHOW_LYRICS' && current?.type !== 'SHOW_DESIGN') return;
    const removeMedia = current.media?.kind === 'camera' || current.media?.kind === 'web';
    const isLiveLayer = (layer: SlideDesign['layers'][number]) => layer.kind === 'web' || layer.kind === 'camera';
    const original = current.alternate?.originalDesign;
    const liveLayers = (current.type === 'SHOW_DESIGN' && current.design.layers.some(isLiveLayer)) || original?.design.layers.some(isLiveLayer);
    if (!removeMedia && !liveLayers) return;
    let next: typeof current = { ...current, media: removeMedia ? undefined : current.media, transition: undefined };
    if (liveLayers && next.type === 'SHOW_DESIGN') {
      next = { ...next, design: { ...next.design, layers: next.design.layers.filter((layer) => !isLiveLayer(layer)) } };
    }
    if (original) next.alternate = { ...next.alternate, originalDesign: {
      ...original, design: { ...original.design, layers: original.design.layers.filter((layer) => !isLiveLayer(layer)) },
    } };
    channel.postMessage(current.media?.kind === 'camera' && !liveLayers
      ? { type: 'STOP_CAMERA', key: presentationMediaKey(current.media) } : next);
    latest.set('screen', next);
    if (removeMedia) {
      if (mediaKey) playback.delete(mediaKey);
      mediaKey = undefined;
    }
  }

  function stopSoundtrack() {
    if (!soundtrackKey) return;
    const message: PlaybackMessage = { ...playback.get(soundtrackKey), type: 'SET_MEDIA_PLAYBACK', key: soundtrackKey, playing: false };
    playback.set(soundtrackKey, message);
    channel.postMessage(message);
  }

  channel.onmessage = (event: MessageEvent<{ type: 'PRESENTER_READY' } | CameraStatus | AlertProgressMessage | MediaProgress | SongProjectionFailure>) => {
    if (event.data?.type === 'PRESENTER_READY') {
      for (const message of latest.values()) {
        channel.postMessage(message.type === 'SHOW_LYRICS' || message.type === 'SHOW_DESIGN'
          ? { ...message, transition: undefined } : message);
      }
      for (const message of playback.values()) channel.postMessage(message);
    }
    if (event.data?.type === 'CAMERA_STATUS') {
      const { key, status } = event.data;
      const cue = latest.get('screen');
      const isCameraLayer = cue?.type === 'SHOW_DESIGN' && cue.design.layers.some((layer) => layer.kind === 'camera' && cameraLayerKey(layer.id) === key);
      if (key === mediaKey || isCameraLayer) onCameraStatus?.(status);
    }
    if (event.data?.type === 'SONG_PROJECTION_FAILURE') {
      const cue = latest.get('screen');
      if ((cue?.type === 'SHOW_LYRICS' || cue?.type === 'SHOW_DESIGN') && cue.songProjection?.id === event.data.id) {
        onSongProjectionFailure?.();
      }
    }
    if (event.data?.type === 'MEDIA_PROGRESS' && (event.data.outcome === 'ended' || event.data.outcome === 'failed') && completion?.id === event.data.id
      && completion.tracks.delete(event.data.track) && (event.data.outcome === 'failed' || completion.tracks.size === 0)) {
      const { id } = completion;
      completion = undefined;
      onMediaComplete?.(id, event.data.outcome);
    }
    if (event.data?.type === 'ALERT_PROGRESS') {
      const current = latest.get('alert');
      if (current?.type !== 'SHOW_ALERT') return;
      const { id, remaining, revision } = event.data;
      const next = updateAlertProgress(current.alert, id, remaining, revision);
      if (next === current.alert) return;
      const message: PresentationMessage = next ? { type: 'SHOW_ALERT', alert: next } : { type: 'CLEAR_ALERT' };
      latest.set('alert', message);
      if (onAlertProgress) onAlertProgress({ id, remaining, revision });
      else if (!next) channel.postMessage(message);
    }
  };

  return {
    send(msg: PresentationMessage) {
      if (msg.type === 'SET_MEDIA_PLAYBACK') {
        if (msg.key !== mediaKey && msg.key !== soundtrackKey) return;
        playback.set(msg.key, { ...playback.get(msg.key), ...msg });
      } else if (msg.type !== 'CLOSE' && msg.type !== 'STOP_CAMERA') {
        const topic = msg.type === 'SHOW_ALERT' || msg.type === 'CLEAR_ALERT'
          ? 'alert'
          : msg.type === 'SET_NURSERY_ALERTS' || msg.type === 'SET_BACKGROUND' || msg.type === 'SET_TEXT_POSITION' || msg.type === 'SET_TEXT_HIDDEN'
            || msg.type === 'SET_OUTPUT_BLANKED' || msg.type === 'SET_FOREGROUND_CLEARED' ? msg.type : 'screen';
        if (topic === 'screen') {
          const content = msg.type === 'SHOW_LYRICS' || msg.type === 'SHOW_DESIGN' ? msg : undefined;
          completion = undefined;
          if (content?.cuePlayback?.completionId && onMediaComplete) {
            const id = content.cuePlayback.completionId;
            const tracks = completionTracks(content);
            if (tracks.size) completion = { id, tracks };
            else onMediaComplete(id, 'empty');
          }
          mediaKey = content?.media ? presentationMediaKey(content.media) : undefined;
          soundtrackKey = content?.soundtrack ? presentationMediaKey(content.soundtrack) : undefined;
          for (const key of playback.keys()) {
            if (key !== mediaKey && key !== soundtrackKey) playback.delete(key);
          }
        }
        latest.delete(topic);
        latest.set(topic, msg);
      }
      channel.postMessage(msg);
    },
    stopLiveInputs,
    stopSoundtrack,
    close() {
      stopLiveInputs();
      stopSoundtrack();
      if (latest.get('alert')?.type === 'SHOW_ALERT') channel.postMessage({ type: 'CLEAR_ALERT' } satisfies PresentationMessage);
      const nursery = latest.get('SET_NURSERY_ALERTS');
      if (nursery?.type === 'SET_NURSERY_ALERTS' && nursery.display) {
        channel.postMessage({ type: 'SET_NURSERY_ALERTS', display: null } satisfies PresentationMessage);
      }
      channel.close();
    },
  };
}

/**
 * Creates a presenter-side channel (the fullscreen display window).
 * Incoming messages are forwarded to the provided `onMessage` callback.
 */
export function createPresenterChannel(
  onMessage: (msg: PresentationMessage) => void,
  session?: string,
): {
  close: () => void;
  reportCamera: (key: string, status: string | null) => void;
  reportAlertProgress: (id: string, remaining: number, revision?: number) => void;
  reportMediaProgress: (id: string, track: string, outcome: 'ended' | 'failed') => void;
  reportSongProjectionFailure: (id: string) => void;
} {
  const channel = new BroadcastChannel(session ? `${CHANNEL_NAME}:${session}` : CHANNEL_NAME);

  channel.onmessage = (event: MessageEvent<PresentationMessage>) => {
    onMessage(event.data);
  };
  channel.postMessage({ type: 'PRESENTER_READY' });

  return {
    reportCamera(key, status) {
      channel.postMessage({ type: 'CAMERA_STATUS', key, status } satisfies CameraStatus);
    },
    reportAlertProgress(id, remaining, revision) {
      channel.postMessage({ type: 'ALERT_PROGRESS', id, remaining, revision } satisfies AlertProgressMessage);
    },
    reportMediaProgress(id, track, outcome) {
      channel.postMessage({ type: 'MEDIA_PROGRESS', id, track, outcome } satisfies MediaProgress);
    },
    reportSongProjectionFailure(id) {
      channel.postMessage({ type: 'SONG_PROJECTION_FAILURE', id } satisfies SongProjectionFailure);
    },
    close() {
      channel.onmessage = null;
      channel.close();
    },
  };
}
