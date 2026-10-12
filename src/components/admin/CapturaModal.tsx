import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface CapturaModalProps {
  onClose: () => void;
}

/** Muestra un QR para abrir la carga de fotos desde el celular (F-404). */
export function CapturaModal({ onClose }: CapturaModalProps) {
  const [qr, setQr] = useState<string | null>(null);
  const url = `${window.location.origin}${window.location.pathname}?captura=1`;

  useEffect(() => {
    void QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setQr);
  }, [url]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="card max-h-[92vh] w-full max-w-lg overflow-y-auto p-6 text-center" role="dialog" aria-modal="true">
        <h2 className="title mb-2 text-3xl">Fotos desde el celular</h2>
        <p className="mb-4 text-lg text-slate-600">
          Escanea este código con el celular de la tienda para tomar fotos y dar de alta productos
          rápidamente. Ambos dispositivos deben estar en la misma red.
        </p>
        {qr ? (
          <img src={qr} alt="Código QR" className="mx-auto mb-4 h-72 w-72 rounded-2xl border-4 border-slate-200" />
        ) : (
          <p className="mb-4 text-lg text-slate-500">Generando código…</p>
        )}
        <p className="mb-4 break-all rounded-xl bg-slate-100 p-3 text-base text-slate-700">{url}</p>
        <button type="button" onClick={onClose} className="btn btn-neutral w-full py-4 text-xl">
          Cerrar
        </button>
      </div>
    </div>
  );
}
