import { useId } from 'react';
import type { ReactNode } from 'react';
import { useModalA11y } from '../lib/useModalA11y';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmación solo para acciones destructivas (Sección 7). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Sí, continuar',
  cancelLabel = 'No',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const panelRef = useModalA11y(onCancel, open);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="card w-full max-w-xl p-6"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
      >
        <h2 id={titleId} className="title mb-2 text-slate-900">
          {title}
        </h2>
        {message && (
          <div id={messageId} className="mb-6 text-lg text-slate-700">
            {message}
          </div>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="btn btn-neutral flex-1 py-4 text-xl">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="btn btn-danger flex-1 py-4 text-xl">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
