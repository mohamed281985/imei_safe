import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Camera, Upload, Image as ImageIcon, ChevronDown, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button'; // Assuming Button is needed for styling

interface ImageUploaderProps {
  label: string;
  image: string;
  setImage: (url: string) => void;
  onCameraClick: () => void;
  disabled?: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  label,
  image,
  setImage,
  onCameraClick,
  disabled,
}) => {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Add listener for clicks outside the dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    setShowOptions(false);
  };

  const handleRemoveImage = () => {
    setImage(''); // Pass empty string to indicate removal
  };

  const handleCameraClick = () => {
    onCameraClick();
    setShowOptions(false);
  };

  return (
    <div className="space-y-2">
      <label className="block text-white mb-1">{label}</label>
      <div className="relative group">
        {image ? (
          <div className="relative">
            <img
              src={image}
              alt={label}
              className="w-full h-48 object-cover rounded-lg shadow-lg"
            />
            <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center gap-2">
              <button
                onClick={handleRemoveImage}
                className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full"
                title={t('remove') || 'حذف'}
              >
                <XCircle className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowOptions(true)}
                className="bg-imei-cyan hover:bg-cyan-700 text-white p-2 rounded-full"
                title={t('change_photo') || 'تغيير الصورة'}
                disabled={disabled}
              >
                <Camera className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="border-2 border-dashed border-[#117c6f] border-opacity-70 rounded-lg p-6 text-center hover:border-opacity-100 transition-all duration-200">
            <div className="flex flex-col items-center gap-4">
              <div className="bg-imei-cyan bg-opacity-10 p-4 rounded-full">
                <ImageIcon className="w-8 h-8 text-imei-cyan" />
              </div>
              <div className="relative" ref={optionsRef}>
                <button
                  onClick={() => setShowOptions(!showOptions)}
                  className="flex items-center gap-2 bg-imei-cyan hover:bg-cyan-700 text-white py-2 px-4 rounded-xl transition-all duration-200"
                  disabled={disabled}
                >
                  <Camera className="w-5 h-5" />
                  <span>{t('add_photo') || 'إضافة صورة'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showOptions ? 'rotate-180' : ''}`} />
                </button>

                {showOptions && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-imei-darker border border-imei-cyan rounded-lg shadow-lg z-10 overflow-hidden">
                    <button
                      onClick={handleCameraClick}
                      className="flex items-center gap-2 w-full px-4 py-3 text-white hover:bg-imei-cyan transition-colors duration-200 border-b border-imei-cyan border-opacity-20"
                    >
                      <Camera className="w-4 h-4" />
                      <span>{t('take_photo') || 'التقاط صورة'}</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 w-full px-4 py-3 text-white hover:bg-imei-cyan transition-colors duration-200"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{t('choose_from_gallery') || 'اختيار من الاستديو'}</span>
                    </button>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUploader;