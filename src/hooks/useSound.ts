import { useRef, useCallback, useState } from 'react';
import { preloadSounds, playSuccess, playError, setMuted, getMuted } from '../utils/sound';

/**
 * Hook to manage sound playback and mute state
 */
export function useSound() {
  const [isMuted, setIsMuted] = useState(getMuted());
  const initialized = useRef(false);

  const initSounds = useCallback(() => {
    if (!initialized.current) {
      preloadSounds();
      initialized.current = true;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const newMuted = !getMuted();
    setMuted(newMuted);
    setIsMuted(newMuted);
  }, []);

  return {
    isMuted,
    toggleMute,
    initSounds,
    playSuccess,
    playError,
  };
}
