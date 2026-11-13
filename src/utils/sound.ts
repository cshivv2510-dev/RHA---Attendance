/**
 * Sound utility — plays audio feedback for scan events.
 * Uses Audio API with preloading for reliable mobile playback.
 */

let successAudio: HTMLAudioElement | null = null;
let errorAudio: HTMLAudioElement | null = null;
let isMuted = false;

/**
 * Preload audio files for instant playback
 */
export function preloadSounds(): void {
  try {
    successAudio = new Audio(`${import.meta.env.BASE_URL}sounds/success.mp3`);
    successAudio.preload = 'auto';
    successAudio.volume = 0.6;

    errorAudio = new Audio(`${import.meta.env.BASE_URL}sounds/error.mp3`);
    errorAudio.preload = 'auto';
    errorAudio.volume = 0.5;
  } catch {
    console.warn('Audio preload failed — sounds will be unavailable');
  }
}

/**
 * Play the success scan sound
 */
export function playSuccess(): void {
  if (isMuted || !successAudio) return;
  successAudio.currentTime = 0;
  successAudio.play().catch(() => {});
}

/**
 * Play the error/duplicate scan sound
 */
export function playError(): void {
  if (isMuted || !errorAudio) return;
  errorAudio.currentTime = 0;
  errorAudio.play().catch(() => {});
}

/**
 * Trigger haptic vibration if supported
 */
export function vibrate(pattern: number | number[] = 100): void {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

/**
 * Toggle sound mute
 */
export function setMuted(muted: boolean): void {
  isMuted = muted;
}

export function getMuted(): boolean {
  return isMuted;
}
