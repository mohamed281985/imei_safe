import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axiosInstance from '@/services/axiosInterceptor';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import { Download, RefreshCcw, Share2, ShieldCheck, Copy, Image as ImageIcon, Smartphone, Info, QrCode } from 'lucide-react';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const RecoveryCard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [phoneType, setPhoneType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phoneImageUrl, setPhoneImageUrl] = useState<string | null>(null);
  const [imeiMasked, setImeiMasked] = useState<string | null>(null);
  const location = useLocation();

  const fetchCard = async (refresh = false) => {
    if (!id) return;
    setError(null);
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Use axiosInstance which already attaches the auth token via interceptor
      const resp = await (refresh
        ? axiosInstance.post(`/api/recovery-card/${id}/refresh`)
        : axiosInstance.get(`/api/recovery-card/${id}`)
      );
      const result = resp.data;
      if (!result || !result.success) {
        const message = (result && (result.error || result.message)) || 'فشل في جلب بطاقة الاسترداد';
        setError(message);
        toast({ title: 'خطأ', description: message, variant: 'destructive' });
        return;
      }

      const data = result.data;
      setCardUrl(data.qr_card_url || null);
      setDeviceCode(data.device_code || null);
      setQrToken(data.qr_token || null);
      setStatus(data.status || null);
      setPhoneType(data.phone_type || null);
    } catch (err) {
      console.error('RecoveryCard fetch error:', err);
      const message = err?.response?.data?.error || (err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
      setError(message);
      toast({ title: 'خطأ', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // use phone data passed via navigation state when available
    try {
      const statePhone = (location && (location as any).state && (location as any).state.phone) || null;
      if (statePhone) {
        setPhoneType(statePhone.phone_type || statePhone.phoneType || null);
        setPhoneImageUrl(statePhone.phone_image_url || statePhone.phone_image || null);
        setImeiMasked(statePhone.imei_masked || null);
      }
    } catch (e) {
      // ignore
    }

    fetchCard();
  }, [id]);

  const handleShare = async () => {
    if (!cardUrl || !qrToken) {
      toast({ title: 'غير متوفر', description: 'لم يتم تحميل البطاقة بعد.', variant: 'destructive' });
      return;
    }

    const shareData = {
      title: 'بطاقة هاتفي - IMEI SAFE',
      text: `استخدم رمز الجهاز التالي للاسترداد: ${deviceCode}`,
      url: `https://app.imei-safe.me/found/${qrToken}`
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        toast({ title: 'تم المشاركة', description: 'تمت مشاركة بطاقة الاسترداد بنجاح.' });
      } catch (e) {
        console.warn('Share failed:', e);
        toast({ title: 'تعذر المشاركة', description: 'لا يمكن استخدام واجهة المشاركة الآن.' });
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(shareData.url);
      toast({ title: 'تم النسخ', description: 'تم نسخ رابط QR إلى الحافظة.' });
    } catch {
      toast({ title: 'تعذر النسخ', description: 'يرجى نسخ الرابط يدوياً.', variant: 'destructive' });
    }
  };

  const handleDownload = async () => {
    if (!cardUrl) return;
    try {
      // التحقق من تشغيل التطبيق على جهاز محمول
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      if (isMobile) {
        // استخدام Capacitor للتنزيل على الأجهزة المحمولة
        const response = await fetch(cardUrl);
        const blob = await response.blob();
        
        // الحصول على اسم الملف المطلوب
        const fileName = `IMEI_Recovery_${id || 'unknown'}.png`;
        
        try {
          // حفظ الملف في مجلد المستندات على Android
          await Filesystem.writeFile({
            path: fileName,
            data: blob,
            directory: Directory.Documents
          });
          
          // عرض رسالة نجاح
          toast({ title: 'تم الحفظ', description: 'تم حفظ بطاقة الاسترداد بنجاح.' });
        } catch (e) {
          console.error('فشل حفظ الملف في مجلد المستندات', e);
          throw new Error('فشل حفظ الملف. يرجى المحاولة مرة أخرى');
        }
      } else {
        // للويب، نستخدم الطريقة الأصلية
        const a = document.createElement('a');
        a.href = cardUrl;
        a.download = `IMEI_Recovery_${id || 'unknown'}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        toast({ title: 'تم الحفظ', description: 'تم حفظ بطاقة الاسترداد بنجاح.' });
      }
    } catch (err) {
      console.error('فشل التنزيل', err);
      toast({ title: 'خطأ', description: `فشل تنزيل البطاقة: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`, variant: 'destructive' });
      
      // محاولة فتح الصورة في تبويب جديد كخيار بديل
      const fallback = window.confirm('فشل تنزيل البطاقة. هل تفتحها في صفحة جديدة لتتمكن من حفظها يدوياً؟');
      if (fallback) {
        window.open(cardUrl, '_blank');
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'تم النسخ', description: 'تم نسخ النص إلى الحافظة.' });
    }).catch(() => {
      toast({ title: 'فشل النسخ', description: 'لم يتمكن من نسخ النص.', variant: 'destructive' });
    });
  };

  // دالة لإخفاء جميع أرقام الـ IMEI إلا آخر 4 أرقام
  const maskImei = (imei: string | null): string => {
    if (!imei) return 'غير متوفر';
    // إذا كان الـ IMEI يحتوي على نجوم بالفعل، نستخدمه كما هو
    if (imei.includes('*')) return imei;
    // إذا كان الـ IMEI أقل من 4 أرقام، نعرضه بالكامل
    if (imei.length < 4) return imei;
    // نحتفظ بآخر 4 أرقام فقط ونخفي الباقي بنجوم
    return '*'.repeat(imei.length - 4) + imei.slice(-4);
  };

  return (
    <PageContainer>
      <AppNavbar />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">بطاقة هاتفي</h1>
          <p className="text-sm text-slate-600 max-w-2xl mx-auto">
            هذه الصفحة تعرض بطاقة الاسترداد الآمنة الخاصة بك. يمكن إنشاء البطاقة مرة واحدة ومن ثم تحديثها عند الحاجة.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-200 bg-white shadow-md">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2 text-slate-700">
                  <Smartphone size={18} />
                  <CardTitle className="text-base font-bold">معلومات الهاتف</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                    <p className="text-xs uppercase text-slate-500 mb-1 font-bold">نوع الهاتف</p>
                    <div className="flex items-center gap-2">
                      <Smartphone size={14} className="text-slate-600" />
                      <p className="text-sm font-bold text-slate-800">{phoneType || 'غير محدد'}</p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                    <p className="text-xs uppercase text-slate-500 mb-1 font-bold">حالة التسجيل</p>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${status === 'active' ? 'bg-green-500' : status === 'pending' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                      <p className="text-sm font-bold text-slate-800">{status || 'غير معروف'}</p>
                    </div>
                  </div>
                  {imeiMasked && (
                    <div className="rounded-lg bg-slate-50 p-2 border border-slate-100 md:col-span-2">
                      <p className="text-xs uppercase text-slate-500 mb-1 font-bold">رقم IMEI</p>
                      <p className="text-sm font-bold text-slate-800">{maskImei(imeiMasked)}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-md overflow-hidden">
              <CardContent className="p-0">
                {loading ? (
                  <div className="h-[400px] flex items-center justify-center text-slate-500">
                    <div className="flex flex-col items-center">
                      <RefreshCcw className="h-8 w-8 animate-spin text-slate-400 mb-2" />
                      <p className="text-sm">جاري التحميل...</p>
                    </div>
                  </div>
                ) : cardUrl ? (
                  <div className="relative">
                    <img src={cardUrl} alt="QR Recovery Card" className="w-full object-contain" />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 flex justify-center gap-2">
                      <Button 
                        variant="secondary" 
                        size="sm"
                        onClick={() => window.open(cardUrl, '_blank')}
                        className="bg-white/90 hover:bg-white text-slate-800 border-slate-200"
                      >
                        <ImageIcon size={16} className="ml-2" />
                        عرض بحجم أكبر
                      </Button>
                    
                    </div>
                  </div>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-slate-500">
                    {error || 'لم يتم إنشاء البطاقة بعد.'}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-slate-200 bg-white shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-slate-600 font-bold">رمز الجهاز</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <p className="text-xl font-bold text-slate-800 tracking-[0.2em]">{deviceCode || 'N/A'}</p>
                    {deviceCode && (
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(deviceCode)} className="text-slate-600 hover:text-slate-800 hover:bg-slate-100">
                        <Copy size={16} />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-slate-600 font-bold">رابط الاسترداد</CardTitle>
                </CardHeader>
                <CardContent>
                  {qrToken ? (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-700 break-all font-bold">{`https://app.imei-safe.me/found/${qrToken}`}</p>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => copyToClipboard(`https://app.imei-safe.me/found/${qrToken}`)}
                          className="text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                        >
                          <Copy size={14} className="ml-2" />
                          نسخ الرابط
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">لم يتم إنشاؤه بعد</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {phoneImageUrl && (
              <Card className="border-slate-200 bg-white shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-slate-600 font-bold">صورة الهاتف</CardTitle>
                </CardHeader>
                <CardContent>
                  <img src={phoneImageUrl} alt="phone" className="w-36 h-36 object-cover rounded-md border border-slate-200" />
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card className="border-slate-200 bg-white shadow-md">
              <CardHeader>
                <CardTitle className="text-base text-slate-800 font-bold">معلومات مهمة</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-xs text-slate-600">
                  <li className="flex items-start">
                    <span className="text-slate-400 ml-2 mt-0.5">•</span>
                    <span className="font-bold">تُنشأ البطاقة تلقائياً عند أول تسجيل هاتف.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-slate-400 ml-2 mt-0.5">•</span>
                    <span className="font-bold">إذا لم تتوفر البطاقة، سيتم إنشاؤها عند فتح هذه الصفحة.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-slate-400 ml-2 mt-0.5">•</span>
                    <span className="font-bold">سيتم تجديد البطاقة عند الضغط على "تحديث البطاقة".</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-slate-400 ml-2 mt-0.5">•</span>
                    <span className="font-bold">لا يتم طباعة أي بيانات حساسة في رمز الاستجابة السريعة.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default RecoveryCard;
