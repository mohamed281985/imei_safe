import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { createNotification } from '../lib/notificationService';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import { Phone, Calendar, MapPin, User, Shield, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import ImageViewer from '@/components/ImageViewer';
import { useScrollToTop } from '@/hooks/useScrollToTop';

// واجهة لبيانات الهاتف
interface PhoneReport {
  id: string;
  imei: string;
  owner_name: string;
  owner_id?: string; // معرف المستخدم/المالك
  phone_type?: string;
  phone_number?: string;
  loss_time: string;
  loss_location: string;
  status: 'active' | 'resolved' | 'pending';
  phone_image_url?: string;
  contact_phone?: string;
  id_last6?: string;
  email?: string;
  finder_phone?: string; // حقل finder_phone
}

// دوال لإخفاء المعلومات الحساسة
const maskName = (name: string | undefined | null): string => {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  const maskedWords = words.map(word => {
    if (word.length <= 1) return word;
    return '******' + word.charAt(0);
  });
  return maskedWords.join('          ');
};

const maskPhoneNumber = (phoneNumber: string | undefined | null): string => {
  if (!phoneNumber || phoneNumber.length <= 2) return phoneNumber || '';
  const lastTwoDigits = phoneNumber.slice(-2);
  return lastTwoDigits + '*'.repeat(Math.min(phoneNumber.length - 2, 8));
};

const maskIdNumber = (idNumber: string | undefined | null): string => {
  if (!idNumber || idNumber.length <= 4) return idNumber || '';
  const lastFourDigits = idNumber.slice(-4);
  return lastFourDigits + '*'.repeat(Math.min(idNumber.length - 4, 6));
};

const PhoneDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  useScrollToTop();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [phone, setPhone] = useState<PhoneReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showFinderContact, setShowFinderContact] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isNotifying, setIsNotifying] = useState(false);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);

  // دالة لجلب بيانات الهاتف
  const fetchPhoneDetails = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('phone_reports')
        .select('*')
        .or(`id.eq.${id},imei.eq.${id}`)
        .maybeSingle();

      if (error) {
        console.error('Error fetching phone details:', error);
        toast({ title: t('error'), description: t('error_fetching_phone_details'), variant: 'destructive' });
        setPhone(null);
      } else {
        setPhone(data as PhoneReport);
      }
    } catch (err) {
      console.error('Error:', err);
      toast({ title: t('error'), description: t('error_occurred'), variant: 'destructive' });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchPhoneDetails();
  }, [id, t, toast]);

  const handlePayment = () => {
    setShowPaymentDialog(true);
  };

  const processPayment = () => {
    if (!phoneNumber) {
      toast({ title: t('error'), description: t('please_enter_phone'), variant: 'destructive' });
      return;
    }

    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setShowPaymentDialog(false);
      setShowFinderContact(true);
      toast({ title: t('payment_success'), description: t('payment_processed') });
    }, 1500);
  };

  const handleNotifyOwner = async () => {
    if (!phone || !currentUserId) {
      toast({ title: t('error'), description: t('must_login_to_contact_owner'), variant: 'destructive' });
      return;
    }

    setIsNotifying(true);
    const ownerEmail = phone.email;
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
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ userId: currentUserId })
      });
      const { finderPhone, error } = await response.json();

      if (error || !finderPhone) {
        throw new Error(error || 'فشل في الحصول على رقم هاتف الواجد.');
      }

      console.log('Finder phone retrieved:', finderPhone);

      // 2. تحديث جدول phone_reports بوضع رقم هاتف الواجد في عمود finder_phone باستخدام IMEI
      const updateResponse = await fetch('https://imei-safe.me/api/update-finder-phone-by-imei', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          imei: phone.imei,
          finderPhone: finderPhone,
          ownerName: phone.owner_name // إرسال اسم المالك للبريد الإلكتروني
        })
      });
      const updateResult = await updateResponse.json();

      if (!updateResponse.ok || !updateResult.success) {
        console.error('Failed to update finder phone:', updateResult.error);
        toast({ title: 'تنبيه', description: 'تم العثور على الهاتف لكن لم يتم حفظ رقمك في قاعدة البيانات.', variant: 'destructive' });
      } else {
        console.log('Finder phone saved to database successfully');
        
        // حفظ البيانات في جدول notifications
        try {
          // جلب email واللغة لصاحب الهاتف من السيرفر باستخدام imei
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
              body: JSON.stringify({ imei: phone.imei })
            });
            const result = await response.json();
            if (!response.ok || !result?.email) {
              throw new Error(result?.error || 'لم يتم العثور على سجل للهاتف في قاعدة البيانات');
            }
            ownerEmailForNotification = result.email;
            ownerLanguageForNotification = result.language || null;
            console.log('Found email from phone report:', ownerEmailForNotification);
          } catch (err) {
            console.error('Error finding email for notification:', err);
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

          const notificationPayload = { 
            title: localizedContent.title, 
            body: localizedContent.body,
            user_id: currentUserId, // لم نعد نستخدم user_id في الإشعارات
            finder_phone: finderPhone,
            imei: phone.imei,
            email: ownerEmailForNotification, // بريد صاحب الهاتف
            notification_type: 'phone_found',
            is_read: false,
            created_at: new Date().toISOString() 
          };

          console.log('Attempting to save notification with data:', notificationPayload);
          console.log('Owner email for notification:', ownerEmailForNotification);
          console.log('Current user email:', user?.email);

          // استخدام دالة createNotification الجديدة
          let notificationData, notificationError;
          try {
            const result = await createNotification(notificationPayload);
            notificationData = result;
            console.log('Notification saved successfully:', notificationData);
          } catch (error) {
            notificationError = error;
            console.error('Error saving notification:', error);
            console.error('Error details:', {
              message: error.message,
              code: error.code,
              hint: error.hint,
              details: error.details
            });
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
          console.error('Error saving notification:', saveError);
          if (saveError instanceof Error) {
            toast({ 
              title: 'خطأ', 
              description: `حدث خطأ أثناء حفظ الإشعار: ${saveError.message}`, 
              variant: 'destructive' 
            });
          }
        }
        
        // 3. إعادة جلب بيانات الهاتف لتحديث الواجهة
        await fetchPhoneDetails();
        // عرض مربع حوار معلومات الاتصال بعد الإرسال الناجح
        setShowFinderContact(true);
      }
      
      // ⭐ تم نقل منطق إرسال الإشعارات والبريد الإلكتروني إلى الخادم
      // سيقوم الخادم الآن بإرسال الإشعار والبريد الإلكتروني بعد تحديث قاعدة البيانات بنجاح.
      // هذا يضمن أن البيانات محدثة قبل إرسال التنبيهات.
      
      notificationSent = updateResult.success; // نعتبر الإشعار ناجحًا إذا نجح طلب الخادم
      emailSent = updateResult.success; // نفس المنطق للبريد الإلكتروني

      if (notificationSent || emailSent) {
        toast({ title: t('notification_sent'), description: t('owner_notified_success') });
      } else {
        toast({ title: 'تعذر إرسال التنبيه', description: 'لم يتم العثور على بيانات تواصل صالحة للمالك.', variant: 'destructive' });
      }
    } catch (error) {
      console.error(error);
      toast({ title: t('error'), description: error.message || 'حدث خطأ أثناء محاولة إبلاغ المالك.', variant: 'destructive' });
    } finally {
      setIsNotifying(false);
    }
  };

  if (isLoading) {
    return (
      <PageContainer>
        <AppNavbar />
        <div className="my-6 text-center text-white">{t('loading')}...</div>
      </PageContainer>
    );
  }

  if (!phone) {
    return (
      <PageContainer>
        <AppNavbar />
        <div className="my-6 text-center">
          <h1 className="text-white text-xl">{t('phone_not_found')}</h1>
          <button onClick={() => navigate(-1)} className="mt-4 flex items-center text-imei-cyan hover:underline">
            <ArrowLeft size={16} className="mr-1" />
            {t('go_back')}
          </button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <AppNavbar />
      <div className="my-6">
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center text-imei-cyan hover:underline">
          <ArrowLeft size={16} className="mr-1" />
          {t('go_back')}
        </button>

        <h1 className="text-black text-2xl font-bold mb-6">{t('phone_details')}</h1>

        {/* حالة الهاتف */}
        <div className={`rounded-md p-4 mb-6 ${phone.status === 'resolved' ? 'bg-green-900 bg-opacity-20 border border-green-500' : 'bg-red-900 bg-opacity-20 border border-red-500'}`}>
          <div className="flex items-center justify-between">
            <div className="text-white">
              <span className="font-medium">{t('status')}: </span>
              <span className={`${phone.status === 'resolved' ? 'text-green-400' : 'text-red-600'}`}>
                {phone.status === 'resolved' ? t('phone_found') : t('phone_lost_message')}
              </span>
            </div>
            {phone.status === 'resolved' ? (
              <CheckCircle size={20} className="text-green-700" />
            ) : (
              <AlertTriangle size={20} className="text-red-700" />
            )}
          </div>
        </div>

        {/* صورة الهاتف */}
        <div className="mb-6">
          <div className="bg-imei-darker rounded-xl overflow-hidden border border-imei-cyan border-opacity-20">
            {phone.phone_image_url ? (
              <button
                onClick={() => {
                  setSelectedImage(phone.phone_image_url);
                  setIsImageViewerOpen(true);
                }}
                className="w-full cursor-pointer"
              >
                <img
                  src={phone.phone_image_url}
                  alt={t('phone_image')}
                  className="w-full h-64 object-contain p-4 transition-transform hover:scale-[1.02]"
                />
              </button>
            ) : (
              <div className="w-full h-64 flex items-center justify-center">
                <Phone size={80} className="text-imei-cyan" />
              </div>
            )}
          </div>
        </div>

        {/* رقم IMEI */}
        <div className="card-container mb-6">
          <h3 className="text-imei-cyan font-medium mb-2">IMEI</h3>
          <div className="bg-imei-dark p-3 rounded-md">
            <p className="text-white font-mono text-center text-xl">
              {(() => {
                try {
                  if (!phone.imei) return 'N/A';
                  
                  // محاولة فك التشفير
                  if (typeof phone.imei === 'string' && (phone.imei.includes('encryptedData') || /^[A-Za-z0-9+/=]+$/.test(phone.imei))) {
                    const { decryptIMEI } = require('@/lib/imeiCrypto');
                    const decrypted = decryptIMEI(phone.imei);
                    return /^\d{14,16}$/.test(decrypted) ? decrypted : phone.imei;
                  }
                  return phone.imei;
                } catch (e) {
                  return phone.imei || 'N/A';
                }
              })()}
            </p>
          </div>
        </div>

        {/* معلومات الفقدان */}
        <div className="card-container mb-6">
          <h3 className="text-imei-cyan font-medium mb-3">{t('loss_info')}</h3>
          <div className="space-y-4">
            <div className="flex items-center">
              <User size={18} className="text-imei-cyan mr-2" />
              <div>
                <span className="text-gray-400 text-sm block">{t('owner_name')}</span>
                <span className="text-white">{maskName(phone.owner_name)}</span>
              </div>
            </div>

            <div className="flex items-center">
              <Phone size={18} className="text-imei-cyan mr-2" />
              <div>
                <span className="text-gray-400 text-sm block">{t('phone_number')}</span>
                <span className="text-white">{maskPhoneNumber(phone.phone_number)}</span>
              </div>
            </div>

            <div className="flex items-center">
              <Shield size={18} className="text-imei-cyan mr-2" />
              <div>
                <span className="text-gray-400 text-sm block">{t('id_number')}</span>
                <span className="text-white">{maskIdNumber(phone.id_last6)}</span>
              </div>
            </div>

            <div className="flex items-center">
              <MapPin size={18} className="text-imei-cyan mr-2" />
              <div>
                <span className="text-gray-400 text-sm block">{t('loss_location')}</span>
                <span className="text-white">{phone.loss_location}</span>
              </div>
            </div>

            <div className="flex items-center">
              <Calendar size={18} className="text-imei-cyan mr-2" />
              <div>
                <span className="text-gray-400 text-sm block">{t('loss_time')}</span>
                <span className="text-white">{new Date(phone.loss_time).toLocaleDateString(language)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* أزرار التواصل */}
        {phone.status === 'active' && (
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <Button
              onClick={handleNotifyOwner}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
              disabled={isNotifying}
            >
              {isNotifying ? t('processing') : t('notify_owner')}
            </Button>
          </div>
        )}

        {/* مربع حوار الدفع */}
        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('payment_required')}</DialogTitle>
              <DialogDescription>{t('enter_your_phone')}</DialogDescription>
            </DialogHeader>
            <Input
              type="tel"
              placeholder={t('phone_placeholder')}
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
            <DialogFooter>
              <Button onClick={() => setShowPaymentDialog(false)} variant="outline">
                {t('cancel')}
              </Button>
              <Button onClick={processPayment} disabled={processing}>
                {processing ? t('processing') : t('confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* مربع حوار معلومات الاتصال */}
        <Dialog open={showFinderContact} onOpenChange={setShowFinderContact}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('finder_contact_info')}</DialogTitle>
              <DialogDescription>{t('contact_with_finder')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-center">
                {t('contact_phone')}: {phone.finder_phone || t('not_available')}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowFinderContact(false)}>
                {t('close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* مكون عارض الصور */}
        <ImageViewer
          imageUrl={selectedImage || ''}
          isOpen={isImageViewerOpen}
          onClose={() => setIsImageViewerOpen(false)}
        />
      </div>
    </PageContainer>
  );
};

export default PhoneDetails;
