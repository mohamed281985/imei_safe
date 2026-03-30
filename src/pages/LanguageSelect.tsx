import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Globe } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const LanguageSelect: React.FC = () => {
  const { t, changeLanguage } = useLanguage();
  const navigate = useNavigate();
  const [showWarning, setShowWarning] = useState(false);
  const [selectedLang, setSelectedLang] = useState<string>('');

  const handleLanguageSelect = async (lang: 'en' | 'ar' | 'fr' | 'hi') => {
    setSelectedLang(lang);
    changeLanguage(lang);
    setShowWarning(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (userId) {
        await supabase
          .from('users')
          .update({ language: lang.toUpperCase() })
          .eq('id', userId);
      }
    } catch (e) {
      console.error('Failed to update user language:', e);
    }
  };

  const getWarningMessage = (lang: string) => {
    switch (lang) {
      case 'ar':
        return {
          title: "تحذير أمني",
          message: "لا تدفع أي أموال أو تُحوِّل أي أموال عند التواصل معك، ولا تُشارك بياناتك المصرفية مع أي شخص. لم يتصل بك تطبيق IMEI لطلب أي أموال، ولسنا مسؤولين عن أي تحويلات خارج التطبيق. شكرًا لتفهمك - IMEI Safe"
        };
      case 'en':
        return {
          title: "Security Warning",
          message: "Do not pay or transfer any money when contacted, and do not share your banking information with anyone. IMEI app has not contacted you to request any money, and we are not responsible for any transfers outside the app. Thank you for your understanding - IMEI Safe"
        };
      case 'fr':
        return {
          title: "Avertissement de Sécurité",
          message: "Ne payez ni ne transférez d'argent lorsque vous êtes contacté, et ne partagez pas vos informations bancaires avec qui que ce soit. L'application IMEI ne vous a pas contacté pour demander de l'argent, et nous ne sommes pas responsables des transferts en dehors de l'application. Merci de votre compréhension - IMEI Safe"
        };
      case 'hi':
        return {
          title: "सुरक्षा चेतावनी",
          message: "संपर्क किए जाने पर कोई पैसा न दें या स्थानांतरित न करें, और किसी के साथ अपनी बैंकिंग जानकारी साझा न करें। IMEI ऐप ने आपसे पैसे की मांग के लिए संपर्क नहीं किया है, और हम ऐप के बाहर किसी भी स्थानांतरण के लिए जिम्मेदार नहीं हैं। आपकी समझ के लिए धन्यवाद - IMEI Safe"
        };
      default:
        return {
          title: "Security Warning",
          message: "Do not pay or transfer any money when contacted, and do not share your banking information with anyone. IMEI app has not contacted you to request any money, and we are not responsible for any transfers outside the app. Thank you for your understanding - IMEI Safe"
        };
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 glass-bg">
      <div className="max-w-2xl w-full bg-imei-darker/40 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-imei-cyan/20">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-imei-cyan/10 rounded-full flex items-center justify-center mb-4">
            <Globe className="w-20 h-20 text-imei-cyan" />
          </div>
          <h1 className="text-white text-3xl font-bold text-center mb-2">{t('select_language')}</h1>
          <p className="text-white font-semibold text-center">Choose your preferred language</p>
        </div>
         
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleLanguageSelect('en')}
            className="group bg-imei-darker p-6 rounded-xl text-white hover:bg-imei-cyan/10 transition-all duration-300 border border-imei-cyan/20 hover:border-imei-cyan/40"
          >
            <div className="flex flex-col items-center">
              <span className="text-lg font-medium">English</span>
              <span className="text-sm text-gray-400 group-hover:text-imei-cyan transition-colors">English</span>
            </div>
          </button>
          
          <button
            onClick={() => handleLanguageSelect('ar')}
            className="group bg-imei-darker p-6 rounded-xl text-white hover:bg-imei-cyan/10 transition-all duration-300 border border-imei-cyan/20 hover:border-imei-cyan/40"
          >
            <div className="flex flex-col items-center">
              <span className="text-lg font-medium">العربية</span>
              <span className="text-sm text-gray-400 group-hover:text-imei-cyan transition-colors">Arabic</span>
            </div>
          </button>
          
          <button
            onClick={() => handleLanguageSelect('fr')}
            className="group bg-imei-darker p-6 rounded-xl text-white hover:bg-imei-cyan/10 transition-all duration-300 border border-imei-cyan/20 hover:border-imei-cyan/40"
          >
            <div className="flex flex-col items-center">
              <span className="text-lg font-medium">Français</span>
              <span className="text-sm text-gray-400 group-hover:text-imei-cyan transition-colors">French</span>
            </div>
          </button>
          
          <button
            onClick={() => handleLanguageSelect('hi')}
            className="group bg-imei-darker p-6 rounded-xl text-white hover:bg-imei-cyan/10 transition-all duration-300 border border-imei-cyan/20 hover:border-imei-cyan/40"
          >
            <div className="flex flex-col items-center">
              <span className="text-lg font-medium">हिन्दी</span>
              <span className="text-sm text-gray-400 group-hover:text-imei-cyan transition-colors">Hindi</span>
            </div>
          </button>
        </div>
      </div>

      {/* Security Warning Dialog */}
      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent className="bg-imei-darker border border-imei-cyan/30">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="text-yellow-500" />
              {getWarningMessage(selectedLang).title}
            </DialogTitle>
            <DialogDescription className="text-gray-400 mt-4 text-right" dir={selectedLang === 'ar' ? 'rtl' : 'ltr'}>
              {getWarningMessage(selectedLang).message}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Button
              onClick={() => {
                setShowWarning(false);
                navigate('/welcome');
              }}
              className="w-full bg-imei-cyan hover:bg-imei-cyan/90 text-white"
            >
              {t('i_understand')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LanguageSelect;
