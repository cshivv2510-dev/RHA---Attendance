import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { SwitchCamera } from 'lucide-react';

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  isActive: boolean;
  onCameraError?: (message: string) => void;
  onCameraReady?: () => void;
}

/**
 * QR Scanner component wrapping html5-qrcode.
 * Manages camera lifecycle, rear-camera default, and flip-camera control.
 */
export function QrScanner({ onScanSuccess, isActive, onCameraError, onCameraReady }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isRunningRef = useRef(false);
  const onScanRef = useRef(onScanSuccess);
  const onErrorRef = useRef(onCameraError);
  const onReadyRef = useRef(onCameraReady);
  const camerasRef = useRef<{ id: string; label: string }[]>([]);
  const activeCameraRef = useRef<string | null>(null);
  const startGenRef = useRef(0);

  const [cameraCount, setCameraCount] = useState(0);
  const [flipping, setFlipping] = useState(false);

  onScanRef.current = onScanSuccess;
  onErrorRef.current = onCameraError;
  onReadyRef.current = onCameraReady;

  const startWith = useCallback(async (html5Qrcode: Html5Qrcode, target: string | MediaTrackConstraints) => {
    await html5Qrcode.start(
      target,
      {
        fps: 10,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
          return { width: size, height: size };
        },
        aspectRatio: 1.0,
      },
      (decodedText) => {
        onScanRef.current(decodedText);
      },
      () => {
        // Scan error — ignore (happens on every non-QR frame)
      }
    );
  }, []);

  const pickBackCamera = useCallback(async (cameras: { id: string; label: string }[]) => {
    const back = cameras.find(
      c => /back|rear|environment/i.test(c.label)
    );
    return back?.id || cameras[cameras.length - 1]?.id || null;
  }, []);

  const startScanner = useCallback(async () => {
    const elementId = 'qr-reader';
    const gen = ++startGenRef.current;

    try {
      const html5Qrcode = new Html5Qrcode(elementId, { verbose: false });
      scannerRef.current = html5Qrcode;

      // Prefer the rear camera via facingMode, fall back to enumerated cameras.
      try {
        await startWith(html5Qrcode, { facingMode: 'environment' });
        activeCameraRef.current = 'environment';
      } catch {
        const cameras = await Html5Qrcode.getCameras();
        if (gen !== startGenRef.current) return;
        camerasRef.current = cameras || [];
        setCameraCount(camerasRef.current.length);
        if (!cameras || cameras.length === 0) {
          onErrorRef.current?.('No camera found on this device.');
          return;
        }
        const backId = await pickBackCamera(camerasRef.current);
        if (!backId) {
          onErrorRef.current?.('No camera found on this device.');
          return;
        }
        await startWith(html5Qrcode, backId);
        activeCameraRef.current = backId;
      }

      if (gen !== startGenRef.current) return;
      isRunningRef.current = true;
      onReadyRef.current?.();
    } catch (err) {
      if (gen !== startGenRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      const denied = /permission|notallowed|denied|not allowed/i.test(msg);
      onErrorRef.current?.(
        denied
          ? 'Camera permission was denied. Allow camera access in your browser settings.'
          : `Camera failed to start: ${msg}`
      );
    }
  }, [startWith, pickBackCamera]);

  const stopScanner = useCallback(async () => {
    startGenRef.current++;
    const scanner = scannerRef.current;
    isRunningRef.current = false;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
        scanner.clear();
      } catch {
        try { scanner.clear(); } catch { /* ignore */ }
      }
    }
  }, []);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;
    let mounted = true;
    (async () => {
      await startScanner();
      if (!mounted) await stopScanner();
    })();
    return () => {
      mounted = false;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const flipCamera = useCallback(async () => {
    const cameras = camerasRef.current;
    if (cameras.length < 2 || flipping) return;
    setFlipping(true);
    try {
      // Enumerate fresh list in case labels weren't available at start
      let list = cameras;
      if (list.length === 0) {
        list = (await Html5Qrcode.getCameras()) || [];
        camerasRef.current = list;
        setCameraCount(list.length);
      }
      if (list.length < 2) return;
      const currentIdx = list.findIndex(c => c.id === activeCameraRef.current);
      const next = list[(currentIdx + 1) % list.length];
      await stopScanner();
      const html5Qrcode = new Html5Qrcode('qr-reader', { verbose: false });
      scannerRef.current = html5Qrcode;
      await startWith(html5Qrcode, next.id);
      activeCameraRef.current = next.id;
      isRunningRef.current = true;
    } catch (err) {
      console.error('Camera flip failed:', err);
      onErrorRef.current?.('Could not switch camera.');
      await startScanner();
    } finally {
      setFlipping(false);
    }
  }, [flipping, startScanner, startWith, stopScanner]);

  return (
    <div className="relative w-full">
      {/* Scanner viewport — square, rounded */}
      <div
        className="relative overflow-hidden rounded-2xl bg-black w-full"
        style={{ aspectRatio: '1 / 1' }}
      >
        <div id="qr-reader" ref={containerRef} className="w-full h-full" />

        {/* Flip camera button */}
        {cameraCount > 1 && isActive && (
          <button
            onClick={flipCamera}
            className="absolute top-3 right-3 w-11 h-11 rounded-full flex items-center justify-center z-10"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff' }}
            aria-label="Flip camera"
          >
            <SwitchCamera size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
