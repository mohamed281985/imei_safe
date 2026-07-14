import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import { MapPin, Link2, ShieldCheck, ArrowLeft, MessageCircle, Navigation2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FoundByQrToken: React.FC = () => {
  const { qrToken } = useParams<{ qrToken: string }>();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phoneType, setPhoneType] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [hasReport, setHasReport] = useState<boolean>(false);
  const [phoneImageUrl, setPhoneImageUrl] = useState<string | null>(null);
  const [notifyState, setNotifyState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [locationState, setLocationState] = useState<'idle' | 'sending' | 'done'>('idle');

  useEffect(() => {
    const fetchData = async () => {
      if (!qrToken) {
        setError('رمز QR غير صالح.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/found/${encodeURIComponent(qrToken)}`);
        const result = await response.json();
        if (!response.ok || !result?.success) {
          const message = result?.error || 'تعذر العثور على معلومات الهاتف.';
          setError(message);
          return;
        }

        setPhoneType(result.data.phone_type || null);
        setStatus(result.data.status || null);
        setHasReport(Boolean(result.data.has_active_report));
        setPhoneImageUrl(result.data.phone_image_url || null);
      } catch (err) {
        console.error('FoundByQrToken fetch error:', err);
        setError('حدث خطأ أثناء تحميل حالة الهاتف.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [qrToken]);

  const notifyOwner = async () => {
    if (!qrToken) return;
    setNotifyState('sending');
    try {
      const response = await fetch(`/api/found/${encodeURIComponent(qrToken)}/notify-owner`, {
        method: 'POST'
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'فشل إرسال الإشعار');
      }
      setNotifyState('done');
    } catch (err) {
      console.error('notifyOwner error:', err);
      setError('تعذر إرسال الإشعار إلى المالك.');
      setNotifyState('idle');
    }
  };

  const sendLocation = async () => {
    if (!qrToken || !navigator.geolocation) {
      setError('الموقع الجغرافي غير متاح.');
      return;
    }

    setLocationState('sending');
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const response = await fetch(`/api/found/${encodeURIComponent(qrToken)}/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        });
        const result = await response.json();
        if (!response.ok || !result?.success) {
          throw new Error(result?.error || 'فشل مشاركة الموقع');
        }
        setLocationState('done');
      } catch (err) {
        console.error('sendLocation error:', err);
        setError('تعذر إرسال الموقع إلى المالك.');
        setLocationState('idle');
      }
    }, (error) => {
      console.error('Geolocation error:', error);
      setError('تعذر الحصول على الموقع الجغرافي.');
      setLocationState('idle');
    });
  };

  return (
    <PageContainer>
      <AppNavbar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col gap-4">
          <h1 className="text-3xl font-bold text-imei-cyan">تأكيد الهاتف المفقود</h1>
          <p className="text-gray-300 leading-relaxed">
            يتم استخدام هذا الرابط عندما يتم مسح رمز QR الموجود على بطاقة الاسترداد. لا يتم عرض أي بيانات حساسة هنا.
          </p>
        </div>

        {loading ? (
          <div className="rounded-3xl bg-white/5 border border-imei-cyan/20 p-8 text-center text-white">جاري التحقق...</div>
        ) : error ? (
          <div className="rounded-3xl bg-red-500/10 border border-red-500/20 p-8 text-center text-red-100">{error}</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="rounded-3xl bg-white/5 border border-imei-cyan/20 p-6 shadow-lg">
              {phoneImageUrl && (
                <img src={phoneImageUrl} className="w-full rounded-3xl object-cover mb-6" alt="Phone" />
              )}
              <div className="space-y-4">
                <div className="rounded-3xl bg-imei-darker/80 p-5">
                  <p className="text-sm text-gray-400">حالة الهاتف</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{status || 'مُسجّل'}</p>
                </div>
                <div className="rounded-3xl bg-imei-darker/80 p-5">
                  <p className="text-sm text-gray-400">نوع الهاتف</p>
                  <p className="mt-2 text-xl font-semibold text-white">{phoneType || 'غير متوفّر'}</p>
                </div>
                <div className="rounded-3xl bg-imei-darker/80 p-5">
                  <p className="text-sm text-gray-400">حالة البلاغ</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {hasReport ? 'مبلغ عنه مفقود' : 'غير مبلَّغ عنه'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-imei-cyan/20 bg-white/5 p-6 shadow-lg">
                <h2 className="text-xl font-semibold text-white mb-4">ماذا يمكنك أن تفعل الآن</h2>
                <div className="space-y-4">
                  <Button className="w-full" onClick={notifyOwner} disabled={notifyState === 'sending'}>
                    <MessageCircle size={18} /> {notifyState === 'done' ? 'تم إعلام المالك' : 'أخبر المالك'}
                  </Button>
                  <Button className="w-full" variant="secondary" onClick={sendLocation} disabled={locationState === 'sending'}>
                    <Navigation2 size={18} /> {locationState === 'done' ? 'تم إرسال الموقع' : 'أرسل الموقع الحالي'}
                  </Button>
                </div>
              </div>
              <div className="rounded-3xl border border-imei-cyan/20 bg-imei-darker/80 p-6 text-gray-300">
                <div className="flex items-center gap-3 mb-4">
                  <Link2 size={18} className="text-imei-cyan" />
                  <span className="text-base font-semibold text-white">رابط الاسترداد</span>
                </div>
                <p className="break-all">https://app.imei-safe.me/found/{qrToken}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8">
          <Button variant="outline" onClick={() => navigate('/')}> <ArrowLeft size={18} /> العودة إلى الصفحة الرئيسية</Button>
        </div>
      </div>
    </PageContainer>
  );
};

export default FoundByQrToken;
