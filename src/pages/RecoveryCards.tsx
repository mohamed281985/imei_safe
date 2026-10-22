import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import { Button } from '@/components/ui/button';
import { Download, Eye, ImageIcon, Loader2, AlertTriangle, FileText, BadgeCheck } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import axiosInstance from '@/services/axiosInterceptor';
import { toast } from 'sonner';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

const RecoveryCards: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [phones, setPhones] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeFileAction, setActiveFileAction] = useState<string | null>(null);
  const [phonePendingSale, setPhonePendingSale] = useState<any | null>(null);
  const [isMarkingSold, setIsMarkingSold] = useState(false);

  useEffect(() => {
    const fetchPhones = async () => {
      try {
        setLoading(true);
        const resp = await axiosInstance.get('/api/user-phones');
        const data = resp.data?.data || resp.data?.phones || resp.data || [];
        // normalize array
        const arr = Array.isArray(data) ? data : [];

        // Create an array of promises to fetch recovery card data in parallel
        const cardPromises = arr.map(async (p) => {
          try {
            const cardResp = await axiosInstance.get(`/api/recovery-card/${p.id}`);
            const cardData = cardResp.data?.data || cardResp.data || null;
            return { 
              ...p, 
              recoveryCardUrl: cardData?.qr_card_url || cardData?.qr_card_signed_url || null,
              receiptImageUrl: cardData?.receipt_image_url || null,
            };
          } catch (e) {
            console.error('Failed to load recovery card preview for', p.id, e);
            return { ...p, recoveryCardUrl: null };
          }
        });

        // Wait for all promises to resolve
        const out = await Promise.all(cardPromises);
        setPhones(out);
      } catch (e) {
        console.error('Failed to fetch user phones:', e);
        setError('فشل تحميل الهواتف. يرجى المحاولة لاحقًا.');
      } finally {
        setLoading(false);
      }
    };

    fetchPhones();
  }, []);

  const handleView = (id: string) => {
    const phone = phones.find((x) => x.id === id);
    navigate(`/phone-card/${id}`, { state: { phone } });
  };

  const handleLostReport = async (phone: any) => {
    try {
      let imei = phone.imei;
      if (!imei) {
        const response = await axiosInstance.get(`/api/user-phones/${phone.id}/imei`);
        imei = response.data?.imei;
      }
      if (!imei) throw new Error('رقم IMEI غير متوفر لهذه البطاقة');
      navigate('/report', { state: { imei } });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'تعذر فتح بلاغ الفقد');
    }
  };

  const handleMarkSold = async () => {
    if (!phonePendingSale || isMarkingSold) return;
    const phone = phonePendingSale;
    setIsMarkingSold(true);

    try {
      await axiosInstance.post('/api/update-phone-status', { ids: [phone.id], status: 'transferred' });

      if (phone.imei_encrypted) {
        try {
          await axiosInstance.post('/api/resolve-report', { imei_encrypted: phone.imei_encrypted });
        } catch (error: any) {
          if (error?.response?.status !== 404) throw error;
        }
      }

      setPhones(prev => prev.filter(item => item.id !== phone.id));
      setPhonePendingSale(null);
      toast.success(t('phones_status_updated'));
    } catch (error: any) {
      console.error('Failed to mark phone as sold:', error);
      toast.error(error?.response?.data?.error || t('phone_status_update_failed'));
    } finally {
      setIsMarkingSold(false);
    }
  };

const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = String(reader.result || '').split(',')[1];
    if (base64) resolve(base64);
    else reject(new Error('تعذر تجهيز الصورة للمشاركة'));
  };
  reader.onerror = () => reject(reader.error || new Error('تعذرت قراءة الصورة'));
  reader.readAsDataURL(blob);
});

const fetchImageFile = async (url: string, fileName: string) => {
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('انتهت صلاحية رابط الصورة. أعد تحميل الصفحة وحاول مرة أخرى.');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('تعذر التحقق من نوع الصورة');
  return new File([blob], fileName, { type: blob.type });
};

const downloadSingleImage = async (url: string | null, phoneId: string, kind: 'recovery' | 'receipt') => {
  if (!url) return;
  const fileName = kind === 'recovery' ? `IMEI_Recovery_${phoneId}.png` : `IMEI_Receipt_${phoneId}.jpg`;
  setActiveFileAction(`${phoneId}:${kind}:download`);

  try {
    const file = await fetchImageFile(url, fileName);
    if (Capacitor.isNativePlatform()) {
      await Filesystem.writeFile({
        path: fileName,
        data: await blobToBase64(file),
        directory: Directory.Documents,
      });
    } else {
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }
    toast.success(kind === 'recovery' ? 'تم تنزيل بطاقة الاسترداد' : 'تم تنزيل صورة الفاتورة');
  } catch (err: any) {
    console.error(`Failed to download ${kind} image:`, err);
    toast.error(err?.message || 'تعذر تنزيل الصورة');
  } finally {
    setActiveFileAction(null);
  }
};

  return (
    <PageContainer>
      <AppNavbar />
      <div className="mx-auto w-full max-w-7xl overflow-x-hidden px-4 py-8">
        <div className="mb-6 text-center">
          <h1 className="text-4xl font-bold text-slate-800 mb-2">بطاقات الاسترداد</h1>
          <p className="text-slate-600">إدارة بطاقات استرداد أجهزتك وحمايتها</p>
        </div>
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-imei-cyan mb-4" />
            <p className="text-slate-600">جاري تحميل بطاقات الاسترداد...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-6 rounded-xl">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="mr-3">
                <h3 className="text-sm font-medium text-red-800">حدث خطأ</h3>
                <div className="mt-1 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {phones.map((p) => (
              <div key={p.id} className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.16)] transition-shadow duration-300 hover:shadow-[0_12px_36px_rgba(15,23,42,0.24)]">
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3">
                  <div className="min-w-0">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.3)]">
                      {p.recoveryCardUrl ? (
                        <img src={p.recoveryCardUrl} alt="Recovery Card" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-white">
                          <ImageIcon className="h-8 w-8 text-white/70" />
                          <span className="text-sm font-bold">لا توجد بطاقة</span>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6 text-center text-sm font-bold text-white">بطاقة الاسترداد</div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => void downloadSingleImage(p.recoveryCardUrl, p.id, 'recovery')}
                      disabled={!p.recoveryCardUrl || activeFileAction !== null}
                      className="mt-2 h-10 w-full gap-1 bg-teal-700 px-2 text-sm font-bold text-white shadow-sm hover:bg-teal-800"
                    >
                      {activeFileAction === `${p.id}:recovery:download` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      <span className="truncate">تنزيل البطاقة</span>
                    </Button>
                  </div>

                  <div className="min-w-0">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.3)]">
                      {p.receiptImageUrl ? (
                        <img src={p.receiptImageUrl} alt={`فاتورة ${p.phone_type || 'الهاتف'}`} className="absolute inset-0 h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center text-white">
                          <FileText className="h-8 w-8 text-white/70" />
                          <span className="text-sm font-bold">لا توجد فاتورة محفوظة</span>
                        </div>
                      )}
                      {p.receiptImageUrl && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6 text-center text-sm font-bold text-white">فاتورة الهاتف</div>}
                    </div>
                    <Button
                      type="button"
                      onClick={() => void downloadSingleImage(p.receiptImageUrl, p.id, 'receipt')}
                      disabled={!p.receiptImageUrl || activeFileAction !== null}
                      className="mt-2 h-10 w-full gap-1 bg-orange-600 px-2 text-sm font-bold text-white shadow-sm hover:bg-orange-700"
                    >
                      {activeFileAction === `${p.id}:receipt:download` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      <span className="truncate">تنزيل الفاتورة</span>
                    </Button>
                  </div>
                </div>
                
                <div className="p-3 pt-2">
                  <div className="mb-2">
                    <h3 className="text-lg font-bold text-slate-800 mb-1">{p.phone_type || 'هاتف'}</h3>
                    <p className="text-xs font-bold text-slate-700">IMEI: {p.imei_masked || 'غير متوفر'}</p>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      onClick={() => handleView(p.id)}
                      className="h-10 bg-imei-cyan font-bold text-black shadow-md hover:bg-imei-cyan/90"
                    >
                      <Eye size={16} className="mr-2" /> عرض البطاقة
                    </Button>

                    <Button
                      type="button"
                      onClick={() => handleLostReport(p)}
                      className="h-10 !bg-red-600 !text-white font-bold shadow-md hover:!bg-red-700"
                    >
                      <AlertTriangle size={16} className="mr-2" /> إخطار فقد
                    </Button>

                    <Button
                      type="button"
                      onClick={() => setPhonePendingSale(p)}
                      disabled={isMarkingSold}
                      className="h-10 !bg-amber-600 !text-white font-bold shadow-md hover:!bg-amber-700"
                    >
                      <BadgeCheck size={16} className="mr-2" /> {t('mark_phone_sold')}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <AlertDialog open={!!phonePendingSale} onOpenChange={(open) => !open && !isMarkingSold && setPhonePendingSale(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('mark_phone_sold')}</AlertDialogTitle>
            <AlertDialogDescription>{t('mark_phone_sold_confirmation')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMarkingSold}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleMarkSold(); }} disabled={isMarkingSold}>
              {isMarkingSold ? <Loader2 className="h-4 w-4 animate-spin" /> : t('mark_phone_sold')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
};

export default RecoveryCards;
