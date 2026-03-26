import React, { useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, LogIn } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import Logo from '../components/Logo';
import PageAdvertisement from '@/components/advertisements/PageAdvertisement';
import { useScrollToTop } from '../hooks/useScrollToTop';

const Welcome: React.FC = () => {
  useScrollToTop();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleSearchClick = () => {
    navigate('/welcome-search');
  };

  const handleLoginClick = () => {
    navigate('/login');
  };

  const handleBackClick = () => {
    navigate('/language');
  };

  return (
    <PageContainer>   
      <div className="my-8 pb-5">
      <div className="w-full flex justify-between items-center mb-6 mt-4">
        <button
          onClick={handleBackClick}
          className="bg-imei-darker p-2 rounded-full hover:bg-imei-dark transition-colors"
        >
          <ArrowLeft size={20} className="text-imei-cyan" />
        </button>
        <Logo size="lg" className="mb-0" />
        <div className="w-8"></div>
      </div>

      {/* إضافة مكون الإعلانات */}
      <PageAdvertisement pageName="welcome" />

      {/* تعريف احترافي للتطبيق */}
      <div className="mt-8 bg-imei-darker/50 bg-opacity-80 rounded-xl p-6 border border-imei-cyan border-opacity-30 shadow-lg text-white">
        <h1 className="text-2xl md:text-3xl font-bold text-imei-cyan mb-4 flex items-center gap-2">
          <span role="img" aria-label="IMEI">🔷</span> {t('welcome_title')}
        </h1>
        <p className="mb-6 text-base md:text-lg leading-relaxed">
          {t('welcome_description')}
        </p>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-imei-cyan mb-2 flex items-center gap-2">
              <span role="img" aria-label="features">🔹</span> {t('welcome_what_is_imei')}
            </h2>
            <ul className="list-disc list-inside space-y-1 text-base">
              <li><span role="img" aria-label="search">🔍</span> {t('welcome_feature_1')}</li>
              <li><span role="img" aria-label="report">📤</span> {t('welcome_feature_2')}</li>
              <li><span role="img" aria-label="register">🧾</span> {t('welcome_feature_3')}</li>
              <li><span role="img" aria-label="login">🔐</span> {t('welcome_feature_4')}</li>
              <li><span role="img" aria-label="notification">🛰️</span> {t('welcome_feature_5')}</li>
              <li><span role="img" aria-label="ads">🗺️</span> {t('welcome_feature_6')}</li>
              <li><span role="img" aria-label="languages">🌍</span> {t('welcome_feature_7')}</li>
            </ul>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-imei-cyan mb-2 flex items-center gap-2">
              <span role="img" aria-label="why">🔸</span> {t('welcome_why_imei')}
            </h2>
            <p className="text-base">
              {t('welcome_why_imei_desc')}
            </p>
          </div>
        </div>
      </div>
      {/* نهاية التعريف الاحترافي */}

      <div className="mt-8 space-y-4">
        <button
          onClick={handleLoginClick}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-black/30 hover:shadow-xl hover:shadow-black/50"
        >
          <LogIn size={18} />
          {t('login')}
        </button>
      </div>
      </div>
    </PageContainer>
  );
};

export default Welcome;