import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import { MapPin, Link2, ShieldCheck, ArrowLeft, MessageCircle, Navigation2, Phone } from 'lucide-react';
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
  const [ownerPhone, setOwnerPhone] = useState<string>('');
  const [whatsappNumber, setWhatsappNumber] = useState<string>('');
  const [showContactOptions, setShowContactOptions] = useState(false);
  const [notifyState, setNotifyState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [locationState, setLocationState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [finderPhone, setFinderPhone] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [contactState, setContactState] = useState<'idle' | 'sending' | 'done'>('idle');
  const turnstileRef = useRef<HTMLDivElement>(null);

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

        const phoneData = result.data || result;
        setPhoneType(phoneData.phone_type || null);
        setStatus(phoneData.status || null);
        setHasReport(Boolean(
          result.reported ||
          result.has_active_report ||
          phoneData.reported ||
          phoneData.has_active_report ||
          /مفقود|مبلغ عنه|lost|missing/i.test(String(phoneData.status || result.status || ''))
        ));
        setPhoneImageUrl(phoneData.phone_image_url || null);
        setOwnerPhone(String(
          phoneData.owner_phone ||
          phoneData.phone ||
          result.owner_phone ||
          result.phone ||
          phoneData.whatsapp_number ||
          result.whatsapp_number ||
          ''
        ).replace(/\D/g, ''));
        setWhatsappNumber(
          (phoneData.whatsapp_enabled || result.whatsapp_enabled)
            ? String(phoneData.whatsapp_number || result.whatsapp_number || '').replace(/\D/g, '')
            : ''
        );
      } catch (err) {
        console.error('FoundByQrToken fetch error:', err);
        setError('حدث خطأ أثناء تحميل حالة الهاتف.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [qrToken]);

  useEffect(() => {
    if (!hasReport || !turnstileRef.current) return;

    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!siteKey) return;

    const renderWidget = () => {
      const turnstile = (window as any).turnstile;
      if (!turnstile || !turnstileRef.current || turnstileRef.current.dataset.rendered) return;
      turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        callback: (token: string) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => setCaptchaToken('')
      });
      turnstileRef.current.dataset.rendered = 'true';
    };

    if ((window as any).turnstile) {
      renderWidget();
      return;
    }

    const existingScript = document.querySelector('script[data-turnstile-script]');
    if (existingScript) {
      existingScript.addEventListener('load', renderWidget, { once: true });
      return () => existingScript.removeEventListener('load', renderWidget);
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = 'true';
    script.addEventListener('load', renderWidget, { once: true });
    document.head.appendChild(script);
    return () => script.removeEventListener('load', renderWidget);
  }, [hasReport]);

  const contactOwner = async () => {
    if (!qrToken || !/^\d{7,15}$/.test(finderPhone.replace(/\D/g, '')) || !captchaToken) {
      setError('أدخل رقم هاتف صحيحًا وأكمل التحقق الأمني.');
      return;
    }

    setContactState('sending');
    try {
      const response = await fetch(`/api/found/${encodeURIComponent(qrToken)}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finderPhone, captchaToken })
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'تعذر إرسال الإشعار');
      }
      setContactState('done');
    } catch (err) {
      console.error('contactOwner error:', err);
      setError('تعذر إرسال رقم التواصل إلى مالك الهاتف.');
      setContactState('idle');
    }
  };

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
                  {hasReport && (
                    <div className="rounded-3xl border border-imei-cyan/20 bg-imei-darker/80 p-5">
                      <h3 className="text-base font-semibold text-white mb-3">إرسال رقم التواصل للمالك</h3>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={finderPhone}
                        onChange={(event) => setFinderPhone(event.target.value)}
                        placeholder="رقم هاتفك"
                        className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-gray-400"
                        disabled={contactState !== 'idle'}
                      />
                      <div ref={turnstileRef} className="mt-4 min-h-[65px]" />
                      <Button
                        className="w-full mt-3"
                        onClick={contactOwner}
                        disabled={contactState !== 'idle'}
                      >
                        {contactState === 'done' ? 'تم إرسال الإشعار' : contactState === 'sending' ? 'جاري الإرسال...' : 'إرسال رقم التواصل'}
                      </Button>
                    </div>
                  )}
                  {hasReport && (ownerPhone || whatsappNumber) && (
                    <div className="space-y-3">
                      <Button
                        className="w-full"
                        onClick={() => setShowContactOptions((current) => !current)}
                      >
                        <Phone size={18} /> الاتصال بالمالك
                      </Button>
                      {showContactOptions && (
                        <div className="space-y-2 rounded-2xl border border-imei-cyan/20 bg-imei-darker/60 p-3">
                          {ownerPhone && (
                            <Button className="w-full" asChild>
                              <a href={`tel:${ownerPhone}`}>
                                <Phone size={18} /> الاتصال الهاتفي
                              </a>
                            </Button>
                          )}
                          {whatsappNumber && (
                            <Button className="w-full bg-green-600 hover:bg-green-700" asChild>
                              <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer">
                                <MessageCircle size={18} /> التواصل عبر WhatsApp
                              </a>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {hasReport && !ownerPhone && !whatsappNumber && (
                    <Button className="w-full" onClick={notifyOwner} disabled={notifyState === 'sending' || notifyState === 'done'}>
                      <MessageCircle size={18} /> {notifyState === 'done' ? 'تم إعلام المالك' : 'إشعار المالك داخل التطبيق'}
                    </Button>
                  )}
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
