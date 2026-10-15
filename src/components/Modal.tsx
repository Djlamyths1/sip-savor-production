
import { X } from 'lucide-react';
import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl sm:rounded-2xl bg-white shadow-2xl ${maxWidth} max-h-[calc(100dvh-1rem)] sm:max-h-[90vh]`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="min-w-0 break-words text-base font-bold text-stone-900 sm:text-lg">
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-5">

          {children}
        </div>
      </div>
    </div>
  );
}
