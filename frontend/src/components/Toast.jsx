import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, 3500);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
    info: <Info className="w-4 h-4 text-cyan-400 shrink-0" />
  };

  return (
    <div className={`toast-notification ${toast.type || 'info'}`}>
      {icons[toast.type] || icons.info}
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" onClick={onClose}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
