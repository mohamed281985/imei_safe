import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Globe } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type SalePurchaseNotice = {
  title: string;
  introduction: string;
  precautions: string[];
};

type WarningMessage = {
  title: string;
  message: string;
  salePurchaseNotice: SalePurchaseNotice;
};

const LanguageSelect: React.FC = () => {
  const { t, changeLanguage } = useLanguage();
  const navigate = useNavigate();
  const [showWarning, setShowWarning] = useState(false);
  const [selectedLang, setSelectedLang] = useState<string>('');

  // جلب البلد تلقائياً للمستخدم وتحديث قاعدة البيانات
  useEffect(() => {
    const autoDetectCountry = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;

        if (userId) {
          // طلب بيانات الموقع الجغرافي بناءً على الـ IP
          const response = await fetch('https://ipapi.co/json/');
          const geo = await response.json();

          if (geo && geo.country_name) {
            // تحديث عمود countries في جدول users بالدولة المكتشفة
            await supabase
              .from('users')
              .update({ countries: geo.country_name })
              .eq('id', userId);
          }
        }
      } catch (err) {
        console.error('Auto-detection country error:', err);
      }
    };

    autoDetectCountry();
  }, []);

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

  const getWarningMessage = (lang: string): WarningMessage => {
    switch (lang) {
      case 'ar':
        return {
          title: "تحذير أمني",
          message: "لا تدفع أي أموال أو تُحوِّل أي أموال عند التواصل معك، ولا تُشارك بياناتك المصرفية مع أي شخص. لم يتصل بك تطبيق IMEI لطلب أي أموال، ولسنا مسؤولين عن أي تحويلات خارج التطبيق. شكرًا لتفهمك - IMEI Safe",
          salePurchaseNotice: {
            title: "تنبيه مهم عند بيع أو شراء هاتف",
            introduction: "احرص على اتخاذ الاحتياطات اللازمة قبل إتمام البيع أو الشراء:",
            precautions: [
              "اطلب علبة الهاتف الأصلية، وقارن رقم IMEI الموجود عليها بالرقم الظاهر في الجهاز.",
              "اطلب الاطلاع على مستند الشراء أو الفاتورة إن وُجدت.",
              "تحقّق من هوية البائع بطريقة مناسبة.",
              "احتفظ بإثبات عملية البيع أو الشراء، مثل إيصال يتضمن بيانات الجهاز وتاريخ المعاملة وتوقيع الطرفين، عند الاقتضاء.",
              "إذا ظهرت أي علامات اشتباه، فلا تُتم الصفقة قبل التحقق من مصدر الهاتف وملكيته."
            ]
          }
        };
      case 'en':
        return {
          title: "Security Warning",
          message: "Do not pay or transfer any money when contacted, and do not share your banking information with anyone. IMEI app has not contacted you to request any money, and we are not responsible for any transfers outside the app. Thank you for your understanding - IMEI Safe",
          salePurchaseNotice: {
            title: "Important when buying or selling a phone",
            introduction: "Take these precautions before completing a sale or purchase:",
            precautions: [
              "Ask for the original phone box and compare the IMEI printed on it with the IMEI shown on the device.",
              "Ask to see proof of purchase or an invoice, if available.",
              "Verify the seller's identity in an appropriate way.",
              "Keep proof of the transaction, such as a receipt recording the device details, transaction date, and both parties' signatures where appropriate.",
              "If anything seems suspicious, do not complete the transaction until you have checked the phone's source and ownership."
            ]
          }
        };
      case 'fr':
        return {
          title: "Avertissement de Sécurité",
          message: "Ne payez ni ne transférez d'argent lorsque vous êtes contacté, et ne partagez pas vos informations bancaires avec qui que ce soit. L'application IMEI ne vous a pas contacté pour demander de l'argent, et nous ne sommes pas responsables des transferts en dehors de l'application. Merci de votre compréhension - IMEI Safe",
          salePurchaseNotice: {
            title: "Important lors de l'achat ou de la vente d'un téléphone",
            introduction: "Prenez ces précautions avant de conclure la vente ou l'achat :",
            precautions: [
              "Demandez la boîte d'origine et comparez l'IMEI qui y figure avec celui affiché sur l'appareil.",
              "Demandez à consulter une preuve d'achat ou une facture, si disponible.",
              "Vérifiez l'identité du vendeur de manière appropriée.",
              "Conservez une preuve de la transaction, par exemple un reçu indiquant les détails de l'appareil, la date et les signatures des deux parties, le cas échéant.",
              "En cas de doute, ne concluez pas la transaction avant d'avoir vérifié la provenance du téléphone et sa propriété."
            ]
          }
        };
      case 'hi':
        return {
          title: "सुरक्षा चेतावनी",
          message: "संपर्क किए जाने पर कोई पैसा न दें या स्थानांतरित न करें, और किसी के साथ अपनी बैंकिंग जानकारी साझा न करें। IMEI ऐप ने आपसे पैसे की मांग के लिए संपर्क नहीं किया है, और हम ऐप के बाहर किसी भी स्थानांतरण के लिए जिम्मेदार नहीं हैं। आपकी समझ के लिए धन्यवाद - IMEI Safe",
          salePurchaseNotice: {
            title: "फोन खरीदते या बेचते समय महत्वपूर्ण सूचना",
            introduction: "खरीद या बिक्री पूरी करने से पहले ये सावधानियां बरतें:",
            precautions: [
              "फोन का मूल डिब्बा मांगें और उस पर छपे IMEI की तुलना डिवाइस पर दिख रहे IMEI से करें।",
              "यदि उपलब्ध हो, तो खरीद का प्रमाण या बिल देखने के लिए कहें।",
              "उचित तरीके से विक्रेता की पहचान सत्यापित करें।",
              "लेन-देन का प्रमाण रखें, जैसे ऐसी रसीद जिसमें डिवाइस का विवरण, लेन-देन की तारीख और आवश्यकता पड़ने पर दोनों पक्षों के हस्ताक्षर हों।",
              "यदि कोई बात संदिग्ध लगे, तो फोन के स्रोत और स्वामित्व की जांच किए बिना सौदा पूरा न करें।"
            ]
          }
        };
      default:
        return {
          title: "Security Warning",
          message: "Do not pay or transfer any money when contacted, and do not share your banking information with anyone. IMEI app has not contacted you to request any money, and we are not responsible for any transfers outside the app. Thank you for your understanding - IMEI Safe",
          salePurchaseNotice: {
            title: "Important when buying or selling a phone",
            introduction: "Take these precautions before completing a sale or purchase:",
            precautions: [
              "Ask for the original phone box and compare the IMEI printed on it with the IMEI shown on the device.",
              "Ask to see proof of purchase or an invoice, if available.",
              "Verify the seller's identity in an appropriate way.",
              "Keep proof of the transaction, such as a receipt recording the device details, transaction date, and both parties' signatures where appropriate.",
              "If anything seems suspicious, do not complete the transaction until you have checked the phone's source and ownership."
            ]
          }
        };
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/login-background.jpeg')" }}
    >
      <div className="max-w-2xl w-full bg-white/70 backdrop-blur-xl rounded-2xl p-8 shadow-[0_16px_42px_rgba(0,0,0,0.32)] border border-white/70">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-imei-cyan/10 rounded-full flex items-center justify-center mb-4">
            <Globe className="w-20 h-20 text-imei-cyan" />
          </div>
          <h1 className="text-black text-3xl font-bold text-center mb-2">{t('select_language')}</h1>
          <p className="text-black font-semibold text-center">Choose your preferred language</p>
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
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border-2 border-orange-400/70 bg-gradient-to-br from-white via-orange-50 to-blue-50 p-5 text-slate-900 shadow-[0_20px_60px_rgba(0,0,0,0.3)] shadow-blue-900/15">
          <DialogHeader className="text-right" dir="rtl">
            <DialogTitle className="flex items-center justify-start gap-3 text-xl font-bold text-blue-900">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-orange-400/60 bg-orange-100">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
              </span>
              {getWarningMessage(selectedLang).title}
            </DialogTitle>
            <div className="mt-4 h-px bg-gradient-to-l from-transparent via-orange-400/60 to-transparent" />
            <DialogDescription className="mt-4 text-right text-sm leading-7 text-slate-700" dir={selectedLang === 'ar' ? 'rtl' : 'ltr'}>
              {getWarningMessage(selectedLang).message}
            </DialogDescription>
            <section className={`mt-4 border-t border-orange-300/70 pt-4 ${selectedLang === 'ar' || selectedLang === 'hi' ? 'text-right' : 'text-left'}`} dir={selectedLang === 'ar' || selectedLang === 'hi' ? 'rtl' : 'ltr'}>
                <h3 className="text-base font-bold leading-6 text-blue-900">{getWarningMessage(selectedLang).salePurchaseNotice.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">{getWarningMessage(selectedLang).salePurchaseNotice.introduction}</p>
                <ul className={`mt-2 list-disc space-y-2 text-sm leading-6 text-slate-700 ${selectedLang === 'ar' || selectedLang === 'hi' ? 'pr-5' : 'pl-5'}`}>
                  {getWarningMessage(selectedLang).salePurchaseNotice.precautions.map((precaution) => (
                    <li key={precaution}>{precaution}</li>
                  ))}
                </ul>
            </section>
          </DialogHeader>
          <div className="mt-2">
            <Button
              onClick={() => {
                setShowWarning(false);
                navigate('/welcome');
              }}
              className="h-11 w-full rounded-xl bg-blue-600 font-bold text-white shadow-lg shadow-blue-900/25 transition-all hover:bg-blue-700 hover:shadow-blue-900/30"
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
