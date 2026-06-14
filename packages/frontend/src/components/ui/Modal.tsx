import React, { useEffect } from 'react';

interface ModalProps {
  open?:      boolean;   // optional — wenn weggelassen: immer sichtbar (konditionelles Rendering)
  onClose:    () => void;
  title?:     string;
  children:   React.ReactNode;
  size?:      'sm' | 'md' | 'lg' | 'xl' | '2xl';
  closeOnBackdrop?: boolean;
}

const sizeClasses = {
  sm:  'max-w-sm',
  md:  'max-w-md',
  lg:  'max-w-lg',
  xl:  'max-w-xl',
  '2xl': 'max-w-2xl',
};

export function Modal({
  open = true,
  onClose,
  title,
  children,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps) {
  // ESC-Taste schließt Modal
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Body-Scroll sperren wenn Modal offen
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else      document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      {/* Panel */}
      <div
        className={[
          'relative w-full bg-white rounded-2xl shadow-lift animate-scaleIn flex flex-col max-h-[90vh]',
          sizeClasses[size],
        ].join(' ')}
      >
        {title && (
          <div className="flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Schließen"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// Bestätigungs-Dialog
export function ConfirmModal({
  open,
  onClose,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = 'Bestätigen',
  danger,
  variant,
  loading      = false,
}: {
  open?:         boolean;
  onClose?:      () => void;
  onCancel?:     () => void;
  onConfirm:     () => void;
  title:         string;
  message:       string;
  confirmLabel?: string;
  danger?:       boolean;
  variant?:      'primary' | 'danger';
  loading?:      boolean;
}) {
  const handleClose = onCancel ?? onClose ?? (() => {});
  const isDanger    = danger || variant === 'danger';

  return (
    <Modal open={open} onClose={handleClose} title={title} size="sm">
      <p className="text-sm text-gray-600 mb-5">{message}</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={handleClose}
          className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          Abbrechen
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={[
            'px-4 py-2 text-sm rounded-lg text-white font-medium transition-colors',
            isDanger ? 'bg-malus-600 hover:bg-malus-700' : 'bg-info-600 hover:bg-info-700',
            loading ? 'opacity-50 cursor-not-allowed' : '',
          ].join(' ')}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Bitte warten…
            </span>
          ) : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
