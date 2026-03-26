import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';

const BusinessTransfer: React.FC = () => {
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState('');
  const { user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    const fetchStoreName = async () => {
      if (user) {
        const { data, error } = await supabase
          .from('businesses')
          .select('store_name')
          .eq('user_id', user.id)
          .single();
        if (data) setStoreName(data.store_name);
        if (error) console.debug('Error fetching store name:', error);
      }
    };
    fetchStoreName();
  }, [user]);

  const handleBuyClick = () => {
    navigate('/BusinessTransferbuy');
  };

  const handleSellClick = () => {
    navigate('/BusinessTransfersell');
  };

  const handlePhoneLogClick = () => {
    navigate('/transfer-history');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 glass-bg" style={{background:'rgba(255,255,255,0.18)'}}>
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/10 backdrop-blur-lg border border-white/20 shadow-xl">
        <Logo size="lg" className="mb-6" />
        <h1 className="text-2xl md:text-3xl font-bold text-black mb-8 text-center">{t('welcome_to_store')} {storeName}</h1>
        <div className="space-y-4 w-full">
        <button
          onClick={handleBuyClick}
          className="w-full bg-imei-cyan hover:bg-imei-cyan/90 text-white py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-black/30 hover:shadow-xl hover:shadow-black/50"
        >
          {t('buy')}
        </button>
        <button
          onClick={handleSellClick}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-black/30 hover:shadow-xl hover:shadow-black/50"
        >
          {t('sell')}
        </button>
        <button
          onClick={handlePhoneLogClick}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-lg shadow-black/30 hover:shadow-xl hover:shadow-black/50"
        >
          {t('phone_log')}
        </button>
      </div>
      </div>
    </div>
  );
};

export default BusinessTransfer;