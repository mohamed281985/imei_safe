import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Award, BadgeCheck, Building2, Camera, Crown, Download, Gift, Megaphone, PackagePlus, QrCode, Store, Tags } from 'lucide-react';
import QRCode from 'qrcode';
import AppNavbar from '@/components/AppNavbar';
import PageContainer from '@/components/PageContainer';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';

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
    description: 'روّج لمتجرك ومنتجاتك',
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
  const [profile, setProfile] = useState<StoreProfile | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null);
  const [storeQr, setStoreQr] = useState<string | null>(null);

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

  const storeName = profile?.store_name?.trim() || 'متجري';
  const statusLabel = profile?.status === 'approved' ? 'متجر موثق' : profile?.status === 'rejected' ? 'يحتاج إلى تحديث' : 'قيد المراجعة';
  const initials = storeName.slice(0, 2).toUpperCase();
  const downloadStoreQr = () => {
    if (!storeQr || !profile?.id) return;
    const link = document.createElement('a');
    link.href = storeQr;
    link.download = `imei-safe-store-${profile.id.slice(0, 8)}.png`;
    link.click();
  };

  return (
    <PageContainer>
      <AppNavbar />
      <main className="mx-auto w-full max-w-3xl px-3 pb-8 pt-2 sm:px-5">
        <header className="mb-4 flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="rounded-full bg-white p-2 text-slate-700 shadow-sm ring-1 ring-slate-200" aria-label="رجوع"><ArrowLeft className="h-5 w-5" /></button>
          <div><h1 className="text-xl font-black text-slate-900">متجري</h1><p className="text-sm text-slate-500">إدارة متجرك ونشاطك التجاري</p></div>
        </header>

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
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

        {profile?.id && <section className="mt-5 flex flex-col items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-right">
            <div className="mb-1 flex items-center justify-center gap-2 text-slate-900 sm:justify-start"><QrCode className="h-5 w-5 text-teal-700" /><h2 className="font-black">باركود متجرك</h2></div>
            <p className="max-w-sm text-sm text-slate-600">رمز تعريف ثابت لمتجرك، جاهز للمشاركة والطباعة.</p>
            <button type="button" onClick={downloadStoreQr} disabled={!storeQr} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">
              <Download className="h-4 w-4" /> تحميل للطباعة
            </button>
          </div>
          <div className="flex h-56 w-56 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-3">
            {storeQr ? <img src={storeQr} alt={`باركود متجر ${storeName}`} className="h-full w-full object-contain" /> : <span className="text-sm text-slate-500">جارٍ إنشاء الباركود...</span>}
          </div>
        </section>}

        {packageInfo?.planType && <section className="mt-5">
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

        <section className="mt-6">
          <div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-black text-slate-900">إدارة المتجر</h2><p className="mt-0.5 text-sm text-slate-500">إجراءاتك التجارية في مكان واحد</p></div></div>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            {actionItems.map(({ title, description, to, Icon, iconClass, arrowClass }) => (
              <button key={to} type="button" onClick={() => navigate(to)} className="group flex w-full items-center gap-3 px-4 py-4 text-right transition-colors hover:bg-slate-50 sm:px-5">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">{title}</span><span className="mt-1 block truncate text-xs text-slate-500 sm:text-sm">{description}</span></span>
                <ArrowUpRight className={`h-5 w-5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${arrowClass}`} />
              </button>
            ))}
          </div>
        </section>
      </main>
    </PageContainer>
  );
};

export default MyStore;