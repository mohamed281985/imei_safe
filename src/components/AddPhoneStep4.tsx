import React from 'react';
import { Upload, X, ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react';

interface AddPhoneStep4Props {
  onSubmit: () => void;
  onBack: () => void;
}

const AddPhoneStep4: React.FC<AddPhoneStep4Props> = ({ onSubmit, onBack }) => {
  const [images, setImages] = React.useState<File[]>([]);
  const [previews, setPreviews] = React.useState<string[]>([]);
  const [description, setDescription] = React.useState('');
  const [imei, setImei] = React.useState('');
  const [imeiStatus, setImeiStatus] = React.useState<'verified' | 'reported' | ''>('');
  const [checkingImei, setCheckingImei] = React.useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + images.length > 10) {
      alert('يمكنك رفع 10 صور كحد أقصى');
      return;
    }

    setImages(prev => [...prev, ...files]);

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleImeiChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 15);
    setImei(value);

    if (value.length === 15) {
      setCheckingImei(true);
      // محاكاة التحقق من IMEI
      setTimeout(() => {
        setImeiStatus('verified');
        setCheckingImei(false);
      }, 1500);
    } else {
      setImeiStatus('');
      setCheckingImei(false);
    }
  };

  const handleSubmit = () => {
    if (images.length > 0 && imei.length === 15 && imeiStatus === 'verified') {
      onSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F9FF] to-[#DFF4FF]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0A84FF] to-[#0A84FF] px-6 pt-12 pb-6 rounded-b-[28px]">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-2">
            <button onClick={onBack} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg">
              <ArrowLeft className="w-5 h-5 text-[#FF8C00]" />
            </button>
            <h1 className="text-2xl font-bold text-white text-center flex-1">إضافة هاتف جديد</h1>
          </div>
          <p className="text-white/80 text-center text-sm">أضف تفاصيل إعلانك في خطوات بسيطة</p>
        </div>
      </div>

      {/* Progress Stepper */}
      <div className="max-w-md mx-auto px-6 -mt-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#0A84FF] flex items-center justify-center text-white text-sm font-bold">
                4
              </div>
              <h2 className="text-xl font-bold text-[#1A1A1A]">الصور والمعاينة</h2>
            </div>
            <span className="text-sm text-gray-500">4 من 4</span>
          </div>

          {/* Section Content */}
          <div className="space-y-4">
            <p className="text-gray-600 text-sm mb-4">أضف صوراً واضحة للهاتف من عدة زوايا</p>

            {/* IMEI Field */}
            <div className="relative">
              <input
                type="text"
                value={imei}
                onChange={handleImeiChange}
                inputMode="numeric"
                maxLength={15}
                className={`w-full px-4 py-3 pr-12 border-2 rounded-2xl text-gray-900 placeholder-transparent focus:ring-0 focus:outline-none transition-all ${
                  imeiStatus === 'verified' ? 'border-green-500 focus:border-green-500' : 
                  imeiStatus === 'reported' ? 'border-red-500 focus:border-red-500' : 
                  'border-gray-200 focus:border-[#0A84FF]'
                }`}
                placeholder="رقم IMEI"
                id="imei"
                dir="ltr"
              />
              <label
                htmlFor="imei"
                className="absolute right-4 top-3 text-gray-500 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-focus:top-[-10px] peer-focus:text-xs peer-focus:text-[#0A84FF] peer-focus:bg-white peer-focus:px-2 bg-white px-2"
              >
                رقم IMEI
              </label>
              {checkingImei && (
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <div className="w-5 h-5 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {imeiStatus === 'verified' && (
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <ShieldCheck className="w-5 h-5 text-green-500" />
                </div>
              )}
              {imeiStatus === 'reported' && (
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <X className="w-5 h-5 text-red-500" />
                </div>
              )}
            </div>

            {/* Description Field */}
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-2xl text-gray-900 placeholder-transparent focus:border-[#0A84FF] focus:ring-0 focus:outline-none transition-all resize-none"
                placeholder="وصف الإعلان"
                id="description"
              />
              <label
                htmlFor="description"
                className="absolute right-4 top-3 text-gray-500 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-focus:top-[-10px] peer-focus:text-xs peer-focus:text-[#0A84FF] peer-focus:bg-white peer-focus:px-2 bg-white px-2"
              >
                وصف الإعلان
              </label>
            </div>

            {/* Images Upload */}
            <div className="space-y-4">
              {previews.length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  {previews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <div className="aspect-square rounded-2xl overflow-hidden shadow-md">
                        <img
                          src={preview}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        {index === 0 && (
                          <span className="absolute bottom-2 right-2 bg-[#0A84FF] text-white text-xs px-3 py-1 rounded-full shadow-md">
                            صورة رئيسية
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-2 border-dashed border-gray-200 rounded-3xl p-8 hover:border-[#0A84FF] transition-colors bg-white">
                <div className="text-center">
                  <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mb-4">
                    <Upload className="h-8 w-8 text-[#0A84FF]" />
                  </div>
                  <div className="flex text-sm text-gray-600 justify-center mb-2">
                    <label
                      htmlFor="images"
                      className="relative cursor-pointer font-medium text-[#0A84FF] hover:text-blue-600 focus-within:outline-none"
                    >
                      <span>اختر الصور</span>
                      <input
                        id="images"
                        name="images"
                        type="file"
                        multiple
                        accept="image/*"
                        className="sr-only"
                        onChange={handleImageChange}
                      />
                    </label>
                    <span className="mr-1">أو اسحبها هنا</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    يمكنك رفع حتى 10 صور • الحد الأقصى 5MB لكل صورة
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={onBack}
                className="flex-1 px-6 py-3 border-2 border-gray-200 text-[#1A1A1A] rounded-2xl font-semibold hover:bg-gray-50 transition-all"
              >
                السابق
              </button>
              <button
                onClick={handleSubmit}
                disabled={images.length === 0 || imei.length !== 15 || imeiStatus !== 'verified'}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-[#0A84FF] to-[#005BFF] text-white rounded-2xl font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                نشر الإعلان
                <CheckCircle2 className="w-5 h-5" />
              </button>
            </div>

            {/* Bottom Indicator */}
            <div className="text-center mt-4 text-sm text-gray-500">
              4 من 4
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddPhoneStep4;
