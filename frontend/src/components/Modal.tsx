import { type ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export const Modal = ({ isOpen, onClose, title, children }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity bg-black/60 backdrop-blur-sm">
      {/* Modal Container */}
      <div className="w-full max-w-md overflow-hidden transition-all transform scale-100 bg-white shadow-2xl rounded-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600">
          <h3 className="text-lg font-bold tracking-wide text-white">{title}</h3>
          <button 
            onClick={onClose} 
            className="text-2xl font-light leading-none transition text-white/80 hover:text-white"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="p-6 leading-relaxed text-gray-700">
          {children}
        </div>

        {/* Footer (Optional close button) */}
        <div className="flex justify-end px-6 py-3 bg-gray-50">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-800 transition bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};