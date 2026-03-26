import React, { useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

interface ImageViewerProps {
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ imageUrl, isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let listener: PluginListenerHandle;

    const addListener = async () => {
      // Register a listener for the hardware back button
      listener = await CapacitorApp.addListener('backButton', () => {
        // When the back button is pressed, just close the modal.
        onClose();
      });
    };

    addListener();

    return () => {
      // Clean up the listener when the component unmounts or is no longer open
      if (listener) {
        listener.remove();
      }
    };
  }, [isOpen, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black/90 border-none w-screen h-screen max-w-full max-h-full rounded-none top-0 left-0 translate-x-0 translate-y-0 p-0 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-white hover:text-gray-300 z-50"
        >
          <X size={24} />
        </button>
        <div className="w-full h-full flex items-center justify-center">
          <img
            src={imageUrl}
            alt="صورة مكبرة"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageViewer;
