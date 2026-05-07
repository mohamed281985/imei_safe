import React from 'react';
import { MapPin, Phone, Store, Building2, ArrowLeft } from 'lucide-react';

interface AddPhoneStep1Props {
  onNext: () => void;
  onSave: () => void;
}

const AddPhoneStep1: React.FC<AddPhoneStep1Props> = ({ onNext, onSave }) => {
  const [storeName, setStoreName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [city, setCity] = React.useState('');
  const [address, setAddress] = React.useState('');

  const handleNext = () => {
    if (storeName && phone && city) {
      onNext();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F9FF] to-[#DFF4FF]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0A84FF] to-[#0A84FF] px-6 pt-12 pb-6 rounded-b-[28px]">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-2">
            <button className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg">
              <ArrowLeft className="w-5 h-5 text-[#FF8C00]" />
            </button>
            <h1 className="text-2xl font-bold text-white text-center flex-1">إضافة هاتف جديد</h1>
          </div>
          <p className="text-white/80 text-center text-sm">أضف تفاصيل إعلانك في خطوات بسيطة</p>
        </div>

      {/* Progress Stepper */}
      <div className="max-w-md mx-auto px-6 -mt-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#0A84FF] flex items-center justify-center text-white text-sm font-bold">
                1
              </div>
              <h2 className="text-xl font-bold text-[#1A1A1A]">المعلومات الأساسية</h2>
            </div>
            <span className="text-sm text-gray-500">1 من 4</span>
          </div>

          {/* Section Content */}
          <div className="space-y-4">
            <p className="text-gray-600 text-sm mb-4">أدخل بيانات متجرك ومعلومات التواصل والموقع</p>

            {/* Store Name Field */}
            <div className="relative">
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-2xl text-gray-900 placeholder-transparent focus:border-[#0A84FF] focus:ring-0 focus:outline-none transition-all"
                placeholder="اسم المتجر"
                id="store_name"
              />
              <label
                htmlFor="store_name"
                className="absolute right-4 top-3 text-gray-500 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-focus:top-[-10px] peer-focus:text-xs peer-focus:text-[#0A84FF] peer-focus:bg-white peer-focus:px-2 bg-white px-2"
              >
                اسم المتجر
              </label>
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Store className="w-5 h-5 text-[#0A84FF]" />
              </div>
            </div>

            {/* Phone Field */}
            <div className="relative">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-2xl text-gray-900 placeholder-transparent focus:border-[#0A84FF] focus:ring-0 focus:outline-none transition-all"
                placeholder="رقم الهاتف"
                id="phone"
                dir="ltr"
              />
              <label
                htmlFor="phone"
                className="absolute right-4 top-3 text-gray-500 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-focus:top-[-10px] peer-focus:text-xs peer-focus:text-[#0A84FF] peer-focus:bg-white peer-focus:px-2 bg-white px-2"
              >
                رقم الهاتف
              </label>
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Phone className="w-5 h-5 text-[#0A84FF]" />
              </div>
            </div>

            {/* City Field */}
            <div className="relative">
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-2xl text-gray-900 placeholder-transparent focus:border-[#0A84FF] focus:ring-0 focus:outline-none transition-all"
                placeholder="المدينة"
                id="city"
              />
              <label
                htmlFor="city"
                className="absolute right-4 top-3 text-gray-500 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-focus:top-[-10px] peer-focus:text-xs peer-focus:text-[#0A84FF] peer-focus:bg-white peer-focus:px-2 bg-white px-2"
              >
                المدينة
              </label>
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Building2 className="w-5 h-5 text-[#0A84FF]" />
              </div>
            </div>

            {/* Map Section */}
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-6 border-2 border-dashed border-gray-200">
              <div className="flex flex-col items-center justify-center min-h-[200px]">
                <MapPin className="w-16 h-16 text-[#0A84FF] mb-4" />
                <p className="text-gray-500 text-sm mb-4">اختر موقع متجرك على الخريطة</p>
                <button className="px-6 py-3 bg-[#0A84FF] text-white rounded-2xl font-bold text-sm hover:bg-[#005BFF] transition-all">
                  اختر الموقع على الخريطة
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Buttons */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={onSave}
              className="flex-1 px-6 py-3 border-2 border-gray-200 text-[#1A1A1A] rounded-2xl font-semibold hover:bg-gray-50 transition-all"
            >
              حفظ ومتابعة لاحقاً
            </button>
            <button
              onClick={handleNext}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-[#0A84FF] to-[#005BFF] text-white rounded-2xl font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              التالي
              <ArrowLeft className="w-5 h-5 rotate-180" />
            </button>
          </div>

          {/* Bottom Indicator */}
          <div className="text-center mt-4 text-sm text-gray-500">
            1 من 4
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddPhoneStep1;
