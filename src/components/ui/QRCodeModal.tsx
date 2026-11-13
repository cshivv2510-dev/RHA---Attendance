import { useEffect, useState } from 'react';
import type { Student } from '../../types';
import { generateQrCardDataUrl, downloadQrPng } from '../../utils/qr';
import { Button } from './Button';
import { BottomSheet } from './BottomSheet';
import { Spinner } from './Spinner';
import { Share2 } from 'lucide-react';
import { showToast } from './Toast';

interface QRCodeModalProps {
  student: Student | null;
  onClose: () => void;
}

/**
 * Bottom sheet showing a student's printable ID card (QR + name + ID).
 * The QR encodes the plain student ID — point the scanner at it.
 */
export function QRCodeModal({ student, onClose }: QRCodeModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!student) {
      setDataUrl(null);
      setError(false);
      return;
    }
    let cancelled = false;
    generateQrCardDataUrl(student)
      .then(url => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [student]);

  if (!student) return null;

  const handleShare = async () => {
    if (!dataUrl) return;
    const filename = `${student.id}-id-card.png`;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${student.name} — ID card` });
        return;
      }
    } catch {
      // fall through to download
    }
    downloadQrPng(dataUrl, filename);
    showToast('info', 'Sharing not supported — downloaded instead');
  };

  return (
    <BottomSheet open onClose={onClose} title={student.name}>
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm font-mono -mt-1" style={{ color: 'var(--text-secondary)' }}>
          {student.id}{student.class ? ` · Class ${student.class}` : ''}
        </p>

        <div
          className="w-56 rounded-2xl overflow-hidden flex items-center justify-center"
          style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-primary)', aspectRatio: '640 / 880' }}
        >
          {dataUrl ? (
            <img src={dataUrl} alt={`ID card for ${student.id}`} className="w-full h-full object-contain" />
          ) : error ? (
            <p className="text-sm p-4 text-center" style={{ color: '#dc2626' }}>Failed to generate QR</p>
          ) : (
            <Spinner size={32} />
          )}
        </div>

        <div className="flex gap-2 w-full">
          <Button
            variant="secondary"
            className="flex-1"
            icon={<Share2 size={18} />}
            disabled={!dataUrl}
            onClick={handleShare}
          >
            Share
          </Button>
          <Button
            className="flex-1"
            disabled={!dataUrl}
            onClick={() => dataUrl && downloadQrPng(dataUrl, `${student.id}-id-card.png`)}
          >
            Download
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
