import React from 'react';
import { Smartphone, Type, Tag, ArrowLeft } from 'lucide-react';

interface AddPhoneStep2Props {
  onNext: () => void;
  onBack: () => void;
}

const AddPhoneStep2: React.FC<AddPhoneStep2Props> = ({ onNext, onBack }) => {
  const [brand, setBrand] = React.useState('');
  const [model, setModel] = React.useState('');
  const [phoneType, setPhoneType] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [condition, setCondition] = React.useState<'new' | 'used' | 'refurbished'>('new');

  const handleNext = () => {
    if (brand && model && price) {
      onNext();
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
                2
              </div>
              <h2 className="text-xl font-bold text-[#1A1A1A]">معلومات الهاتف</h2>
            </div>
            <span className="text-sm text-gray-500">2 من 4</span>
          </div>

          {/* Section Content */}
          <div className="space-y-4">
            <p className="text-gray-600 text-sm mb-4">أدخل تفاصيل الهاتف الذي تريد بيعه</p>

            {/* Brand Field */}
            <div className="relative">
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-2xl text-gray-900 placeholder-transparent focus:border-[#0A84FF] focus:ring-0 focus:outline-none transition-all"
                placeholder="العلامة التجارية"
                id="brand"
              />
              <label
                htmlFor="brand"
                className="absolute right-4 top-3 text-gray-500 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-focus:top-[-10px] peer-focus:text-xs peer-focus:text-[#0A84FF] peer-focus:bg-white peer-focus:px-2 bg-white px-2"
              >
                العلامة التجارية
              </label>
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Type className="w-5 h-5 text-[#0A84FF]" />
              </div>
            </div>

            {/* Model Field */}
            <div className="relative">
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-2xl text-gray-900 placeholder-transparent focus:border-[#0A84FF] focus:ring-0 focus:outline-none transition-all"
                placeholder="الموديل"
                id="model"
              />
              <label
                htmlFor="model"
                className="absolute right-4 top-3 text-gray-500 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-focus:top-[-10px] peer-focus:text-xs peer-focus:text-[#0A84FF] peer-focus:bg-white peer-focus:px-2 bg-white px-2"
              >
                الموديل
              </label>
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Smartphone className="w-5 h-5 text-[#0A84FF]" />
              </div>
            </div>

            {/* Phone Type Field */}
            <div className="relative">
              <input
                type="text"
                value={phoneType}
                onChange={(e) => setPhoneType(e.target.value)}
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-2xl text-gray-900 placeholder-transparent focus:border-[#0A84FF] focus:ring-0 focus:outline-none transition-all"
                placeholder="نوع الهاتف"
                id="phone_type"
              />
              <label
                htmlFor="phone_type"
                className="absolute right-4 top-3 text-gray-500 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-focus:top-[-10px] peer-focus:text-xs peer-focus:text-[#0A84FF] peer-focus:bg-white peer-focus:px-2 bg-white px-2"
              >
                نوع الهاتف
              </label>
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Tag className="w-5 h-5 text-[#0A84FF]" />
              </div>
            </div>

            {/* Price Field */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <span className="text-gray-500 text-sm">ج.م</span>
              </div>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-4 py-3 pl-12 border-2 border-gray-200 rounded-2xl text-gray-900 placeholder-transparent focus:border-[#0A84FF] focus:ring-0 focus:outline-none transition-all"
                placeholder="السعر"
                id="price"
              />
              <label
                htmlFor="price"
                className="absolute right-4 top-3 text-gray-500 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-focus:top-[-10px] peer-focus:text-xs peer-focus:text-[#0A84FF] peer-focus:bg-white peer-focus:px-2 bg-white px-2"
              >
                السعر
              </label>
            </div>

            {/* Condition Selector */}
            <div className="relative">
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as any)}
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-2xl text-gray-900 focus:border-[#0A84FF] focus:ring-0 focus:outline-none transition-all appearance-none bg-white"
                id="condition"
              >
                <option value="new">جديد</option>
                <option value="used">مستعمل</option>
                <option value="refurbished">مجدد</option>
              </select>
              <label
                htmlFor="condition"
                className="absolute right-4 top-3 text-gray-500 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-focus:top-[-10px] peer-focus:text-xs peer-focus:text-[#0A84FF] peer-focus:bg-white peer-focus:px-2 bg-white px-2"
              >
                الحالة
              </label>
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
                onClick={handleNext}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-[#0A84FF] to-[#005BFF] text-white rounded-2xl font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                التالي
                <ArrowLeft className="w-5 h-5 rotate-180" />
              </button>
            </div>

            {/* Bottom Indicator */}
            <div className="text-center mt-4 text-sm text-gray-500">
              2 من 4
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddPhoneStep2;
