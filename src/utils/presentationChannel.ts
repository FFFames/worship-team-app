/** Presentation channel — BroadcastChannel wrapper for dual-window presentation sync */

import type { VideoBackground } from '../types/database';

/** Message types sent between control and presenter windows */
export type PresentationMessageType =
  | 'SHOW_LYRICS'
  | 'SHOW_WELCOME'
  | 'SHOW_BLACK'
  | 'SET_BACKGROUND'
  | 'CLOSE';

export type PresentationMessage =
  | { type: 'SHOW_LYRICS'; lyrics: string; songTitle: string }
  | { type: 'SHOW_WELCOME' }
  | { type: 'SHOW_BLACK' }
  | { type: 'SET_BACKGROUND'; background: VideoBackground | null }
  | { type: 'CLOSE' };

const CHANNEL_NAME = 'worshipteam-presentation';

let channel: BroadcastChannel | null = null;

/** Get or create the shared BroadcastChannel */
function getChannel(): BroadcastChannel {
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

/** Send a message to the presenter window */
export function send(message: PresentationMessage): void {
  getChannel().postMessage(message);
}

/** Listen for messages from the control window */
export function onMessage(handler: (message: PresentationMessage) => void): () => void {
  const ch = getChannel();
  const listener = (event: MessageEvent<PresentationMessage>) => {
    handler(event.data);
  };
  ch.addEventListener('message', listener);
  return () => ch.removeEventListener('message', listener);
}

/** Close the channel */
export function closeChannel(): void {
  if (channel) {
    channel.close();
    channel = null;
  }
}
