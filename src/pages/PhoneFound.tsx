import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import { useLanguage } from '../contexts/LanguageContext';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import { FaWhatsapp } from 'react-icons/fa';
import { Smartphone, PartyPopper, Home } from 'lucide-react';
import '../styles/animations.css';

const PhoneFound: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { imei: routeImei } = useParams<{ imei?: string }>();
  const location = useLocation();
  const { width, height } = useWindowSize();
  const [showCelebration, setShowCelebration] = useState(false);
  const [finderPhone, setFinderPhone] = useState<string | null>(null);
  const [imei, setImei] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPhoneData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // الحصول على رقم IMEI من المسار، ثم من query string، ثم من التخزين المحلي
        let imeiToUse = routeImei;
        if (!imeiToUse) {
          // جلب من query string
          const params = new URLSearchParams(location.search);
          imeiToUse = params.get('imei') || undefined;
        }
        if (!imeiToUse) {
          imeiToUse = localStorage.getItem('imei') || undefined;
        }

        console.log('قيمة IMEI من المسار:', routeImei);
        console.log('قيمة IMEI من query:', (new URLSearchParams(location.search)).get('imei'));
        console.log('قيمة IMEI من التخزين المحلي:', localStorage.getItem('imei'));
        console.log('قيمة IMEI التي سيتم استخدامها:', imeiToUse);

        if (!imeiToUse) {
          console.log('لم يتم العثور على رقم IMEI');
          setError('لم يتم العثور على رقم IMEI. يرجى التحقق من إعدادات التطبيق.');
          setLoading(false);
          return;
        }

        console.log('جلب بيانات الهاتف باستخدام رقم IMEI:', imeiToUse);
        
        // جلب بيانات الهاتف من قاعدة البيانات باستخدام رقم IMEI
        const { data, error: fetchError } = await supabase
          .from('phone_reports')
          .select('finder_phone, imei')
          .eq('imei', imeiToUse)
          .single();

        console.log('رد قاعدة البيانات:', data, fetchError);

        if (fetchError) {
          console.error('خطأ في قاعدة البيانات:', fetchError);
          setError('حدث خطأ في جلب بيانات الهاتف: ' + fetchError.message);
          setFinderPhone(null);
        } else if (!data) {
          console.error('لم يتم العثور على بيانات الهاتف');
          setError('لم يتم العثور على بيانات الهاتف المبلغ عنه.');
          setFinderPhone(null);
        } else {
          setFinderPhone(data.finder_phone);
          // فك تشفير رقم الايمي إذا كان مشفراً
          let realImei = '';
          try {
            if (typeof data.imei === 'string' && data.imei.startsWith('{')) {
              // غالباً مشفر بصيغة JSON
              const enc = JSON.parse(data.imei);
              if (enc.encryptedData && enc.iv && enc.authTag) {
                // استدعاء endpoint backend لفك التشفير أو نفذ نفس خوارزمية فك التشفير هنا إذا كانت متاحة
                // هنا سنعرض النص المشفر فقط إذا لم تتوفر دالة فك التشفير في الواجهة
                realImei = '[مشفّر]';
              } else {
                realImei = data.imei;
              }
            } else {
              realImei = data.imei;
            }
          } catch (e) {
            realImei = data.imei;
          }
          setImei(realImei);
          console.log('تم تعيين بيانات الهاتف من قاعدة البيانات:', { imei: realImei, finderPhone: data.finder_phone });
        }
      } catch (err) {
        console.error('خطأ في جلب بيانات الهاتف:', err);
        setError('حدث خطأ غير متوقع: ' + (err instanceof Error ? err.message : String(err)));
        setFinderPhone(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPhoneData();

    // بدء الرسوم المتحركة للاحتفال
    setShowCelebration(true);

    // إيقاف القصاصات بعد 15 ثانية
    const timer = setTimeout(() => {
      setShowCelebration(false);
    }, 15000);
    
    return () => clearTimeout(timer);
  }, [routeImei]); // إضافة routeImei كاعتماد

  const handleWhatsAppClick = () => {
    if (!finderPhone) {
      alert('لم يتم العثور على رقم هاتف من عثر على الهاتف.');
      return;
    }

    const cleanPhone = finderPhone.replace(/\D/g, '');
    console.log('فتح واتساب مع الرقم:', cleanPhone);
    const whatsappUrl = `https://wa.me/${cleanPhone}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <PageContainer>
      {showCelebration && (
        <>
          <Confetti width={width} height={height} recycle={false} numberOfPieces={600} />
          <div className="pyro">
            <div className="before"></div>
            <div className="after"></div>
          </div>
        </>
      )}
      <AppNavbar />
      
      <div className="flex-1 flex flex-col items-center justify-center text-center text-white p-4 h-screen">
        <PartyPopper className="w-24 h-24 text-yellow-400 mb-6 animate-bounce" />
        
        <h1 className="text-4xl font-bold mb-4 text-imei-cyan">
          {t('congratulations_phone_found_title')}
        </h1>
        
        <p className="text-lg text-gray-300 mb-8 max-w-lg">
          {t('congratulations_phone_found_desc')}
        </p>

        {/* عرض رقم الايمي */}
        <div className="bg-imei-darker/50 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-imei-cyan/20 w-full max-w-md mb-6">
          <div className="flex items-center justify-center gap-4">
            <Smartphone className="w-8 h-8 text-imei-cyan" />
            <div>
              <p className="text-sm text-white/50">رقم IMEI للهاتف المفقود:</p>
              <p className="text-3xl font-mono tracking-widest text-imei-cyan">
                {loading ? 'جاري التحميل...' : (imei ? imei : 'غير متوفر')}
              </p>
            </div>
          </div>
        </div>

        {/* رسالة الخطأ */}
        {error && (
          <div className="w-full max-w-md bg-red-500/20 text-red-200 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* حاوية لأزرار الإجراءات */}
        <div className="mt-12 flex flex-col items-center gap-6 w-full max-w-md">
          {/* رسالة التحميل */}
          {loading && (
            <div className="text-gray-300">
              جاري تحميل معلومات الاتصال...
            </div>
          )}
          
          {/* زر واتساب */}
          {!loading && finderPhone && (
            <div className="w-full max-w-md mb-4">
                <div className="bg-red-500/20 border-2 border-red-500 rounded-lg p-3 text-center font-bold text-red-800 text-lg animate-pulse">
                  تنبيه: عند مراسلة من عثر على هاتفك، يجب المطالبة بتصوير هاتفك للتأكد منه
                </div>
              <button
                onClick={handleWhatsAppClick}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold text-xl py-4 px-4 rounded-xl flex items-center justify-center transition-transform transform hover:scale-105 shadow-lg mt-4"
              >
                <FaWhatsapp size={30} className="mr-4" />
                الاتصال بمن عثر على هاتفك
              </button>
            </div>
          )}

          {/* رسالة عند عدم العثور على رقم الهاتف */}
          {!loading && !finderPhone && !error && (
            <div className="w-full bg-gray-500 text-white font-bold text-xl py-4 px-4 rounded-xl flex items-center justify-center">
              لم يتم العثور على رقم هاتف من عثر على الهاتف
            </div>
          )}

          {/* زر العودة للوحة التحكم */}
          <button onClick={() => navigate('/dashboard')} className="glowing-button inline-flex items-center">
            <Home size={18} className="mr-2" />
            {t('go_to_dashboard')}
          </button>
        </div>
      </div>
    </PageContainer>
  );
};

export default PhoneFound;
