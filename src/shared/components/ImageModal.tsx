import { X, Download } from 'lucide-react';

interface ImageModalProps {
  url: string | null;
  onClose: () => void;
}

export function ImageModal({ url, onClose }: ImageModalProps) {
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative z-10 max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-white text-sm font-medium opacity-75">Voucher</span>
          <div className="flex items-center gap-2">
            <a href={url} download target="_blank" rel="noopener noreferrer"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors" title="Descargar">
              <Download size={16} />
            </a>
            <button onClick={onClose} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors" title="Cerrar">
              <X size={16} />
            </button>
          </div>
        </div>
        <img src={url} alt="Voucher" className="w-full rounded-xl shadow-2xl max-h-[80vh] object-contain bg-white" />
      </div>
    </div>
  );
}
