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
    <PageContainer clearBackground>
      <div className="min-h-screen bg-transparent px-3 pb-8 pt-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between mb-5">
        <button
          onClick={handleBackClick}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-imei-cyan/30 bg-white text-imei-cyan shadow-sm hover:bg-imei-cyan/10 transition-colors"
        >
          <ArrowLeft size={20} className="text-imei-cyan" />
        </button>
        <Logo size="lg" className="mb-0" />
        <div className="w-8"></div>
      </div>

      {/* إضافة مكون الإعلانات */}
      <PageAdvertisement pageName="welcome" />

      {/* تعريف احترافي للتطبيق */}
      <div className="mx-auto mt-5 w-full max-w-lg rounded-[24px] border border-[#8bcbd8] bg-white/75 p-5 text-slate-900 shadow-[0_10px_30px_rgba(24,125,156,0.18)] backdrop-blur-sm sm:p-6">
        <h1 className="mb-4 text-2xl font-extrabold leading-tight text-[#159bb0] md:text-3xl">
          <span className="text-[#ff7700]">◆</span> {t('welcome_title')}
        </h1>
        <p className="mb-6 text-base leading-7 text-slate-800 md:text-lg">
          {t('welcome_description')}
        </p>
        <div className="space-y-4">
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-[#159bb0]">
              <span className="text-[#ff7700]">•</span> {t('welcome_what_is_imei')}
            </h2>
            <ul className="list-inside list-disc space-y-2 text-base leading-6 text-slate-900">
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
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-[#159bb0]">
              <span className="text-[#ff7700]">•</span> {t('welcome_why_imei')}
            </h2>
            <p className="text-base leading-6 text-slate-900">
              {t('welcome_why_imei_desc')}
            </p>
          </div>
        </div>
      </div>
      {/* نهاية التعريف الاحترافي */}

      <div className="mx-auto mt-6 w-full max-w-lg space-y-4">
        <button
          onClick={handleLoginClick}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff7700] px-4 py-4 text-lg font-bold text-white shadow-[0_8px_18px_rgba(255,119,0,0.35)] transition-all duration-300 hover:bg-[#e86a00]"
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