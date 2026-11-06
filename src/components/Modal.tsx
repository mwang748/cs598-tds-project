import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, children, onClose, wide = false, open = true }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; open?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    if (!open) { dialog.close(); return; }
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, [open]);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}
