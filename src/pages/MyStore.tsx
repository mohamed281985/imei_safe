import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Award, BadgeCheck, Building2, Camera, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Crown, Coins, Download, Gift, Megaphone, PackagePlus, QrCode, Store, Tags } from 'lucide-react';
import QRCode from 'qrcode';
import axiosInstance from '@/services/axiosInterceptor';
import AppNavbar from '@/components/AppNavbar';
import PageContainer from '@/components/PageContainer';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { useToast } from '@/hooks/use-toast';

type StoreProfile = {
  id: string;
  store_name: string | null;
  business_type: string | null;
  status: string | null;
  store_image_url: string | null;
};

type PackageInfo = {
  planType: string;
  expiresAt: string;
  daysRemaining: number;
  publishAdsCount: number;
  publishedAdsCount: number;
  remainingAds: number;
};

type StoreRedemption = {
  id: string;
  product_name: string;
  coins_used: number;
  original_price: number;
  offer_price: number;
  currency_symbol: string;
  status: string;
  redeemed_at: string;
};

const actionItems = [
  {
    title: 'بيع الآن',
    description: 'أضف هاتفًا أو إكسسوارًا إلى متجرك',
    to: '/seller-dashboard',
    Icon: PackagePlus,
    iconClass: 'bg-orange-100 text-orange-700',
    arrowClass: 'text-orange-600',
  },
  {
    title: 'إنشاء إعلان',
    description: 'إعلانات الصفحة الرئيسية',
    to: '/create-advertisement',
    Icon: Megaphone,
    iconClass: 'bg-blue-100 text-blue-700',
    arrowClass: 'text-blue-600',
  },
  {
    title: 'عروض المتجر',
    description: 'أنشئ عرضًا وتابع حالة مراجعته',
    to: '/business-offers',
    Icon: Tags,
    iconClass: 'bg-emerald-100 text-emerald-700',
    arrowClass: 'text-emerald-600',
  },
];

const MyStore: React.FC = () => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<StoreProfile | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null);
  const [storeQr, setStoreQr] = useState<string | null>(null);
  const [downloadingStoreQr, setDownloadingStoreQr] = useState(false);
  const [redemptions, setRedemptions] = useState<StoreRedemption[]>([]);
  const [redemptionCount, setRedemptionCount] = useState(0);

  useEffect(() => {
    if (!profile?.id) {
      setStoreQr(null);
      return;
    }

    let active = true;
    QRCode.toDataURL(`IMEI-SAFE:STORE:${profile.id}`, {
      errorCorrectionLevel: 'H',
      width: 1024,
      margin: 4,
      color: { dark: '#111827', light: '#ffffff' },
    }).then((dataUrl) => {
      if (active) setStoreQr(dataUrl);
    }).catch((error) => {
      console.error('Failed to generate store QR code:', error);
      if (active) setStoreQr(null);
    });

    return () => { active = false; };
  }, [profile?.id]);

  useEffect(() => {
    let active = true;

    const loadStore = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        const [{ data: business }, { data: userData }] = await Promise.all([
          supabase
            .from('businesses')
            .select('id, store_name, business_type, status, store_image_url')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('users')
            .select('role, expires_at')
            .eq('id', user.id)
            .maybeSingle(),
        ]);

        if (!active) return;
        const storeProfile = business as StoreProfile | null;
        setProfile(storeProfile);

        const rawRole = String(userData?.role || user.role || 'free').toLowerCase();
        const normalizedRole = rawRole.trim().replace(/[\s-]+/g, '_');
        const basePlan = normalizedRole.split('_')[0];
        let planRow: any = null;
        if (normalizedRole) {
          const { data } = await supabase.from('plans').select('*').eq('type', normalizedRole).maybeSingle();
          planRow = data;
        }
        if (!planRow && normalizedRole) {
          const { data } = await supabase.from('plans').select('*').ilike('type', `%${normalizedRole}%`).maybeSingle();
          planRow = data;
        }
        if (!planRow) {
          const { data } = await supabase.from('plans').select('*').ilike('type', `%${basePlan}%`).maybeSingle();
          planRow = data;
        }
        if (!planRow) {
          const { data: userPlan } = await supabase.from('users_plans').select('*').eq('user_id', user.id).maybeSingle();
          if (userPlan) {
            const quota = basePlan === 'gold'
              ? userPlan.gold_ad ?? userPlan.gold_ads ?? userPlan.publish_ad ?? userPlan.publishAd
              : basePlan === 'silver'
                ? userPlan.silver_ad ?? userPlan.silver_ads
                : null;
            if (quota != null && Number.isFinite(Number(quota))) planRow = { Publish_Ad: Number(quota) };
          }
        }

        let packageStartDate: string | null = null;
        const { data: lastPayment } = await supabase
          .from('ads_payment')
          .select('payment_date')
          .eq('user_id', user.id)
          .eq('is_paid', true)
          .eq('type', normalizedRole)
          .order('payment_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastPayment?.payment_date) {
          packageStartDate = lastPayment.payment_date;
        } else if (userData?.expires_at) {
          const planDuration = Number(planRow?.duration_days) || 30;
          const startDate = new Date(userData.expires_at);
          startDate.setDate(startDate.getDate() - planDuration);
          packageStartDate = startDate.toISOString();
        }

        let publishedAdsCount = 0;
        if (packageStartDate) {
          const { data: publishedAds } = await supabase
            .from('ads_payment')
            .select('id, status')
            .eq('user_id', user.id)
            .gte('upload_date', packageStartDate);
          publishedAdsCount = (publishedAds || []).filter((ad) => ad.status === 'pending' || ad.status === 'approved').length;
        }

        const quotaValue = planRow?.Publish_Ad ?? planRow?.publish_ad ?? planRow?.publishAd ?? planRow?.publish_ads ?? planRow?.publishAds ?? 0;
        const publishAdsCount = Number(quotaValue) || 0;
        const expiryTime = userData?.expires_at ? new Date(userData.expires_at).getTime() : 0;
        const daysRemaining = expiryTime ? Math.max(0, Math.ceil((expiryTime - Date.now()) / 86400000)) : 0;
        setPackageInfo({
          planType: basePlan.toUpperCase(),
          expiresAt: userData?.expires_at || '',
          daysRemaining,
          publishAdsCount,
          publishedAdsCount,
          remainingAds: Math.max(0, publishAdsCount - publishedAdsCount),
        });

        const storedUrl = storeProfile?.store_image_url || null;
        if (storedUrl) {
          let refreshedUrl = storedUrl;
          const marker = '/storage/v1/object/';
          const markerIndex = storedUrl.indexOf(marker);
          if (markerIndex >= 0) {
            const storagePath = storedUrl.slice(markerIndex + marker.length).replace(/^(public|sign)\//, '');
            const bucketPrefix = 'business-assets/';
            const bucketIndex = storagePath.indexOf(bucketPrefix);
            const filePath = bucketIndex >= 0 ? decodeURIComponent(storagePath.slice(bucketIndex + bucketPrefix.length).split('?')[0]) : '';
            if (filePath) {
              const { data: signedUrlData } = await supabase.storage.from('business-assets').createSignedUrl(filePath, 60 * 60);
              refreshedUrl = signedUrlData?.signedUrl || storedUrl;
            }
          }
          if (active) setImageUrl(refreshedUrl);
        }
      } catch (error) {
        console.error('Failed to load store profile:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadStore();
    return () => { active = false; };
  }, [user?.id, user?.role]);

  useEffect(() => {
    let active = true;
    const loadRedemptions = async () => {
      if (!user?.id) return;
      try {
        const { data } = await axiosInstance.get('/api/business/reward-redemptions');
        if (!active) return;
        setRedemptions(data?.redemptions || []);
        setRedemptionCount(Number(data?.total_count) || 0);
      } catch (error) {
        console.warn('Could not load store reward redemptions:', error);
      }
    };
    void loadRedemptions();
    return () => { active = false; };
  }, [user?.id]);

  const storeName = profile?.store_name?.trim() || 'متجري';
  const statusLabel = profile?.status === 'approved' ? 'متجر موثق' : profile?.status === 'rejected' ? 'يحتاج إلى تحديث' : 'قيد المراجعة';
  const initials = storeName.slice(0, 2).toUpperCase();
  const downloadStoreQr = async () => {
    if (!storeQr || !profile?.id) return;
    const fileName = `imei-safe-store-${profile.id.slice(0, 8)}.png`;
    setDownloadingStoreQr(true);

    try {
      const base64Data = storeQr.split(',')[1];
      if (!base64Data) throw new Error('تعذر تجهيز صورة الباركود.');

      if (Capacitor.isNativePlatform()) {
        const result = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache,
        });
        await Share.share({
          title: 'باركود متجري',
          text: 'باركود المتجر جاهز للطباعة.',
          url: result.uri,
          dialogTitle: 'مشاركة أو حفظ باركود المتجر',
        });
        return;
      }

      const response = await fetch(storeQr);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: 'باركود متجري' });
        return;
      }

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
        toast({ title: 'تم فتح الباركود', description: 'استخدم مشاركة المتصفح أو اضغط مطولًا على الصورة لحفظها.' });
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Failed to export store QR code:', error);
      toast({ title: 'تعذر تحميل الباركود', description: 'حاول مرة أخرى أو افتح الصورة وشاركها يدويًا.', variant: 'destructive' });
    } finally {
      setDownloadingStoreQr(false);
    }
  };

  return (
    <PageContainer>
      <AppNavbar />
      <main className="mx-auto flex w-full max-w-3xl flex-col px-3 pb-8 pt-2 sm:px-5">
        <header className="order-1 mb-4 flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="rounded-full bg-white p-2 text-slate-700 shadow-sm ring-1 ring-slate-200" aria-label="رجوع"><ArrowLeft className="h-5 w-5" /></button>
          <div><h1 className="text-xl font-black text-slate-900">متجري</h1><p className="text-sm text-slate-500">إدارة متجرك ونشاطك التجاري</p></div>
        </header>

        <section className="order-2 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="relative h-44 bg-gradient-to-br from-blue-800 via-blue-700 to-cyan-600 sm:h-56">
            {imageUrl && !imageFailed ? <img src={imageUrl} alt={storeName} className="absolute inset-0 h-full w-full object-cover" onError={() => setImageFailed(true)} /> : (
              <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_35%),linear-gradient(135deg,#1e3a8a,#0369a1)]">
                <span className="flex h-24 w-24 items-center justify-center rounded-3xl border border-white/30 bg-white/15 text-3xl font-black text-white shadow-xl backdrop-blur-sm">{initials || <Store className="h-10 w-10" />}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-900/10 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 text-white sm:bottom-5 sm:left-6 sm:right-6">
              <div className="min-w-0">
                <p className="truncate text-2xl font-black sm:text-3xl">{loading ? '...' : storeName}</p>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-white/85"><Building2 className="h-4 w-4 shrink-0" /><span className="truncate">{profile?.business_type || 'نشاط تجاري'}</span></div>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-extrabold ring-1 ${profile?.status === 'approved' ? 'bg-emerald-100 text-emerald-900 ring-emerald-200' : profile?.status === 'rejected' ? 'bg-rose-100 text-rose-900 ring-rose-200' : 'bg-white/90 text-slate-800 ring-white/60'}`}>
                {profile?.status === 'approved' ? <BadgeCheck className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-amber-500" />}{statusLabel}
              </span>
            </div>
            {profile?.store_image_url && <span className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm"><Camera className="h-4 w-4" /></span>}
          </div>

        </section>

        {profile?.id && <section className="order-6 mt-5 flex flex-col items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-right">
            <div className="mb-1 flex items-center justify-center gap-2 text-slate-900 sm:justify-start"><QrCode className="h-5 w-5 text-teal-700" /><h2 className="font-black">باركود متجرك</h2></div>
            <p className="max-w-sm text-sm text-slate-600">رمز تعريف ثابت لمتجرك، جاهز للمشاركة والطباعة.</p>
            <button type="button" onClick={() => void downloadStoreQr()} disabled={!storeQr || downloadingStoreQr} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">
              <Download className="h-4 w-4" /> {downloadingStoreQr ? 'جارٍ تجهيز الباركود...' : 'تحميل للطباعة'}
            </button>
          </div>
          <div className="flex h-56 w-56 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-3">
            {storeQr ? <img src={storeQr} alt={`باركود متجر ${storeName}`} className="h-full w-full object-contain" /> : <span className="text-sm text-slate-500">جارٍ إنشاء الباركود...</span>}
          </div>
        </section>}

        {packageInfo?.planType && <section className="order-3 mt-5">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm"><Megaphone className="h-4 w-4" /></span>
            <div><h2 className="font-black text-slate-900">إعلانات الصفحة الرئيسية</h2><p className="text-xs text-slate-500">ملخص باقتك واستخدام الإعلانات</p></div>
          </div>
          <div className="rounded-2xl border border-[#289c8e]/20 bg-[#289c8e]/10 p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-[#289c8e]/15 pb-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${packageInfo.planType === 'GOLD' ? 'bg-gradient-to-br from-yellow-400 to-amber-400' : packageInfo.planType === 'SILVER' ? 'bg-gradient-to-br from-slate-200 to-emerald-200' : 'bg-gradient-to-br from-blue-400 to-blue-300'}`}>
                  {packageInfo.planType === 'GOLD' ? <Crown className="h-4 w-4 text-white" /> : packageInfo.planType === 'SILVER' ? <Award className="h-4 w-4 text-white" /> : <Gift className="h-4 w-4 text-white" />}
                </span>
                <span className="truncate font-bold text-gray-800">{packageInfo.planType === 'GOLD' ? t('gold_vip') : packageInfo.planType === 'SILVER' ? t('silver') : t('free')}</span>
              </div>
              {packageInfo.expiresAt && <span className="shrink-0 text-left text-[10px] leading-tight text-gray-600 sm:text-right sm:text-sm">{t('expires_at')} {new Date(packageInfo.expiresAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : language === 'fr' ? 'fr-FR' : language === 'hi' ? 'hi-IN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white/75 p-2.5 text-center shadow-sm"><div className="text-lg font-black tabular-nums text-[#208b7e]">{packageInfo.remainingAds}</div><div className="text-[10px] font-medium leading-tight text-slate-600 sm:text-xs">{t('remaining_ads')}</div></div>
              <div className="rounded-xl bg-white/75 p-2.5 text-center shadow-sm"><div className="text-lg font-black tabular-nums text-green-700">{packageInfo.daysRemaining}</div><div className="text-[10px] font-medium leading-tight text-slate-600 sm:text-xs">{t('days_remaining')}</div></div>
              <div className="rounded-xl bg-white/75 p-2.5 text-center shadow-sm"><div className="text-lg font-black tabular-nums text-violet-700">{packageInfo.publishAdsCount}</div><div className="text-[10px] font-medium leading-tight text-slate-600 sm:text-xs">{t('total_ads')}</div></div>
            </div>
          </div>
        </section>}

        <button type="button" onClick={() => navigate('/my-store/redemptions')} aria-label="فتح سجل جميع استبدالات المتجر" className="order-4 mt-5 block w-full overflow-hidden rounded-2xl bg-white text-right shadow-sm ring-1 ring-slate-200 transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></span>
              <div className="min-w-0"><h2 className="font-black text-slate-900">استبدالات العروض</h2><p className="text-xs text-slate-500">عمليات مؤكدة من رصيد النقاط</p></div>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-black tabular-nums text-emerald-800">{redemptionCount}</span>
          </div>
          {redemptions.length ? (
            <div className="divide-y divide-slate-100">
              {redemptions.map((redemption) => (
                <div key={redemption.id} className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{redemption.product_name}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5 shrink-0" />{new Date(redemption.redeemed_at).toLocaleDateString(language === 'ar' ? 'ar-EG' : language === 'fr' ? 'fr-FR' : language === 'hi' ? 'hi-IN' : 'en-US')}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-black text-amber-900"><Coins className="h-3.5 w-3.5 text-amber-600" />{new Intl.NumberFormat('en-US').format(redemption.coins_used)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-5 text-center text-sm text-slate-500">لا توجد استبدالات مؤكدة حتى الآن.</p>
          )}
        </button>

        <section className="order-5 mt-6">
          <div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-black text-slate-900">إجراءات سريعة</h2><p className="mt-0.5 text-sm text-slate-500">إدارة البيع والتسويق والعروض</p></div></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {actionItems.map(({ title, description, to, Icon, iconClass, arrowClass }) => (
              <button key={to} type="button" onClick={() => navigate(to)} className="group flex min-h-28 w-full items-center gap-3 rounded-2xl bg-white p-4 text-right shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md sm:items-start sm:flex-col sm:justify-between sm:gap-4">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1 sm:w-full"><span className="block font-bold text-slate-900">{title}</span><span className="mt-1 block text-xs leading-relaxed text-slate-500 sm:text-sm">{description}</span></span>
                <ArrowUpRight className={`h-5 w-5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${arrowClass}`} />
              </button>
            ))}
          </div>
        </section>
      </main>
    </PageContainer>
  );
};

export const StoreRedemptionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [redemptions, setRedemptions] = useState<StoreRedemption[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    let active = true;
    const loadPage = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const { data } = await axiosInstance.get('/api/business/reward-redemptions', {
          params: { page, pageSize },
        });
        if (!active) return;
        setRedemptions(data?.redemptions || []);
        setTotalCount(Number(data?.total_count) || 0);
      } catch (error: any) {
        if (active) setLoadError(error?.response?.data?.error || 'تعذر تحميل سجل الاستبدالات. حاول مرة أخرى.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadPage();
    return () => { active = false; };
  }, [page]);

  const locale = language === 'ar' ? 'ar-EG' : language === 'fr' ? 'fr-FR' : language === 'hi' ? 'hi-IN' : 'en-US';

  return (
    <PageContainer>
      <AppNavbar />
      <main className="mx-auto w-full max-w-3xl px-3 pb-8 pt-2 sm:px-5">
        <header className="mb-4 flex items-center gap-3">
          <button type="button" onClick={() => navigate('/my-store')} className="rounded-full bg-white p-2 text-slate-700 shadow-sm ring-1 ring-slate-200" aria-label="العودة إلى متجري"><ArrowLeft className="h-5 w-5" /></button>
          <div><h1 className="text-xl font-black text-slate-900">سجل استبدالات المتجر</h1><p className="text-sm text-slate-500">جميع عمليات الاستبدال المؤكدة</p></div>
        </header>

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
            <h2 className="font-black text-slate-900">العمليات</h2>
            {!loading && <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-black tabular-nums text-emerald-800">{totalCount}</span>}
          </div>
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-500">جارٍ تحميل سجل الاستبدالات...</p>
          ) : loadError ? (
            <p role="alert" className="p-6 text-center text-sm font-bold text-rose-700">{loadError}</p>
          ) : redemptions.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">لا توجد عمليات استبدال حتى الآن.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {redemptions.map((item) => (
                <article key={item.id} className="flex min-w-0 items-center justify-between gap-3 px-4 py-4 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{item.product_name}</p>
                    <p className="mt-1 truncate text-sm text-slate-600">{item.business_name}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5 shrink-0" />{new Date(item.redeemed_at).toLocaleString(locale)}</p>
                  </div>
                  <div className="shrink-0 text-left">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-black text-amber-900"><Coins className="h-3.5 w-3.5 text-amber-600" />{new Intl.NumberFormat('en-US').format(item.coins_used)}</span>
                    <p className="mt-1 text-left text-[11px] font-bold text-emerald-700">تم الاستبدال</p>
                  </div>
                </article>
              ))}
            </div>
          )}
          {!loading && totalCount > pageSize && <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-5">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" />السابق</button>
            <span className="text-xs font-bold text-slate-500">صفحة {page} من {totalPages}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">التالي<ChevronLeft className="h-4 w-4" /></button>
          </div>}
        </section>
      </main>
    </PageContainer>
  );
};

export default MyStore;