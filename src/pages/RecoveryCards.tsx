import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import { Button } from '@/components/ui/button';
import { Download, Eye, ImageIcon, Loader2, AlertTriangle } from 'lucide-react';
import axiosInstance from '@/services/axiosInterceptor';
import { toast } from 'sonner';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const RecoveryCards: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [phones, setPhones] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
              recoveryCardUrl: cardData?.qr_card_url || cardData?.qr_card_signed_url || null 
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

const downloadImage = async (url: string | null, phoneId: string) => {
  if (!url) return;

  try {
    setDownloadingId(phoneId);

    const response = await fetch(url);
    const blob = await response.blob();

    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve((reader.result as string).split(',')[1]);
      };
      reader.readAsDataURL(blob);
    });

    const fileName = `IMEI_Recovery_${phoneId}.png`;

    await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
    });

    const fileUri = await Filesystem.getUri({
      directory: Directory.Cache,
      path: fileName,
    });

    await Share.share({
      title: 'بطاقة الاسترداد',
      text: 'بطاقة استرداد الهاتف',
      url: fileUri.uri,
      dialogTitle: 'مشاركة أو حفظ البطاقة',
    });

  } catch (err: any) {
    console.error(err);
    toast.error(err?.message || 'فشل مشاركة البطاقة');
  } finally {
    setDownloadingId(null);
  }
};
  return (
    <PageContainer>
      <AppNavbar />
      <div className="w-full px-4 py-8 mx-[1rem]">
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
              <div key={p.id} className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300 border border-slate-100 w-full">
                <div className="h-40 bg-slate-50 flex items-center justify-center p-4">
                  {p.recoveryCardUrl ? (
                    <img src={p.recoveryCardUrl} alt="Recovery Card" className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <div className="text-center">
                      <ImageIcon className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">لا توجد بطاقة</p>
                    </div>
                  )}
                </div>
                
                <div className="p-4">
                  <div className="mb-3">
                    <h3 className="text-lg font-bold text-slate-800 mb-1">{p.phone_type || 'هاتف'}</h3>
                    <p className="text-xs font-bold text-slate-700">IMEI: {p.imei_masked || 'غير متوفر'}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      onClick={() => handleView(p.id)} 
                      className="bg-imei-cyan hover:bg-imei-cyan/90 text-black font-medium shadow-md text-sm h-9"
                    >
                      <Eye size={16} className="mr-2" /> عرض
                    </Button>
                    
                    <Button 
                      onClick={() => downloadImage(p.recoveryCardUrl, p.id)} 
                      disabled={!p.recoveryCardUrl || downloadingId === p.id}
                      variant="outline"
                      className="text-imei-cyan border-imei-cyan/30 hover:bg-imei-cyan/10 font-medium text-sm h-9"
                    >
                      {downloadingId === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Download size={16} className="mr-2" />
                      )}
                      تنزيل
                    </Button>

                    <Button
                      type="button"
                      onClick={() => handleLostReport(p)}
                      className="col-span-2 !bg-red-600 !text-white hover:!bg-red-700 font-medium text-sm h-9 shadow-md"
                    >
                      <AlertTriangle size={16} className="mr-2" /> إخطار فقد
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
};

export default RecoveryCards;
