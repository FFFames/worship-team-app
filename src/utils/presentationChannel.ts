/** BroadcastChannel communication for dual-window presentation sync.
 *  Control window sends commands; Presenter window receives and renders. */

export type PresentationMessage =
  | { type: 'SHOW_LYRICS'; lyrics: string; background?: string }
  | { type: 'SHOW_WELCOME'; background?: string }
  | { type: 'SHOW_BLACK' }
  | { type: 'SET_BACKGROUND'; url: string }
  | { type: 'CLOSE' };

const CHANNEL_NAME = 'worshipteam-presentation';

/**
 * Creates a control-side channel (the window that drives the presentation).
 * Use `send()` to dispatch messages to the presenter window.
 */
export function createControlChannel(): {
  send: (msg: PresentationMessage) => void;
  close: () => void;
} {
  const channel = new BroadcastChannel(CHANNEL_NAME);

  return {
    send(msg: PresentationMessage) {
      channel.postMessage(msg);
    },
    close() {
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
): { close: () => void } {
  const channel = new BroadcastChannel(CHANNEL_NAME);

  channel.onmessage = (event: MessageEvent<PresentationMessage>) => {
    onMessage(event.data);
  };

  return {
    close() {
      channel.onmessage = null;
      channel.close();
    },
  };
}
