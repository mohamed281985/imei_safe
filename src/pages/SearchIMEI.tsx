import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Search, ArrowLeft, Smartphone, FileText, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import PageContainer from '@/components/PageContainer';
import AppNavbar from '@/components/AppNavbar';
import PageAdvertisement from '@/components/advertisements/PageAdvertisement';
import { useScrollToTop } from '../hooks/useScrollToTop';
import { supabase } from '../lib/supabase';
import AdsOfferSlider from '@/components/AdsOfferSlider';

const WelcomeSearch: React.FC = () => {
  useScrollToTop();
  const [isSearching, setIsSearching] = useState(false);
  const { t } = useLanguage();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isNotifying, setIsNotifying] = useState(false);

  const [imei, setImei] = useState('');
  const [searchResult, setSearchResult] = useState<'found' | 'not_found' | null>(null);
  const [phoneId, setPhoneId] = useState<string | null>(null);
  const [registeredPhoneDetails, setRegisteredPhoneDetails] = useState<any | null>(null);
  // إزالة تخزين البيانات الحساسة في الحالة
  const [foundReportStatus, setFoundReportStatus] = useState<string | null>(null);
  const [foundReportDate, setFoundReportDate] = useState<string | null>(null);
  const [lossLocation, setLossLocation] = useState<string | null>(null);
  const [lossTime, setLossTime] = useState<string | null>(null);
  const [hasReachedSearchLimit, setHasReachedSearchLimit] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [userId, setUserId] = useState<string>('');

  // التحقق من حد البحث للمستخدم بناءً على أحدث دفع في ads_payment
  const checkSearchLimit = async (userId: string) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const response = await fetch('https://imei-safe.me/api/check-limit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ type: 'search_imei' })
    });

    const result = await response.json();

    if (!result.allowed) {
      toast({
        title: t('alert'),
        description: t('search_limit_exceeded'),
        variant: 'destructive'
      });
      setHasReachedSearchLimit(true);
      setShowUpgradeModal(true);
      return false;
    }

    if (result.isLastUsage) {
      toast({
        title: t('alert'),
        description: t('last_search_allowed'),
        variant: 'default'
      });
    }

    setHasReachedSearchLimit(false);
    return true;
  } catch (error) {
    toast({
      title: 'خطأ',
      description: 'حدث خطأ في التحقق من حد البحث',
      variant: 'destructive'
    });
    return false;
  }
};


  // تحديث عدد عمليات البحث المستخدمة
  const updateSearchUsage = async (userId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      await fetch('https://imei-safe.me/api/increment-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type: 'search_imei' })
      });
    } catch (error) {
      // تم تجاهل الخطأ في تحديث استخدام البحث
    }
  };

  const handleImeiChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length > 15) return;
    setImei(value);
  }, []);

  // تم إزالة هذا useEffect لأننا نتحقق من الحد مباشرة في الدوال

  const handleNotifyOwner = async () => {
    // Debug: تحقق من القيم قبل التحقق
    console.debug('handleNotifyOwner: user =', user, 'phoneId =', phoneId);
    if (!phoneId || !user || !user.id) {
      toast({ title: t('error'), description: t('must_login_to_contact_owner'), variant: 'destructive' });
      return;
    }

    setIsNotifying(true);
    let notificationSent = false;
    let emailSent = false;

    try {
      // 1. جلب رقم هاتف المستخدم الحالي (الواجد)
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('https://imei-safe.me/api/get-finder-phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId: user.id })
      });
      const { finderPhone, error } = await response.json();

      if (error || !finderPhone) {
        throw new Error(error || 'فشل في الحصول على رقم هاتف الواجد.');
      }

      // 2. تحديث جدول phone_reports بوضع رقم هاتف الواجد المشفر في عمود finder_phone باستخدام IMEI
      const updateResponse = await fetch('https://imei-safe.me/api/update-finder-phone-by-imei', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          imei: phoneId,
          finderPhone: finderPhone
        })
      });
      const updateResult = await updateResponse.json();

      if (!updateResponse.ok || !updateResult.success) {
        toast({ title: 'تنبيه', description: 'تم العثور على الهاتف لكن لم يتم حفظ رقمك في قاعدة البيانات.', variant: 'destructive' });
      } else {

        // حفظ البيانات في جدول notifications
        try {
          // جلب email لصاحب الهاتف من phone_reports باستخدام imei
          let ownerEmailForNotification = null;
          let ownerLanguageForNotification: string | null = null;
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            const response = await fetch('https://imei-safe.me/api/get-owner-email-by-imei', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ imei: phoneId })
            });
            const result = await response.json();
            if (!response.ok || !result?.email) {
              throw new Error(result?.error || 'لم يتم العثور على سجل للهاتف في قاعدة البيانات');
            }
            ownerEmailForNotification = result.email;
            ownerLanguageForNotification = result.language || null;
          } catch (err) {
            console.debug('Error finding email for notification:', err);
            throw new Error('فشل في العثور على البريد الإلكتروني الخاص بهذا الهاتف');
          }

          const normalizedLang = String(ownerLanguageForNotification || 'ar').toLowerCase();
          const contentByLang = {
            ar: {
              title: 'تم العثور على هاتفك!',
              body: `مبروك! تم العثور على هاتفك. للتواصل مع الشخص الذي وجده، يرجى الاتصال على الرقم: ${finderPhone}.`
            },
            en: {
              title: 'Your phone was found!',
              body: `Congratulations! Your phone was found. To contact the finder, please call: ${finderPhone}.`
            },
            fr: {
              title: 'Votre téléphone a été retrouvé !',
              body: `Félicitations ! Votre téléphone a été retrouvé. Pour contacter la personne qui l'a trouvé, appelez : ${finderPhone}.`
            },
            hi: {
              title: 'आपका फोन मिल गया है!',
              body: `बधाई हो! आपका फोन मिल गया है। खोजने वाले से संपर्क करने के लिए कॉल करें: ${finderPhone}.`
            }
          };

          const localizedContent = contentByLang[normalizedLang] || contentByLang.ar;

          let imeiForNotification = phoneId || '';
          try {
            if (imeiForNotification && /\D/.test(imeiForNotification)) {
              const { decryptIMEI } = await import('@/lib/imeiCrypto');
              const decryptedCandidate = decryptIMEI(imeiForNotification);
              if (/^\d{14,16}$/.test(decryptedCandidate)) {
                imeiForNotification = decryptedCandidate;
              }
            }
          } catch (e) {
            // تجاهل أي خطأ في فك التشفير واستخدم القيمة كما هي
          }

          const notificationPayload = {
            title: localizedContent.title,
            body: localizedContent.body,
            user_id: user.id,
            finder_phone: finderPhone,
            imei: imeiForNotification,
            email: ownerEmailForNotification,
            notification_type: 'phone_found',
            is_read: false,
            created_at: new Date().toISOString()
          };

          // استخدام دالة createNotification
          let notificationData, notificationError;
          try {
            const { createNotification } = await import('../lib/notificationService');
            const result = await createNotification(notificationPayload);
            notificationData = result;
          } catch (error) {
            notificationError = error;
          }

          // التحقق إذا كان الخطأ بسبب سياسة الأمان
          if (notificationError && notificationError.code === '42501') {
            toast({
              title: 'تحذير',
              description: `تم حفظ رقم الهاتف بنجاح، لكن لم يتمكن النظام من إرسال إشعار للمالك بسبب إعدادات الأمان. يرجى التواصل مع المالك مباشرة عبر الرقم: ${finderPhone}`,
              variant: 'default'
            });
          } else if (notificationError) {
            toast({
              title: 'خطأ',
              description: `تم حفظ رقم الهاتف لكن حدث خطأ في حفظ الإشعار: ${notificationError.message || 'غير معروف'}`,
              variant: 'destructive'
            });
          }
        } catch (saveError) {
          if (saveError instanceof Error) {
            toast({
              title: 'خطأ',
              description: `حدث خطأ أثناء حفظ الإشعار: ${saveError.message}`,
              variant: 'destructive'
            });
          }
        }

        notificationSent = updateResult.success;
        emailSent = updateResult.success;

        if (notificationSent || emailSent) {
          toast({ title: t('notification_sent'), description: t('owner_notified_success') });
        } else {
          toast({ title: 'تعذر إرسال التنبيه', description: 'لم يتم العثور على بيانات تواصل صالحة للمالك.', variant: 'destructive' });
        }
      }
    } catch (error) {
      toast({ title: t('error'), description: error.message || 'حدث خطأ أثناء محاولة إبلاغ المالك.', variant: 'destructive' });
    } finally {
      setIsNotifying(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!imei) {
      toast({
        title: t('error'),
        description: t('please_enter_imei'),
        variant: 'destructive'
      });
      return;
    }

    if (!/^\d{14,15}$/.test(imei)) {
      toast({
        title: t('error'),
        description: t('invalid_imei'),
        variant: 'destructive'
      });
      return;
    }
    
    // ملاحظة أمنية: التحقق من صحة الـ IMEI يتم هنا في الواجهة الأمامية لتحسين تجربة المستخدم
    // ولكن يجب أيضاً التحقق من صحة الـ IMEI في الخادم لضمان أمان البيانات
    // الخادم يجب أن يرفض أي IMEI لا يطابق النمط المطلوب

    // التحقق من تسجيل الدخول
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
    }
    if (!user) {
      toast({
        title: 'خطأ',
        description: 'يرجى تسجيل الدخول أولاً',
        variant: 'destructive'
      });
      return;
    }

    // التحقق من حد البحث
    const canSearch = await checkSearchLimit(user.id);
    if (!canSearch) return;

    setIsSearching(true);

    try {
      setSearchResult(null);
      setRegisteredPhoneDetails(null);
      setPhoneId(null);
      setFoundReportStatus(null);
      setFoundReportDate(null);

      // مخاطبة السيرفر عبر API
      // ملاحظة: استخدم https://imei-safe.me للإنتاج أو http://10.0.2.2:3000 للمحاكي
      // ملاحظة أمنية: لا نرسل userId في جسم الطلب لتجنب ثغرة IDOR
      // الخادم سيستخرج userId من التوكن المرسل في الترويسة
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('https://imei-safe.me/api/search-imei', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ imei: imei })
      });
      const result = await response.json();

      // تحديث عدد عمليات البحث
      await updateSearchUsage(user.id);

      // معالجة النتائج حسب ما يرجعه السيرفر فقط
      if (result.found) {
        setPhoneId(result.imei || imei); // عيّن phoneId دائماً
        setSearchResult('found');
        // تخزين فقط الحالة والتاريخ الضروريين للعرض
        setFoundReportStatus(result.status || '');
        setFoundReportDate(result.report_date || '');
        setLossLocation(result.loss_location || '');
        setLossTime(result.loss_time || '');
        if (result.registeredPhone) {
          setRegisteredPhoneDetails({
            imei: result.imei || imei,
            registration_date: result.registeredPhone.registration_date,
            status: result.registeredPhone.status,
          });
        }
      } else if (result.registeredPhone || result.registered || result.isRegistered) {
        // Normalize registered phone data: the API may return different shapes
        const rp = result.registeredPhone
          ? result.registeredPhone
          : {
              imei: result.imei || imei,
              registration_date: result.registration_date || result.registered_at || null,
              status: result.status || 'registered',
            };

        setPhoneId(rp.imei || imei); // عيّن phoneId دائماً
        setRegisteredPhoneDetails({
          imei: rp.imei,
          registration_date: rp.registration_date,
          status: rp.status,
        });
        setSearchResult('not_found');
      } else {
        setPhoneId(imei); // حتى لو لم يوجد، عيّن IMEI المدخل
        setSearchResult('not_found');
        setRegisteredPhoneDetails(null);
        toast({
          title: t('info'),
          description: t('phone_not_found'),
        });
      }
    } catch (error) {
      toast({
        title: t('error'),
        description: t('error_searching'),
        variant: 'destructive'
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Safe date formatter: returns formatted string or null when invalid
  const formatDateTime = (val: any) => {
    if (val === null || val === undefined || val === '') return null;
    try {
      const d = typeof val === 'number' ? new Date(val) : new Date(String(val));
      if (isNaN(d.getTime())) return null;
      return d.toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US');
    } catch (e) {
      return null;
    }
  };

  return (
    <PageContainer>
      <AppNavbar />
      <PageAdvertisement pageName="welcomesearch" />
      <div className="container mx-auto px-4 py-8 glass-bg" style={{ background: 'rgba(255,255,255,0.18)' }}>
        <div className="my-6 flex-1 flex flex-col">
          <div className="flex items-center mb-6" style={{ background: 'linear-gradient(to top, #053060 0%, #0a4d8c 100%)', padding: '0.3rem', borderRadius: '1rem', marginTop: '1rem' }}>
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-orange-500 p-2 rounded-full hover:bg-orange-600 transition-colors mr-4"
            >
              <ArrowLeft size={20} className="text-white" />
            </button>
            <h1
              className="flex-1 text-center text-2xl font-bold"
              style={{ color: '#ffffff' }}
            >
              {t('search_imei')}
            </h1>
          </div>
          <div className="space-y-4">
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  value={imei}
                  onChange={handleImeiChange}
                  placeholder="12345789012345"
                  className="w-full pl-10 py-3 border border-imei-cyan/30 rounded-lg text-black focus:border-imei-cyan focus:ring-1 focus:ring-imei-cyan"
                  style={{ background: '#c0dee5' }}
                  maxLength={15}
                  pattern="[0-9]*"
                  inputMode="numeric"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-cyan-400 hover:bg-cyan-500 py-3 text-lg font-medium flex items-center justify-center gap-2 shadow-lg transition-all duration-300"
                disabled={isSearching}
              >
                <Search className="w-5 h-5 text-blue-900" />
                <span className="text-blue-900">{t('search')}</span>
              </Button>
            </form>

            {searchResult === null && (
              <div className="flex flex-col items-center justify-center mt-8 space-y-2">
                <Smartphone className="text-gray-500" width={48} height={48} />
                <p className="text-gray-400 text-center">{t('enter_imei')}</p>
              </div>
            )}

            {searchResult === 'found' && foundReportStatus && (
              <div className={`mt-8 p-6 rounded-xl border ${foundReportStatus === 'resolved' ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400'}`}>
                <div className="flex items-center justify-center mb-4">
                  {foundReportStatus === 'resolved' ? (
                    <CheckCircle size={48} className="text-green-600" />
                  ) : (
                    <AlertTriangle size={48} className="text-red-600" />
                  )}
                </div>
                <h3 className={`text-xl font-bold text-center mb-2 ${foundReportStatus === 'resolved' ? 'text-green-800' : 'text-red-800'}`}>
                  {foundReportStatus === 'resolved' ? t('phone_found') : t('phone_lost')}
                </h3>
                <p className={`text-center ${foundReportStatus === 'resolved' ? 'text-green-700' : 'text-red-700'}`}>
                  {foundReportStatus === 'resolved' ? t('phone_found_message') : t('phone_lost_message')}
                </p>

                <div className="text-center text-black mb-2">
                  <span className="font-bold">IMEI:</span> {phoneId}
                </div>
                {/* عرض مكان الفقد وتاريخ الفقد إذا توفرا */}
                {foundReportStatus === 'active' && (
                  <>
                    {foundReportDate && (
                      <div className="text-center text-black mb-2">
                        <span className="font-bold">تاريخ البلاغ:</span> {new Date(foundReportDate).toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-US')}<br />
                        <span className="font-bold">وقت البلاغ:</span> {new Date(foundReportDate).toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </div>
                    )}
                    {lossLocation && (
                      <div className="text-center text-black mb-2">
                        <span className="font-bold">مكان الفقد:</span> {lossLocation}
                        {lossTime && (
                          <>
                            <br />
                            <span className="font-bold">وقت الفقد:</span> {new Date(lossTime).toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {searchResult === 'not_found' && registeredPhoneDetails && (
              <>
                {registeredPhoneDetails.status === 'transferred' ? (
                  <div className="mt-8 p-6 rounded-xl border bg-green-100 border-green-400">
                    <div className="flex items-center justify-center mb-4">
                      <ShieldCheck size={48} className="text-green-600" />
                    </div>
                    <h3 className="text-xl font-bold text-center mb-2 text-green-800 rtl">
                      {t('this_phone_is_registered_in_our_system_since')}{' '}
                      {formatDateTime(registeredPhoneDetails.registration_date) || 'غير متوفر'}{' '}
                      {t('and_no_report_has_been_filed_yet')}
                    </h3>
                  </div>
                ) : registeredPhoneDetails.status === 'pending' ? (
                  <div className="mt-8 p-6 rounded-xl border bg-yellow-100 border-yellow-400 shadow-lg shadow-yellow-500/20">
                    <div className="flex items-center justify-center mb-4">
                      <AlertTriangle size={48} className="text-yellow-600" />
                    </div>
                    <h3 className="text-xl font-bold text-center mb-2 text-yellow-800 rtl">
                      {t('this_phone_is_registered_in_our_system_since')}{' '}
                      {formatDateTime(registeredPhoneDetails.registration_date) || 'غير متوفر'}{' '}
                      {t('and_it_is_under_review_please_check_purchase_invoice')}
                    </h3>
                  </div>
                ) : registeredPhoneDetails.status === 'rejected' ? (
                  <div className="mt-8 p-6 rounded-xl border bg-red-100 border-red-400 shadow-lg shadow-red-500/20 rtl">
                    <div className="flex items-center justify-center mb-4">
                      <XCircle size={48} className="text-red-600" />
                    </div>
                    <h3 className="text-xl font-bold text-center mb-2 text-red-800 rtl">
                      {t('this_phone_registration_has_been_rejected_due_to_incorrect_data')}
                    </h3>
                  </div>
                ) : (
                  <div className="mt-8 p-6 rounded-xl border bg-green-100 border-green-400">
                    <div className="flex items-center justify-center mb-4">
                      <ShieldCheck size={48} className="text-green-600" />
                    </div>
                    <h3 className="text-xl font-bold text-center mb-2 text-green-800 rtl">
                      {t('this_phone_is_registered_in_our_system_since')}{' '}
                      {formatDateTime(registeredPhoneDetails.registration_date) || 'غير متوفر'}{' '}
                      {t('and_no_report_has_been_filed_yet')}
                    </h3>
                  </div>
                )}
              </>
            )}


            {searchResult === 'found' && foundReportStatus === 'active' && (
              <div className="mt-4 p-4 bg-[#c0dee5] rounded-xl border border-red-500/50">
                <h3 className="text-lg font-bold text-red-600 mb-2">{t('report_and_box_image', { defaultValue: 'صورة المحضر والعلبة' })}</h3>
                <div className="relative">
                  <div className="w-full h-auto rounded-lg bg-gray-200 flex items-center justify-center" style={{ minHeight: '200px' }}>
                    <p className="text-black text-center p-4 text-sm font-bold">
                      {t('privacy_notice_search', { defaultValue: 'هذه البيانات لها خصوصيه وقد تمت مراجعتها من النظام علي مسئولية صاحب البلاغ' })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {searchResult === 'found' && foundReportStatus === 'active' && (
              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <Button
                  onClick={handleNotifyOwner}
                  className="flex-1 h-12 bg-orange-600 hover:bg-orange-700 text-white transition-all duration-300 text-base font-semibold shadow-md hover:shadow-lg rounded-md flex items-center justify-center gap-2"
                  disabled={isNotifying}
                >
                  {isNotifying ? t('processing') : t('notify_owner')}
                </Button>
              </div>
            )}
            


            {searchResult === 'not_found' && !registeredPhoneDetails && (
              <div className="mt-8 p-6 bg-sky-900/90 rounded-xl border border-sky-400 shadow-lg shadow-sky-900/40">
                <p className="text-white text-lg text-center font-semibold">
                  {t('phone_not_registered_register_now')}
                </p>
              </div>
            )}

          </div>
        </div>
      </div>
      {/* عرض AdsOfferSlider عندما يكون المستخدم قد استهلك الحد المسموح من عمليات البحث */}
      {showUpgradeModal && (
        <AdsOfferSlider onClose={() => setShowUpgradeModal(false)} userId={userId} isUpgradePrompt={true} />
      )}
    </PageContainer>
  );
};

export default WelcomeSearch;
