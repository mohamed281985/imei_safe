import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import jsQR from 'jsqr';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coins,
  Gift,
  MapPin,
  Shield,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Tag,
  Wallet,
  Wrench,
  Car,
  Cable,
  Headphones,
  Smartphone,
  Watch,
  BatteryCharging,
  QrCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNearbyRewardOffers } from '@/hooks/useNearbyRewardOffers';
import { useRewardBalance } from '@/hooks/useRewardBalance';
import AppNavbar from '@/components/AppNavbar';
import PageContainer from '@/components/PageContainer';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { ACCESSORY_CATEGORIES } from '@/constants/accessoryCategories';
import {
  coinPricingRules,
  dailyRewardSchedule,
  defaultRewardBalance,
  getCategoryIcon,
  getDailyClaimedDays,
  getLastDailyClaimDate,
  getRewardBalanceFromStorage,
  getRedemptions,
  rewardCategories,
  setDailyClaimedDays,
  setLastDailyClaimDate,
  setRedemptions,
  setRewardBalanceInStorage,
} from '@/data/rewards';

const formatCurrency = (value: number) => `${new Intl.NumberFormat('en-US').format(value)} ج.م`;
const formatCoinsValue = (value: number) => `${new Intl.NumberFormat('en-US').format(value)} Coins`;
const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
const isOfferValid = (offer: any) => offer?.isActive && offer?.status === 'approved' && new Date(offer.expiresAt).getTime() > Date.now();

const getCurrentBalance = (userId?: string) => getRewardBalanceFromStorage(userId);

const buildRedeemCode = () => {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `IMEI-REWARD-${Date.now().toString().slice(-6)}${random}`;
};

const generateQrPattern = (seed: string) => {
  const size = 21;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  const addFinder = (x: number, y: number) => {
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        const isBorder = row === 0 || row === 6 || col === 0 || col === 6;
        const isCenter = row >= 2 && row <= 4 && col >= 2 && col <= 4;
        matrix[y + row][x + col] = isBorder || isCenter ? 1 : 0;
      }
    }
  };
  addFinder(0, 0);
  addFinder(size - 7, 0);
  addFinder(0, size - 7);

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (matrix[row][col] !== 0) continue;
      const value = (row * 17 + col * 31 + seed.length * 7) % 5;
      matrix[row][col] = value === 0 ? 1 : 0;
    }
  }

  return matrix;
};

const CategoryImage = ({ imageUrl, iconName, name }: { imageUrl?: string | null; iconName: string; name: string }) => {
  const Icon = getCategoryIcon(iconName) || Shield;
  const [failed, setFailed] = useState(false);

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={name}
        loading="lazy"
        className="h-20 w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-20 w-full items-center justify-center bg-gradient-to-br from-sky-100 via-blue-50 to-orange-100 text-sky-700">
      <Icon className="h-9 w-9" />
    </div>
  );
};

const getOfferCardImage = (offer: any, category: any) => {
  if (offer?.imageUrl) return offer.imageUrl;
  if (category?.image_url) return category.image_url;
  return '';
};

const categoryImageById: Record<string, string> = {
  screen_protector: ACCESSORY_CATEGORIES.find((item) => item.value === 'screen_protectors')?.image || '',
  phone_grips: ACCESSORY_CATEGORIES.find((item) => item.value === 'cases')?.image || '',
  chargers: ACCESSORY_CATEGORIES.find((item) => item.value === 'chargers')?.image || '',
  headphones: ACCESSORY_CATEGORIES.find((item) => item.value === 'headphones')?.image || '',
  cables: ACCESSORY_CATEGORIES.find((item) => item.value === 'cables')?.image || '',
  car_holders: ACCESSORY_CATEGORIES.find((item) => item.value === 'phone_holders')?.image || '',
  smart_watches: ACCESSORY_CATEGORIES.find((item) => item.value === 'smartwatches')?.image || '',
  other_accessories: ACCESSORY_CATEGORIES.find((item) => item.value === 'other')?.image || '',
};

const BusinessBadge = ({ label }: { label: string }) => (
  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700 shadow-sm">
    {label.slice(0, 2).toUpperCase()}
  </div>
);

const RewardDailyPage: React.FC = () => {
  const navigate = useNavigate();
  const { balance, userId } = useRewardBalance();
  const [claimedDays, setClaimedDays] = useState<number[]>(() => getDailyClaimedDays(userId));
  const [claimedToday, setClaimedToday] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA');
    const lastClaimDate = getLastDailyClaimDate(userId);
    let days = getDailyClaimedDays(userId);
    if (days.length >= dailyRewardSchedule.length && lastClaimDate !== today) {
      days = [];
      setDailyClaimedDays(days, userId);
    }
    setClaimedDays(days);
    setClaimedToday(lastClaimDate === today);
  }, [userId]);

  const todayDay = claimedDays.length + 1;
  const todayReward = dailyRewardSchedule[claimedDays.length] || dailyRewardSchedule[dailyRewardSchedule.length - 1];
  const isFullyClaimed = claimedDays.length >= dailyRewardSchedule.length;

  const claimToday = async () => {
    if (isFullyClaimed || claimedToday || claiming || !userId) return;
    setClaiming(true);
    const next = [...claimedDays, todayDay];
    const rewardAmount = todayReward.amount;
    const { error } = await supabase.rpc('increment_points', {
      p_user_id: userId,
      p_amount: rewardAmount,
    });
    if (error) {
      console.error('Failed to add daily reward points:', error);
      toast({ title: 'تعذر استلام المكافأة', description: 'تحقق من اتصال الإنترنت وحاول مرة أخرى.', variant: 'destructive' });
      setClaiming(false);
      return;
    }

    const updatedBalance = getCurrentBalance(userId) + rewardAmount;
    const claimedAt = new Date().toLocaleDateString('en-CA');
    setClaimedDays(next);
    setClaimedToday(true);
    setDailyClaimedDays(next, userId);
    setLastDailyClaimDate(claimedAt, userId);
    setRewardBalanceInStorage(updatedBalance, userId);
    setClaiming(false);
  };

  return (
    <PageContainer>
      <AppNavbar />
      <div className="w-full max-w-md pb-0 pt-0">
        <div className="mb-3 rounded-3xl bg-white/90 p-4 shadow-lg ring-1 ring-slate-200">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">رصيدك الحالي</p>
              <div className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-900">
                <Coins className="h-7 w-7 text-amber-500" />
                <span>{formatCoinsValue(balance)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/rewards-categories')}
              className="rounded-full bg-orange-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm"
            >
              استبدال النقاط
            </button>
          </div>
        </div>

        <div className="rounded-3xl bg-white/95 p-4 shadow-md ring-1 ring-slate-200">
          <div className="mb-4 flex items-center gap-2">
            <Gift className="h-6 w-6 text-orange-500" />
            <h1 className="text-xl font-black text-slate-900">مكافأة الدخول اليومي</h1>
          </div>

          <div className="space-y-3">
            {dailyRewardSchedule.map((item) => {
              const claimed = claimedDays.includes(item.day);
              const isToday = !claimed && item.day === todayDay;
              return (
                <div
                  key={item.day}
                  className={`flex items-center justify-between rounded-2xl border p-3 ${
                    claimed ? 'border-emerald-200 bg-emerald-50' : isToday ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${claimed ? 'bg-emerald-500 text-white' : 'bg-white text-slate-700'}`}>
                      {claimed ? <Check className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-800">اليوم {item.day}</p>
                      <p className="text-sm text-slate-600">+{formatNumber(item.amount)} Coins</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {claimed ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">✓ تم الاستلام</span>
                    ) : isToday && !claimedToday ? (
                      <button
                        type="button"
                        onClick={claimToday}
                        disabled={claiming}
                        className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm disabled:opacity-60"
                      >
                        {claiming ? 'جارٍ الاستلام...' : `احصل على +${formatNumber(item.amount)} Coins`}
                      </button>
                    ) : isToday && claimedToday ? (
                      <span className="text-xs font-bold text-emerald-700">تم استلام مكافأة اليوم</span>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">قادم</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => navigate('/rewards-categories')}
              className="flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-black text-white shadow-md"
            >
              <Coins className="h-4 w-4" />
              استبدال النقاط
            </button>
            <button
              type="button"
              onClick={() => navigate('/rewards-history')}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-black text-slate-700"
            >
              <Clock3 className="h-4 w-4" />
              سجل النقاط
            </button>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

const RewardCategoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const { balance } = useRewardBalance();
  const { offers: nearbyOffers, loading: offersLoading, error: offersError, retry: retryNearbyOffers } = useNearbyRewardOffers();

  const categories = useMemo(() =>
    rewardCategories.map((category) => {
      const businesses = new Set(
        nearbyOffers
          .filter((offer) => offer.categoryId === category.id && isOfferValid(offer))
          .map((offer) => offer.businessName),
      );

      return { ...category, shopsCount: businesses.size };
    }),
  [nearbyOffers]);

  return (
    <PageContainer>
      <AppNavbar />
      <div className="w-full max-w-md pb-0 pt-0">
        <div className="mb-3 rounded-3xl bg-white/90 p-4 shadow-md ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">رصيدك الحالي</p>
          <div className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-900">
            <Coins className="h-7 w-7 text-amber-500" />
            <span>{formatCoinsValue(balance)}</span>
          </div>
        </div>

        <div className="rounded-3xl bg-white/95 p-4 shadow-md ring-1 ring-slate-200">
          <h1 className="mb-4 text-xl font-black text-slate-900">استبدال النقاط</h1>
          <p className="mb-4 text-sm text-slate-600">ماذا تريد أن تستبدل نقاطك به؟</p>

          {offersLoading && <div className="mb-4 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><Clock3 className="h-4 w-4 animate-pulse text-sky-600" />جارٍ البحث عن العروض القريبة...</div>}
          {offersError && <div className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><span>{offersError}</span><button type="button" onClick={retryNearbyOffers} className="self-start font-bold text-amber-800 underline">السماح بالموقع وإعادة المحاولة</button></div>}

          <div className="grid grid-cols-2 gap-3">
            {categories.map((category) => {
              const Icon = getCategoryIcon(category.icon);
              return (
                <button
                  type="button"
                  key={category.id}
                  onClick={() => navigate(`/rewards-shops/${category.id}`)}
                  className="flex min-h-[185px] w-full flex-col items-center rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:border-sky-300 hover:shadow-md"
                >
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-white bg-slate-100 shadow-md ring-2 ring-slate-200">
                    <CategoryImage imageUrl={categoryImageById[category.id] || category.image_url} iconName={category.icon} name={category.name} />
                  </div>
                  <div className="flex w-full flex-1 flex-col items-center justify-between gap-2 pt-3">
                    <div className="min-w-0">
                      <div className="flex items-center justify-center gap-1.5 text-slate-900">
                        <Icon className="h-4 w-4 shrink-0 text-sky-600" />
                        <span className="line-clamp-2 text-sm font-black leading-tight">{category.name}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">{formatNumber(category.shopsCount)} محل يقدم عروضًا</p>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-slate-500" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

const RewardShopsPage: React.FC = () => {
  const navigate = useNavigate();
  const { categoryId } = useParams();
  const { balance } = useRewardBalance();
  const [sort, setSort] = useState<'nearest' | 'discount' | 'coins' | 'latest'>('nearest');
  const { offers: nearbyOffers, loading: offersLoading, error: offersError, retry: retryNearbyOffers } = useNearbyRewardOffers();

  const category = rewardCategories.find((item) => item.id === categoryId) ?? rewardCategories[0];
  const offers = useMemo(() => {
    const filtered = nearbyOffers.filter((offer) => offer.categoryId === category.id && isOfferValid(offer));
    switch (sort) {
      case 'discount':
        return [...filtered].sort((a, b) => b.discountPercent - a.discountPercent);
      case 'coins':
        return [...filtered].sort((a, b) => a.coinsRequired - b.coinsRequired);
      case 'latest':
        return [...filtered].sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime());
      default:
        return [...filtered].sort((a, b) => a.distanceMeters - b.distanceMeters);
    }
  }, [category.id, nearbyOffers, sort]);

  if (!category) {
    return null;
  }

  return (
    <PageContainer>
      <AppNavbar />
      <div className="w-full max-w-md pb-0 pt-0">
        <div className="mb-3 rounded-3xl bg-white/90 p-4 shadow-md ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => navigate(-1)} className="rounded-full bg-slate-100 p-2 text-slate-700">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <p className="text-xs text-slate-500">رصيدك</p>
              <div className="flex items-center gap-2 text-xl font-black text-slate-900">
                <Coins className="h-5 w-5 text-amber-500" />
                <span>{formatCoinsValue(balance)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white/95 p-4 shadow-md ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-black text-slate-900">عروض {category.name}</h1>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
            {[
              ['الأقرب إليك', 'nearest'],
              ['أعلى خصم', 'discount'],
              ['الأقل Coins', 'coins'],
              ['الأحدث', 'latest'],
            ].map(([label, value]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSort(value as any)}
                className={`rounded-full px-3 py-2 font-bold ${sort === value ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {offersLoading ? (
              <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-600">جارٍ تحميل العروض القريبة...</div>
            ) : offersError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center text-sm text-amber-900">
                <p>{offersError}</p>
                <button type="button" onClick={retryNearbyOffers} className="mt-3 font-bold underline">إعادة المحاولة</button>
              </div>
            ) : offers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                <p className="font-bold text-slate-700">لا توجد عروض متاحة حاليًا</p>
                <button type="button" onClick={() => navigate('/rewards-categories')} className="mt-3 rounded-full bg-sky-600 px-4 py-2 text-sm font-bold text-white">
                  استكشف فئات أخرى
                </button>
              </div>
            ) : (
              offers.map((offer) => {
                const imageUrl = getOfferCardImage(offer, category);
                return (
                  <button
                    type="button"
                    key={offer.id}
                    onClick={() => navigate(`/reward-offer/${offer.id}`)}
                    className="group flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2.5 text-right shadow-sm transition hover:border-sky-300 hover:shadow-md active:scale-[0.99]"
                  >
                    <div className="relative h-[104px] w-[92px] shrink-0 self-center overflow-hidden rounded-xl bg-slate-100 sm:h-28 sm:w-24">
                      {imageUrl ? (
                        <img src={imageUrl} alt={offer.productName} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 via-white to-orange-100 text-sky-700">
                          <Shield className="h-7 w-7" />
                        </div>
                      )}
                      <span className="absolute left-1.5 top-1.5 rounded-md bg-rose-600 px-1.5 py-1 text-[10px] font-black leading-none text-white shadow-sm">-{formatNumber(offer.discountPercent)}%</span>
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-xs font-bold text-slate-500">{offer.businessName}</span>
                          {offer.rating > 0 && <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-bold text-slate-600"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{offer.rating}</span>}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm font-black leading-snug text-slate-900 sm:text-base">{offer.productName}</p>
                      </div>

                      <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                        <MapPin className="h-3 w-3 shrink-0 text-sky-600" />
                        <span>{offer.distanceMeters >= 1000 ? `${(offer.distanceMeters / 1000).toFixed(1)} كم` : `${formatNumber(offer.distanceMeters)} م`}</span>
                        <span className="mx-0.5 text-slate-300">·</span>
                        <span className="truncate">{category.name}</span>
                      </div>

                      <div className="mt-2 flex min-w-0 items-end justify-between gap-2 border-t border-slate-100 pt-2">
                        <div className="flex min-w-0 items-baseline gap-1.5">
                          <span className="truncate text-base font-black tabular-nums text-slate-900 sm:text-lg">{formatCurrency(offer.offerPrice)}</span>
                          <span className="shrink-0 text-[10px] tabular-nums text-slate-400 line-through">{formatCurrency(offer.originalPrice)}</span>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-extrabold text-amber-800 ring-1 ring-amber-100">
                          <Coins className="h-3.5 w-3.5 text-amber-600" />{formatNumber(offer.coinsRequired)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

const RewardOfferDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { offerId } = useParams();
  const { offers: nearbyOffers, loading: offersLoading, error: offersError, retry: retryNearbyOffers } = useNearbyRewardOffers();
  const offer = nearbyOffers.find((item) => item.id === offerId);

  if (!offer) {
    return (
      <PageContainer>
        <AppNavbar />
        <div className="mx-auto max-w-md px-4 py-10 text-center">
          <p className="text-lg font-black text-slate-800">{offersLoading ? 'جارٍ تحميل العرض...' : offersError || 'العرض غير متاح ضمن نطاقك الحالي'}</p>
          {offersError && <button type="button" onClick={retryNearbyOffers} className="mt-4 rounded-full bg-amber-500 px-4 py-2 text-sm font-black text-white">إعادة المحاولة</button>}
          <button type="button" onClick={() => navigate('/rewards-categories')} className="mt-4 rounded-full bg-sky-600 px-4 py-2 text-sm font-black text-white">العودة للفئات</button>
        </div>
      </PageContainer>
    );
  }

  const category = rewardCategories.find((item) => item.id === offer.categoryId) ?? rewardCategories[0];
  const imageUrl = getOfferCardImage(offer, category);

  return (
    <PageContainer>
      <AppNavbar />
      <div className="w-full max-w-md pb-0 pt-0">
        <div className="overflow-hidden rounded-3xl bg-white/95 shadow-lg ring-1 ring-slate-200">
          <div className="relative">
            <button type="button" onClick={() => navigate(-1)} className="absolute left-3 top-3 z-10 rounded-full bg-white/85 p-2 shadow-sm">
              <ArrowLeft className="h-5 w-5 text-slate-700" />
            </button>
            {imageUrl ? (
              <img src={imageUrl} alt={offer.productName} className="h-60 w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-60 w-full items-center justify-center bg-gradient-to-br from-sky-100 via-white to-orange-100 text-sky-700">
                <Shield className="h-16 w-16" />
              </div>
            )}
          </div>

          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">{offer.productName}</p>
                <h1 className="mt-1 text-2xl font-black text-slate-900">{offer.businessName}</h1>
              </div>
              <div className="flex rounded-full bg-slate-100 px-2 py-1 text-sm font-bold text-slate-700">
                <Star className="mr-1 h-4 w-4 fill-amber-400 text-amber-400" />
                {offer.rating}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <MapPin className="h-4 w-4 text-sky-500" />
              <span>{offer.distanceMeters} متر</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-slate-500">السعر الأصلي</p>
                <p className="mt-1 text-lg font-black text-slate-800">{formatCurrency(offer.originalPrice)}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3">
                <p className="text-emerald-700">السعر بعد الخصم</p>
                <p className="mt-1 text-lg font-black text-emerald-800">{formatCurrency(offer.offerPrice)}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-orange-50 p-3">
                <p className="text-xs text-orange-700">خصم</p>
                <p className="mt-1 text-lg font-black text-orange-900">{offer.discountPercent}%</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3">
                <p className="text-xs text-amber-700">النقاط المطلوبة</p>
                <p className="mt-1 text-lg font-black text-amber-900">{formatNumber(offer.coinsRequired)} Coins</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <span>تاريخ انتهاء العرض</span>
                <span className="font-black text-slate-800">{new Date(offer.expiresAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}</span>
              </div>
            </div>

            <Button
              type="button"
              onClick={() => navigate(`/reward-confirm/${offer.id}`)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-base font-black text-white shadow-lg"
            >
              <Coins className="h-4 w-4" />
              استبدل الآن
              <span className="text-sm">({formatNumber(offer.coinsRequired)} Coins)</span>
            </Button>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

const RewardConfirmationPage: React.FC = () => {
  const navigate = useNavigate();
  const { offerId } = useParams();
  const { balance, userId } = useRewardBalance();
  const { offers: nearbyOffers, loading: offersLoading, error: offersError, retry: retryNearbyOffers } = useNearbyRewardOffers();
  const offer = nearbyOffers.find((item) => item.id === offerId);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanError, setScanError] = useState('');
  const [insufficientBalance, setInsufficientBalance] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const redemptionHandlerRef = React.useRef<() => void>(() => undefined);

  useEffect(() => {
    setInsufficientBalance(false);
  }, [offerId]);

  const confirmRedemption = () => {
    if (!offer) return;
    const balanceBefore = getCurrentBalance(userId);
    if (balanceBefore < offer.coinsRequired) {
      setInsufficientBalance(true);
      setCameraOpen(false);
      return;
    }

    const redemption = {
      id: `redemption-${Date.now()}`,
      code: buildRedeemCode(),
      qrSeed: `${Date.now()}`,
      offerId: offer.id,
      productName: offer.productName,
      businessName: offer.businessName,
      coinsUsed: offer.coinsRequired,
      originalPrice: offer.originalPrice,
      offerPrice: offer.offerPrice,
      status: 'active',
      expiresAt: offer.expiresAt,
      redeemedAt: new Date().toISOString(),
      used: false,
    };

    const list = getRedemptions();
    list.unshift(redemption);
    setRedemptions(list);
    setRewardBalanceInStorage(balanceBefore - offer.coinsRequired, userId);
    navigate(`/reward-success/${redemption.id}`);
  };
  redemptionHandlerRef.current = confirmRedemption;

  useEffect(() => {
    if (!cameraOpen) return;

    let cancelled = false;
    let animationFrame = 0;
    let lastScanAt = 0;
    let stream: MediaStream | null = null;

    const startScanner = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera_unavailable');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d', { willReadFrequently: true });
        if (!video || !canvas || !context) throw new Error('camera_unavailable');

        video.srcObject = stream;
        await video.play();

        const scanFrame = () => {
          if (cancelled) return;
          const now = performance.now();
          if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && video.videoWidth > 0 && now - lastScanAt >= 250) {
            lastScanAt = now;
            const scale = Math.min(1, 640 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const decoded = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });

            if (decoded) {
              if (decoded.data !== `IMEI-SAFE:STORE:${offer?.businessId}`) {
                setScanError('هذا الباركود لا يخص المحل الذي يقدم العرض.');
                setCameraOpen(false);
                return;
              }
              setScanError('');
              redemptionHandlerRef.current();
              setCameraOpen(false);
              return;
            }
          }
          animationFrame = window.requestAnimationFrame(scanFrame);
        };

        scanFrame();
      } catch (error) {
        console.error('Failed to start reward store QR scanner:', error);
        if (!cancelled) setScanError('تعذر تشغيل الكاميرا. تحقق من الإذن وحاول مرة أخرى.');
      }
    };

    void startScanner();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [cameraOpen, offer?.businessId]);

  const openStoreScanner = () => {
    if (!offer) return;
    const balanceNow = getCurrentBalance(userId);
    setScanError('');
    if (balanceNow < offer.coinsRequired) {
      setInsufficientBalance(true);
      return;
    }
    if (!offer.businessId) {
      setScanError('تعذر تحديد المحل لهذا العرض. حاول تحديث العروض.');
      return;
    }
    setInsufficientBalance(false);
    setCameraOpen(true);
  };

  if (!offer) {
    return (
      <PageContainer>
        <AppNavbar />
        <div className="mx-auto max-w-md px-4 py-10 text-center">
          <p className="font-bold text-slate-700">{offersLoading ? 'جارٍ التحقق من العرض...' : offersError || 'العرض غير متاح للاستبدال من موقعك الحالي.'}</p>
          {offersError && <button type="button" onClick={retryNearbyOffers} className="mt-4 rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-white">إعادة المحاولة</button>}
          <button type="button" onClick={() => navigate('/rewards-categories')} className="mt-4 block w-full text-sm font-bold text-sky-700">العودة للعروض القريبة</button>
        </div>
      </PageContainer>
    );
  }

  const balanceAfter = Math.max(0, balance - offer.coinsRequired);

  return (
    <PageContainer>
      <AppNavbar />
      <div className="w-full max-w-md pb-0 pt-0">
        <div className="rounded-3xl bg-white/95 p-5 shadow-lg ring-1 ring-slate-200">
          <h2 className="text-xl font-black text-slate-900">تأكيد استبدال المكافأة</h2>

          <div className="mt-5 space-y-3 rounded-2xl bg-amber-50 p-4 text-sm text-slate-700">
            <div className="flex items-center justify-between">
              <span>سيتم خصم:</span>
              <span className="flex items-center gap-1 font-black text-amber-900">
                <Coins className="h-4 w-4 text-amber-500" />
                {formatNumber(offer.coinsRequired)} Coins
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>رصيدك الحالي:</span>
                <span className="font-black text-slate-900">{formatCoinsValue(balance)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-amber-200 pt-3">
              <span>رصيدك بعد الاستبدال:</span>
              <span className="font-black text-slate-900">{formatCoinsValue(balanceAfter)}</span>
            </div>
          </div>

          {insufficientBalance && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
            <p>رصيد النقاط لا يكفي، عاود الدخول يوميًا لمزيد من النقاط.</p>
            <button type="button" onClick={() => navigate('/daily-reward')} className="mt-2 underline">المكافأة اليومية</button>
          </div>}
          {scanError && !cameraOpen && <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">{scanError}</p>}

          <div className="mt-5 flex gap-3">
            <Button type="button" onClick={openStoreScanner} className="flex-1 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black">
              <QrCode className="ml-2 h-4 w-4" /> تأكيد الاستلام ومسح باركود المحل
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)} className="flex-1 rounded-2xl border-slate-200 text-slate-700">
              إلغاء
            </Button>
          </div>
        </div>
      </div>
      {cameraOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-label="مسح باركود المحل">
        <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-black text-slate-900">امسح باركود المحل</h2>
            <button type="button" onClick={() => setCameraOpen(false)} className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-100">إغلاق</button>
          </div>
          <div className="overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full object-cover" />
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <p className="mt-3 text-center text-sm text-slate-600">وجّه الكاميرا إلى باركود المحل لتأكيد الاستبدال.</p>
          {scanError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-800">{scanError}</p>}
        </div>
      </div>}
    </PageContainer>
  );
};

const RewardSuccessPage: React.FC = () => {
  const navigate = useNavigate();
  const { redemptionId } = useParams();
  const redemptions = getRedemptions();
  const redemption = redemptions.find((item) => item.id === redemptionId) ?? redemptions[0];

  if (!redemption) {
    return null;
  }

  const qrMatrix = generateQrPattern(redemption.code);

  return (
    <PageContainer>
      <AppNavbar />
      <div className="w-full max-w-md pb-0 pt-0">
        <div className="rounded-3xl bg-white/95 p-5 shadow-lg ring-1 ring-slate-200">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-900">تم الاستبدال بنجاح</h2>
            <p className="mt-2 text-sm text-slate-600">{redemption.productName}</p>
            <p className="text-sm text-slate-500">{redemption.businessName}</p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-slate-500">السعر</p>
              <p className="mt-1 font-black text-slate-800">{formatCurrency(redemption.offerPrice)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-slate-500">قيمة الخصم</p>
              <p className="mt-1 font-black text-slate-800">{formatCurrency(redemption.originalPrice - redemption.offerPrice)}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3">
              <p className="text-amber-700">Coins المستخدمة</p>
              <p className="mt-1 font-black text-amber-900">{formatNumber(redemption.coinsUsed)}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3">
              <p className="text-emerald-700">الحالة</p>
              <p className="mt-1 font-black text-emerald-900">صالح للاستخدام</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-center gap-2">
              <QrCode className="h-5 w-5 text-sky-600" />
              <span className="font-black text-slate-800">QR Code</span>
            </div>
            <div className="grid grid-cols-21 gap-[2px] rounded-xl bg-slate-900 p-2" style={{ gridTemplateColumns: 'repeat(21, minmax(0, 1fr))' }}>
              {qrMatrix.flat().map((cell, index) => (
                <div
                  key={`${index}-${cell}`}
                  className={`aspect-square ${cell ? 'bg-slate-900' : 'bg-white'}`}
                />
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-center">
            <p className="text-xs text-sky-700">Redeem Code</p>
            <p className="mt-1 text-lg font-black tracking-[0.2em] text-sky-900">{redemption.code}</p>
          </div>

          <p className="mt-4 text-center text-sm text-slate-600">اعرض هذا الكود للمحل</p>

          <Button onClick={() => navigate('/rewards-categories')} className="mt-5 w-full rounded-2xl bg-sky-600 text-white font-black">
            العودة لاستكشاف الفئات
          </Button>
        </div>
      </div>
    </PageContainer>
  );
};

const RewardHistoryPage: React.FC = () => {
  const redemptions = getRedemptions();
  return (
    <PageContainer>
      <AppNavbar />
      <div className="w-full max-w-md pb-0 pt-0">
        <div className="rounded-3xl bg-white/95 p-4 shadow-md ring-1 ring-slate-200">
          <h1 className="text-xl font-black text-slate-900">سجل النقاط</h1>
          {redemptions.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-600">لا توجد عمليات سابقة حتى الآن.</div>
          ) : (
            <div className="mt-4 space-y-2">
              {redemptions.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-800">{item.productName}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">مستخدم</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{item.businessName}</p>
                  <p className="mt-2 text-xs text-slate-600">{item.code}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
};

export { RewardDailyPage, RewardCategoriesPage, RewardShopsPage, RewardOfferDetailsPage, RewardConfirmationPage, RewardSuccessPage, RewardHistoryPage };
