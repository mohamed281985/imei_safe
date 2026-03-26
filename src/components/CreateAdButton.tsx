import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

interface CreateAdButtonProps {
  className?: string;
}

export const CreateAdButton: React.FC<CreateAdButtonProps> = () => {
  const { t } = useLanguage();
  const { user } = useAuth();

  // التحقق من صلاحيات المستخدم التجاري
  if (!user || !['business', 'free_business', 'gold_business', 'silver_business'].includes(user.role)) {
    return null;
  }

  return (
    <div 
      className="fixed bottom-24 print:hidden z-50"
      style={{
        [document.dir === 'rtl' ? 'right' : 'left']: '24px',
      }}
    >
      <Link
        to="/create-advertisement"
        className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white px-8 py-3 rounded-full shadow-lg hover:shadow-xl hover:shadow-orange-500/20 transition-all duration-300 transform hover:-translate-y-0.5 flex items-center justify-center space-x-2 rtl:space-x-reverse text-sm font-medium"
      >
        <Plus className="w-5 h-5" />
        <span>{t('create_commercial_ad')}</span>
      </Link>
    </div>
  );
};
