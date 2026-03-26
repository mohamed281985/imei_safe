
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react'; // استيراد أيقونة السهم

type BackButtonProps = {
  to?: string; // جعل الخاصية اختيارية للسماح بالرجوع الافتراضي
  className?: string;
};

const BackButton: React.FC<BackButtonProps> = ({ to, className }) => {
  const navigate = useNavigate();

  const handleBackClick = () => {
    if (to) {
      navigate(to);
    } else {
      navigate(-1); // الرجوع خطوة واحدة في التاريخ إذا لم يتم تحديد مسار
    }
  };

  return (
    <button
      onClick={handleBackClick}
      // تعديل: إضافة فئات w-10 و h-10 و flex للتوسيط لجعله دائريًا بشكل واضح
      className={`bg-orange-500 p-2 rounded-full hover:bg-orange-600 transition-colors w-10 h-10 flex items-center justify-center ${className}`}
    >
      <ArrowLeft size={24} className="text-white" /> {/* إضافة أيقونة السهم هنا */}
    </button>
  );
};

export default BackButton;
