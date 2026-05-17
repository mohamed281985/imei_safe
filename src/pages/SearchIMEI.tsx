import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Search, ArrowLeft, ArrowRight, Smartphone, FileText, CheckCircle, XCircle, ShieldCheck, MapPin, Clock, Calendar, Hash, ScanLine, Lock, Zap, Database, Target, MessageCircle } from 'lucide-react';
import PageContainer from '@/components/PageContainer';
import AppNavbar from '@/components/AppNavbar';
import PageAdvertisement from '@/components/advertisements/PageAdvertisement';
import { useScrollToTop } from '../hooks/useScrollToTop';
import { supabase } from '../lib/supabase';
import AdsOfferSlider from '@/components/AdsOfferSlider';
import axiosInstance from '@/services/axiosInterceptor';
import arTranslations from '../translations/ar';

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
  const [foundReportStatus, setFoundReportStatus] = useState<string | null>(null);
  const [foundReportDate, setFoundReportDate] = useState<string | null>(null);
  const [lossLocation, setLossLocation] = useState<string | null>(null);
  const [lossTime, setLossTime] = useState<string | null>(null);
  const [hasReachedSearchLimit, setHasReachedSearchLimit] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [userId, setUserId] = useState<string>('');
  
  // متغيرات جديدة للتعامل مع ميزة الواتساب
  const [ownerRole, setOwnerRole] = useState<string | null>(null);
  const [ownerWhatsAppEnabled, setOwnerWhatsAppEnabled] = useState<boolean>(false);
  const [ownerWhatsAppNumber, setOwnerWhatsAppNumber] = useState<string | null>(null);
  const [isCheckingWhatsApp, setIsCheckingWhatsApp] = useState(false);

  // التحقق من حد البحث للمستخدم بناءً على أحدث دفع في ads_payment
  const checkSearchLimit = async (userId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await axiosInstance.post('/api/check-limit',
        { type: 'search_imei', consumeBonusOnLimit: true },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const result = response.data;

      if (result?.usedBonus) {
        toast({
          title: t('alert'),
          description: t('bonus_deducted_can_continue', { amount: result.deductedAmount }),
          variant: 'default'
        });
      }

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
        title: t('error'),
        description: t('search_limit_check_error'),
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

      await axiosInstance.post('/api/increment-usage',
        { type: 'search_imei' },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
    } catch (error) {
      // تم تجاهل الخطأ في تحديث استخدام البحث
    }
  };

  const handleResetSearch = () => {
    setSearchResult(null);
    setImei('');
    setPhoneId(null);
    setRegisteredPhoneDetails(null);
    setFoundReportStatus(null);
    setFoundReportDate(null);
    setLossLocation(null);
    setLossTime(null);
    // إعادة تعيين متغيرات الواتساب
    setOwnerRole(null);
    setOwnerWhatsAppEnabled(false);
    setOwnerWhatsAppNumber(null);
  };

  const handleImeiChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length > 15) return;
    setImei(value);
  }, []);

  // دالة جديدة للتحقق من إعدادات الواتساب للمالك
  const checkOwnerWhatsAppSettings = async (imeiParam?: string) => {
    const idToUse = imeiParam || phoneId;
    if (!idToUse) return;

    setIsCheckingWhatsApp(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      // جلب بيانات المالك من جدول phone_reports
      const response = await axiosInstance.post('/api/get-owner-details-by-imei',
        { imei: idToUse },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const result = response.data;

      // التحقق من دور المستخدم وإعدادات الواتساب
      if (result) {
        setOwnerRole(result.role || null);
        setOwnerWhatsAppEnabled(result.whatsapp_enabled || false);

        // إذا كان الدور مناسباً والواتساب مفعلاً، جلب رقم الواتساب
        if ((result.role === 'gold_business' || result.role === 'gold_user') && result.whatsapp_enabled) {
          // الخادم يجب أن يعيد الرقم مفكوك التشفير. لا نفك التشفير في الواجهة الأمامية.
          setOwnerWhatsAppNumber(result.whatsapp_number || null);
        }
      }
    } catch (error) {
      console.error('Error checking owner WhatsApp settings:', error);
      toast({
        title: t('error'),
        description: t('error_checking_whatsapp_settings'),
        variant: 'destructive'
      });
    } finally {
      setIsCheckingWhatsApp(false);
    }
  };

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

      const response = await axiosInstance.post('/api/get-finder-phone',
        { userId: user.id },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const { finderPhone, error } = response.data;

      if (error || !finderPhone) {
        throw new Error(error || t('finder_phone_fetch_failed'));
      }

      // 2. تحديث جدول phone_reports بوضع رقم هاتف الواجد المشفر في عمود finder_phone باستخدام IMEI
      const updateResponse = await axiosInstance.post('/api/update-finder-phone-by-imei',
        {
          imei: phoneId,
          finderPhone: finderPhone
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const updateResult = updateResponse.data;

      if (!updateResponse.status || !updateResult.success) {
        toast({ title: t('alert_warning'), description: t('phone_found_but_not_saved'), variant: 'destructive' });
      } else {

        // حفظ البيانات في جدول notifications
        try {
          // جلب email لصاحب الهاتف من phone_reports باستخدام imei
          let ownerEmailForNotification = null;
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            const response = await axiosInstance.post('/api/get-owner-email-by-imei',
              { imei: phoneId },
              {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              }
            );
            const result = response.data;
            if (response.status !== 200 || !result?.email) {
              throw new Error(result?.error || t('phone_not_found_in_database'));
            }
            ownerEmailForNotification = result.email;
          } catch (err) {
            console.debug('Error finding email for notification:', err);
            throw new Error(t('finder_email_fetch_failed'));
          }

          let imeiForNotification = phoneId || '';
          // نفترض أن الخادم يعيد IMEI مفكوك التشفير عند الحاجة؛ لا نفك التشفير في الواجهة الأمامية.

          // استخدام اللغة العربية دائماً للإشعار لأن صاحب الهاتف سجل بالعربية
          // والأشعارات يجب أن تصل بلغة المستلم (صاحب الهاتف) وليس بلغة الواجد
          const notificationTitle = arTranslations['notification_title_phone_found'] || 'تم العثور على هاتفك!';
          const notificationBodyRaw = arTranslations['notification_body_phone_found'] || 'مبروك! تم العثور على هاتفك. للتواصل مع الشخص الذي وجده، يرجى الاتصال على الرقم: {{phone}}.';
          const notificationBody = notificationBodyRaw.replace('{{phone}}', finderPhone);

          const notificationPayload = {
            title: notificationTitle,
            body: notificationBody,
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
              title: t('alert'),
              description: t('warning_security_settings', { phone: finderPhone }),
              variant: 'default'
            });
          } else if (notificationError) {
            toast({
              title: t('error'),
              description: t('phone_saved_notification_error', { error: notificationError.message || t('not_available') }),
              variant: 'destructive'
            });
          }
        } catch (saveError) {
          if (saveError instanceof Error) {
            toast({
              title: t('error'),
              description: t('notification_save_error', { error: saveError.message }),
              variant: 'destructive'
            });
          }
        }

        notificationSent = updateResult.success || updateResult.ok;
        emailSent = updateResult.success || updateResult.ok;

        if (notificationSent || emailSent) {
          toast({ title: t('notification_sent'), description: t('owner_notified_success') });
        } else {
          toast({ title: t('cannot_send_alert'), description: t('no_valid_owner_contact'), variant: 'destructive' });
        }
      }
    } catch (error) {
      toast({ title: t('error'), description: error.message || t('error_notifying_owner'), variant: 'destructive' });
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
        title: t('error'),
        description: t('login_required_first'),
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
      
      // إعادة تعيين متغيرات الواتساب
      setOwnerRole(null);
      setOwnerWhatsAppEnabled(false);
      setOwnerWhatsAppNumber(null);

      // مخاطبة السيرفر عبر API
      // ملاحظة: استخدم https://imei-safe.me للإنتاج أو http://10.0.2.2:3000 للمحاكي
      // ملاحظة أمنية: لا نرسل userId في جسم الطلب لتجنب ثغرة IDOR
      // الخادم سيستخرج userId من التوكن المرسل في الترويسة
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await axiosInstance.post('/api/search-imei',
        { imei: imei },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const result = response.data;

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
            phone_image_url: result.registeredPhone.phone_image_url || result.phone_image_url,
            phone_type: result.registeredPhone.phone_type || result.phone_type,
          });
        }
        
        // التحقق من إعدادات الواتساب للمالك إذا كان الهاتف مفقوداً
        if (result.status === 'active') {
          await checkOwnerWhatsAppSettings(result.imei || imei);
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
          phone_image_url: rp.phone_image_url || result.phone_image_url,
          phone_type: rp.phone_type || result.phone_type,
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

  // دالة للتواصل عبر الواتساب
  const handleWhatsAppContact = () => {
    if (ownerWhatsAppNumber) {
      // إنشاء رابط الواتساب
      const whatsappUrl = `https://wa.me/${ownerWhatsAppNumber}`;
      // فتح الرابط في نافذة جديدة
      window.open(whatsappUrl, '_blank');
    }
  };

  return (
    <PageContainer>
      <AppNavbar />
      <PageAdvertisement pageName="welcomesearch" />

      <div className="min-h-screen bg-slate-50 pb-10">
        <div className="container mx-auto px-4 py-6 max-w-4xl">
          {/* Header Section */}
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 border border-slate-200">
            <div className="flex items-center justify-between">
              <button
                onClick={() => navigate('/dashboard')}
                className="text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowRight size={20} className="rtl:rotate-180" />
              </button>
              <div className="flex items-center">
                <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-2 rounded-lg ml-4 shadow-md">
                  <ShieldCheck size={20} className="text-white" />
                </div>
                <h1 className="text-xl font-bold text-blue-600">
                  {t('search_imei')}
                </h1>
              </div>
              <div className="w-5"></div> {/* Spacer for balance */}
            </div>
          </div>

          {/* Search Card */}
          {searchResult !== 'found' && (
            <div className="bg-white rounded-3xl shadow-lg p-6 mb-8 border border-slate-100">
              <div className="mb-6 text-center">
                <h2 className="text-2xl font-bold text-blue-600 mb-2">
                  {t('search_imei_title')}
                </h2>
                <p className="text-blue-600">
                  {t('search_imei_description')}
                </p>
              </div>


              <form onSubmit={handleSearch} className="space-y-6">
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                    <Hash size={20} className="text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={imei}
                    onChange={handleImeiChange}
                    placeholder={t('enter_imei_placeholder')}
                    className="w-full pr-12 pl-12 py-4 bg-slate-50 border-2 border-slate-200 rounded-xl text-blue-600 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all duration-300"
                    maxLength={15}
                    pattern="[0-9]*"
                    inputMode="numeric"
                  />
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4">
                    <button
                      type="button"
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-lg transition-colors"
                      onClick={() => {/* TODO: Implement QR scan */ }}
                    >
                      <ScanLine size={20} />
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-14 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold text-lg rounded-xl shadow-lg shadow-orange-500/30 transition-all duration-300 flex items-center justify-center gap-2"
                  disabled={isSearching || !imei}
                >
                  {isSearching ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>{t('searching')}</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      <span>{t('search')}</span>
                    </>
                  )}
                </Button>
              </form>
            </div>
          )}

          {/* Empty State - تم إزالة هذا القسم بالكامل */}

          {/* Features Grid - تم تعديل هذا القسم ليظهر فقط قبل البحث */}
          {searchResult === null && (
            <div className="grid grid-cols-2 gap-4 mt-8 w-full">
              {[
                { icon: Lock, title: t('data_protection'), desc: t('data_protection_desc') },
                { icon: Zap, title: t('instant_results'), desc: t('instant_results_desc') },
                { icon: Database, title: t('trusted_database'), desc: t('reliable_database_desc') },
                { icon: Target, title: t('high_accuracy'), desc: t('high_accuracy_desc') }
              ].map((feature, index) => (
                <div key={index} className="bg-gradient-to-br from-white to-slate-50 rounded-xl p-6 shadow-xl border border-slate-100 hover:shadow-lg hover:border-orange-200 transition-all duration-300">
                  <div className="bg-gradient-to-br from-orange-500 to-orange-600 w-14 h-14 rounded-xl flex items-center justify-center mb-4 shadow-md">
                    <feature.icon size={24} className="text-white" />
                  </div>
                  <h4 className="font-bold text-blue-600 mb-2 text-lg">{feature.title}</h4>
                  <p className="text-sm text-blue-600 leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          )}

          {/* Search Results Section */}
          {searchResult !== null && (
            <div className="space-y-6">

              {/* Found Phone Card */}
              {searchResult === 'found' && foundReportStatus && (
                <div className={`bg-white rounded-2xl shadow-lg overflow-hidden border ${foundReportStatus === 'resolved' ? 'border-green-100' : 'border-red-100'}`}>
                  {/* Header */}
                  <div className={`pt-6 pb-4 px-6 flex flex-col items-center ${foundReportStatus === 'resolved' ? 'bg-green-600' : 'bg-red-600'}`}>
                    <div className={`${foundReportStatus === 'resolved' ? 'bg-green-400' : 'bg-red-400'} p-4 rounded-full mb-3`}>
                      {foundReportStatus === 'resolved' ? (
                        <CheckCircle size={32} className="text-green-600" />
                      ) : (
                        <AlertTriangle size={32} className="text-white" />
                      )}
                    </div>
                    <h3 className={`text-2xl font-bold mb-1 ${foundReportStatus === 'resolved' ? 'text-white' : 'text-white'}`}>
                      {foundReportStatus === 'resolved' ? t('phone_found') : t('phone_lost')}
                    </h3>
                  </div>

                  {/* Details */}
                  <div className="p-4 bg-white">
                    <div className="flex flex-col gap-4">
                      {/* صف رقم IMEI */}
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0">
                          <Hash size={24} className="text-slate-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-500 font-bold mb-1">IMEI</p>
                          <p className="text-base font-bold text-blue-600 truncate">
                            {phoneId ? phoneId : 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* صف حالة البلاغ */}
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0">
                          <AlertTriangle size={24} className="text-slate-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-slate-500 font-bold mb-1">{t('report_status')}</p>
                          <p className={`text-base font-bold ${foundReportStatus === 'resolved' ? 'text-green-600' : 'text-red-600'}`}>
                            {foundReportStatus === 'resolved' ? t('resolved') : t('active')}
                          </p>
                        </div>
                      </div>

                      {/* صف بعمودين: وقت الفقد ووقت البلاغ */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* وقت الفقد */}
                        {lossTime ? (
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0">
                              <Clock size={24} className="text-slate-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-slate-500 font-bold mb-1">{t('loss_time')}</p>
                              <p className="text-base font-bold text-blue-600">
                                {new Date(lossTime).toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                              </p>
                            </div>
                          </div>
                        ) : null}

                        {/* وقت البلاغ */}
                        {foundReportDate ? (
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0">
                              <Clock size={24} className="text-slate-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-slate-500 font-bold mb-1">{t('report_time')}</p>
                              <p className="text-base font-bold text-blue-600">
                                {new Date(foundReportDate).toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {/* صف بعمودين: تاريخ الفقد وتاريخ البلاغ */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* تاريخ الفقد */}
                        {lossTime ? (
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0">
                              <Calendar size={24} className="text-slate-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-slate-500 font-bold mb-1">{t('loss_date')}</p>
                              <p className="text-base font-bold text-blue-600">
                                {new Date(lossTime).toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-US')}
                              </p>
                            </div>
                          </div>
                        ) : null}

                        {/* تاريخ البلاغ */}
                        {foundReportDate ? (
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0">
                              <Calendar size={24} className="text-slate-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-slate-500 font-bold mb-1">{t('report_date')}</p>
                              <p className="text-base font-bold text-blue-600">
                                {new Date(foundReportDate).toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-US')}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {/* صف مكان الفقد */}
                      {lossLocation ? (
                        <div className="flex items-center gap-3 bg-white/60 p-3 rounded-xl border border-red-100 shadow-sm">
                          <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0">
                            <MapPin size={24} className="text-slate-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-slate-500 font-bold mb-1">{t('loss_location')}</p>
                            <p className="text-base font-bold text-blue-600">{lossLocation}</p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {/* Registered Phone Card */}
              {searchResult === 'not_found' && registeredPhoneDetails && (
                <>
                  {registeredPhoneDetails.status === 'transferred' ? (
                    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100">
                      <div className="bg-green-50 pt-6 pb-4 px-6 flex flex-col items-center">
                        <div className="bg-green-100 p-4 rounded-full mb-3">
                          <ShieldCheck size={32} className="text-green-600" />
                        </div>
                        <h3 className="text-xl font-bold text-center mb-2 text-blue-600">
                          {t('this_phone_is_registered_in_our_system_since')}{' '}
                          {formatDateTime(registeredPhoneDetails.registration_date) || t('not_available')}{' '}
                          {t('and_no_report_has_been_filed_yet')}
                        </h3>
                      </div>

                      {/* Phone Image - تم تعديل هذا القسم لتقليل ارتفاع الصورة */}
                      {registeredPhoneDetails.phone_image_url && (
                        <div className="p-3 flex flex-col items-center">
                          <p className="text-blue-600 font-bold mb-2">{t('phone_image_label')}</p>
                          <img
                            src={registeredPhoneDetails.phone_image_url}
                            alt={t('phone_image_label')}
                            className="w-full max-w-xs h-32 object-contain rounded-xl border-2 border-slate-200 shadow-sm"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Crect x=%225%22 y=%225%22 width=%2290%22 height=%2290%22 fill=%22%23eee%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 font-family=%22sans-serif%22 font-size=%2214%22 fill=%22%23999%22%3ENo Image%3C/text%3E%3C/svg%3E';
                            }}
                          />
                        </div>
                      )}

                      {/* Phone Type */}
                      {registeredPhoneDetails.phone_type && (
                        <div className="px-6 pb-6 text-center">
                          <p className="text-blue-600 font-bold">{t('phone_type_label')}: <span className="font-normal">{registeredPhoneDetails.phone_type}</span></p>
                        </div>
                      )}
                    </div>
                  ) : registeredPhoneDetails.status === 'pending' ? (
                    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100">
                      <div className="bg-yellow-50 pt-6 pb-4 px-6 flex flex-col items-center">
                        <div className="bg-yellow-100 p-4 rounded-full mb-3">
                          <AlertTriangle size={32} className="text-yellow-600" />
                        </div>
                        <h3 className="text-xl font-bold text-center mb-2 text-blue-600">
                          {t('this_phone_is_registered_in_our_system_since')}{' '}
                          {formatDateTime(registeredPhoneDetails.registration_date) || t('not_available')}{' '}
                          {t('and_it_is_under_review_please_check_purchase_invoice')}
                        </h3>
                      </div>

                      {/* Phone Image - تم تعديل هذا القسم لتقليل ارتفاع الصورة */}
                      {registeredPhoneDetails.phone_image_url && (
                        <div className="p-3 flex flex-col items-center">
                          <p className="text-blue-600 font-bold mb-2">{t('phone_image_label')}</p>
                          <img
                            src={registeredPhoneDetails.phone_image_url}
                            alt={t('phone_image_label')}
                            className="w-full max-w-xs h-32 object-contain rounded-xl border-2 border-slate-200 shadow-sm"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 font-family=%22sans-serif%22 font-size=%2214%22 fill=%22%23999%22%3ENo Image%3C/text%3E%3C/svg%3E';
                            }}
                          />
                        </div>
                      )}

                      {/* Phone Type */}
                      {registeredPhoneDetails.phone_type && (
                        <div className="px-6 pb-6 text-center">
                          <p className="text-blue-600 font-bold">{t('phone_type_label')}: <span className="font-normal">{registeredPhoneDetails.phone_type}</span></p>
                        </div>
                      )}
                    </div>
                  ) : registeredPhoneDetails.status === 'rejected' ? (
                    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100">
                      <div className="bg-red-10 pt-6 pb-4 px-6 flex flex-col items-center">
                        <div className="bg-red-100 p-4 rounded-full mb-3">
                          <XCircle size={32} className="text-red-600" />
                        </div>
                        <h3 className="text-xl font-bold text-center mb-2 text-blue-600">
                          {t('this_phone_registration_has_been_rejected_due_to_incorrect_data')}
                        </h3>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100">
                      <div className="bg-green-50 pt-6 pb-4 px-6 flex flex-col items-center">
                        <div className="bg-green-100 p-4 rounded-full mb-3">
                          <ShieldCheck size={32} className="text-green-600" />
                        </div>
                        <h3 className="text-xl font-bold text-center mb-2 text-blue-600">
                          {t('this_phone_is_registered_in_our_system_since')}{' '}
                          {formatDateTime(registeredPhoneDetails.registration_date) || t('not_available')}{' '}
                          {t('and_no_report_has_been_filed_yet')}
                        </h3>
                      </div>

                      {/* Phone Image - تم تعديل هذا القسم لتقليل ارتفاع الصورة */}
                      {registeredPhoneDetails.phone_image_url && (
                        <div className="p-3 flex flex-col items-center">
                          <p className="text-blue-600 font-bold mb-2">{t('phone_image_label')}</p>
                          <img
                            src={registeredPhoneDetails.phone_image_url}
                            alt={t('phone_image_label')}
                            className="w-full max-w-xs h-32 object-contain rounded-xl border-2 border-slate-200 shadow-sm"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 font-family=%22sans-serif%22 font-size=%2214%22 fill=%22%23999%22%3ENo Image%3C/text%3E%3C/svg%3E';
                            }}
                          />
                        </div>
                      )}

                      {/* Phone Type */}
                      {registeredPhoneDetails.phone_type && (
                        <div className="px-6 pb-6 text-center">
                          <p className="text-blue-600 font-bold">{t('phone_type_label')}: <span className="font-normal">{registeredPhoneDetails.phone_type}</span></p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Report Image for Active Status */}
              {searchResult === 'found' && foundReportStatus === 'active' && (
                <div className="bg-white rounded-xl p-4 shadow-xl border border-slate-100">
                  <h3 className="text-lg font-bold text-blue-600 mb-2">{t('report_and_box_image')}</h3>
                  <div className="relative">
                    <div className="w-full h-auto rounded-lg bg-slate-50 flex items-center justify-center" style={{ minHeight: '100px' }}>
                      <p className="text-slate-600 text-center p-2 text-sm font-bold">
                        {t('privacy_notice_search')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Notify Owner Button - تم تعديله لإظهار خيارات متعددة */}
              {searchResult === 'found' && foundReportStatus === 'active' && (
                <div className="flex flex-col sm:flex-row gap-3 w-full">
                  {/* زر إرسال إشعار للمالك */}
                  <Button
                    onClick={handleNotifyOwner}
                    className="flex-1 h-14 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white transition-all duration-300 text-lg font-bold shadow-lg shadow-orange-500/30 rounded-xl flex items-center justify-center gap-2"
                    disabled={isNotifying}
                  >
                    {isNotifying ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>{t('processing')}</span>
                      </>
                    ) : (
                      t('notify_owner')
                    )}
                  </Button>
                  
                  {/* زر الواتساب - يظهر فقط إذا كان المالك من نوع gold_business أو gold_user وفعّل الواتساب */}
                  {ownerWhatsAppEnabled && (ownerRole === 'gold_business' || ownerRole === 'gold_user') && ownerWhatsAppNumber && (
                    <Button
                      onClick={handleWhatsAppContact}
                      className="flex-1 h-14 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white transition-all duration-300 text-lg font-bold shadow-lg shadow-green-500/30 rounded-xl flex items-center justify-center gap-2"
                      disabled={isCheckingWhatsApp}
                    >
                      {isCheckingWhatsApp ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          <span>{t('processing')}</span>
                        </>
                      ) : (
                        <>
                          <MessageCircle className="w-5 h-5" />
                          <span>{t('contact_via_whatsapp')}</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}

              {/* Not Registered Phone */}
              {searchResult === 'not_found' && !registeredPhoneDetails && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                  <p className="text-blue-600 text-lg text-center font-bold">
                    {t('phone_not_registered_register_now')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <AdsOfferSlider onClose={() => setShowUpgradeModal(false)} userId={userId} isUpgradePrompt={true} />
      )}
    </PageContainer>
  );
};

export default WelcomeSearch;
