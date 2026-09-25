import { Car, Cable, Gift, Headphones, Shield, Smartphone, Watch, Wrench } from 'lucide-react';

export type RewardCategory = {
  id: string;
  name: string;
  description: string;
  icon: string;
  image_url?: string | null;
  accent: string;
  shopsCount?: number;
};

export type RewardOffer = {
  id: string;
  categoryId: string;
  productName: string;
  businessName: string;
  businessLogo?: string;
  rating: number;
  distanceMeters: number;
  originalPrice: number;
  offerPrice: number;
  discountPercent: number;
  coinsRequired: number;
  availableQuantity: number;
  expiresAt: string;
  imageUrl?: string | null;
  description: string;
  branchNames: string[];
  status: 'approved' | 'pending';
  isActive: boolean;
};

export const dailyRewardSchedule = [
  { day: 1, amount: 20 },
  { day: 2, amount: 30 },
  { day: 3, amount: 40 },
  { day: 4, amount: 50 },
  { day: 5, amount: 75 },
  { day: 6, amount: 100 },
  { day: 7, amount: 200 },
];

export const defaultRewardBalance = 1250;

export const rewardCategories: RewardCategory[] = [
  { id: 'screen_protector', name: 'اسكرينات حماية', description: 'حماية شاشات الهواتف', icon: 'shield', accent: 'from-sky-500 to-blue-600', image_url: null, shopsCount: 12 },
  { id: 'phone_grips', name: 'جرابات موبايل', description: 'جرابات وأكسسوارات ذكية', icon: 'smartphone', accent: 'from-violet-500 to-purple-600', image_url: null, shopsCount: 18 },
  { id: 'chargers', name: 'شواحن', description: 'شواحن وكابلات', icon: 'battery', accent: 'from-amber-500 to-orange-600', image_url: null, shopsCount: 15 },
  { id: 'headphones', name: 'سماعات', description: 'سماعات لاسلكية', icon: 'headphones', accent: 'from-pink-500 to-rose-600', image_url: null, shopsCount: 14 },
  { id: 'cables', name: 'كابلات', description: 'كابلات شحن متكاملة', icon: 'cable', accent: 'from-cyan-500 to-teal-600', image_url: null, shopsCount: 12 },
  { id: 'car_holders', name: 'حوامل سيارات', description: 'حوامل وأدوات القيادة', icon: 'car', accent: 'from-emerald-500 to-green-600', image_url: null, shopsCount: 8 },
  { id: 'smart_watches', name: 'ساعات ذكية', description: 'ساعات ذكية وأكسسوارات', icon: 'watch', accent: 'from-indigo-500 to-blue-700', image_url: null, shopsCount: 10 },
  { id: 'other_accessories', name: 'إكسسوارات أخرى', description: 'اكسسوارات متنوعة', icon: 'gift', accent: 'from-orange-500 to-yellow-600', image_url: null, shopsCount: 9 },
  { id: 'services', name: 'خدمات وصيانة', description: 'خدمات صيانة وترميم', icon: 'wrench', accent: 'from-slate-500 to-slate-700', image_url: null, shopsCount: 7 },
];

export const rewardOffers: RewardOffer[] = [
  {
    id: 'offer-screen-protector-abc',
    categoryId: 'screen_protector',
    productName: 'اسكرينة حماية iPhone',
    businessName: 'ABC Mobile',
    businessLogo: 'ABC',
    rating: 4.8,
    distanceMeters: 350,
    originalPrice: 300,
    offerPrice: 225,
    discountPercent: 25,
    coinsRequired: 1000,
    availableQuantity: 35,
    expiresAt: '2026-10-30T23:59:59.000Z',
    imageUrl: null,
    description: 'زجاجة حماية مقاومة للخدوش مع طبقة مضادة للضوء.',
    branchNames: ['فرع الروضة', 'فرع المدينة'],
    status: 'approved',
    isActive: true,
  },
  {
    id: 'offer-screen-protector-smart',
    categoryId: 'screen_protector',
    productName: 'اسكرينة حماية Samsung',
    businessName: 'Smart Store',
    businessLogo: 'SS',
    rating: 4.6,
    distanceMeters: 700,
    originalPrice: 150,
    offerPrice: 120,
    discountPercent: 20,
    coinsRequired: 800,
    availableQuantity: 18,
    expiresAt: '2026-10-28T23:59:59.000Z',
    imageUrl: null,
    description: 'حماية كاملة مع لمسة شفافة ومتانة عالية.',
    branchNames: ['فرع النيل'],
    status: 'approved',
    isActive: true,
  },
  {
    id: 'offer-screen-protector-mobile',
    categoryId: 'screen_protector',
    productName: 'اسكرينة حماية إنفيديا',
    businessName: 'Mobile World',
    businessLogo: 'MW',
    rating: 4.5,
    distanceMeters: 1200,
    originalPrice: 200,
    offerPrice: 140,
    discountPercent: 30,
    coinsRequired: 900,
    availableQuantity: 24,
    expiresAt: '2026-10-25T23:59:59.000Z',
    imageUrl: null,
    description: 'إطار بلمسة ناعمة وواضحة مع حماية كاملة.',
    branchNames: ['فرع الدقي', 'فرع العاشر'],
    status: 'approved',
    isActive: true,
  },
  {
    id: 'offer-grip-elite',
    categoryId: 'phone_grips',
    productName: 'جراب موبايل فخم',
    businessName: 'Elite Cases',
    businessLogo: 'EC',
    rating: 4.7,
    distanceMeters: 430,
    originalPrice: 180,
    offerPrice: 120,
    discountPercent: 33,
    coinsRequired: 850,
    availableQuantity: 45,
    expiresAt: '2026-10-29T23:59:59.000Z',
    imageUrl: null,
    description: 'جراب مقاوم للضرب مع غطاء ممتاز للبالك.',
    branchNames: ['فرع الجيزة'],
    status: 'approved',
    isActive: true,
  },
  {
    id: 'offer-charger-giga',
    categoryId: 'chargers',
    productName: 'شاحن سريع 65 واط',
    businessName: 'Giga Tech',
    businessLogo: 'GT',
    rating: 4.4,
    distanceMeters: 980,
    originalPrice: 420,
    offerPrice: 310,
    discountPercent: 26,
    coinsRequired: 1500,
    availableQuantity: 12,
    expiresAt: '2026-10-27T23:59:59.000Z',
    imageUrl: null,
    description: 'شاحن فائق السرعة مناسب للايفون والاندرويد.',
    branchNames: ['فرع المطار'],
    status: 'approved',
    isActive: true,
  },
  {
    id: 'offer-headphone-audio',
    categoryId: 'headphones',
    productName: 'سماعات لاسلكية Pro',
    businessName: 'Audio Hub',
    businessLogo: 'AH',
    rating: 4.9,
    distanceMeters: 560,
    originalPrice: 600,
    offerPrice: 450,
    discountPercent: 25,
    coinsRequired: 1800,
    availableQuantity: 7,
    expiresAt: '2026-10-30T23:59:59.000Z',
    imageUrl: null,
    description: 'سماعات عزل ضوضاء مع صوت نقي.',
    branchNames: ['فرع النزهة'],
    status: 'approved',
    isActive: true,
  },
  {
    id: 'offer-cable-fastlink',
    categoryId: 'cables',
    productName: 'كابل شحن USB-C',
    businessName: 'Fast Link',
    businessLogo: 'FL',
    rating: 4.3,
    distanceMeters: 840,
    originalPrice: 180,
    offerPrice: 135,
    discountPercent: 25,
    coinsRequired: 700,
    availableQuantity: 30,
    expiresAt: '2026-10-31T23:59:59.000Z',
    imageUrl: null,
    description: 'كابل شحن قوي ومتين يدعم الشحن السريع.',
    branchNames: ['فرع النور'],
    status: 'approved',
    isActive: true,
  },
  {
    id: 'offer-watch-fit',
    categoryId: 'smart_watches',
    productName: 'ساعة ذكية Fit 7',
    businessName: 'Time Tech',
    businessLogo: 'TT',
    rating: 4.5,
    distanceMeters: 620,
    originalPrice: 950,
    offerPrice: 720,
    discountPercent: 24,
    coinsRequired: 2200,
    availableQuantity: 9,
    expiresAt: '2026-10-26T23:59:59.000Z',
    imageUrl: null,
    description: 'ساعة ذكية تدعم اللياقة والاتصالات.',
    branchNames: ['فرع الممشى'],
    status: 'approved',
    isActive: true,
  },
];

export const coinPricingRules = [
  { min: 10, max: 25, coins: 250 },
  { min: 26, max: 50, coins: 500 },
  { min: 51, max: 100, coins: 1000 },
  { min: 101, max: 150, coins: 1500 },
  { min: 151, max: 250, coins: 2000 },
  { min: 251, max: 400, coins: 3000 },
  { min: 401, max: Number.POSITIVE_INFINITY, coins: 5000 },
];

export const getCoinRuleForDiscount = (discountAmount: number) => {
  const match = coinPricingRules.find((rule) => discountAmount >= rule.min && discountAmount <= rule.max);
  if (match) return match.coins;
  const fallback = coinPricingRules[coinPricingRules.length - 1];
  return fallback ? fallback.coins : 0;
};

export const getCategoryIcon = (iconName: string) => {
  switch (iconName) {
    case 'shield': return Shield;
    case 'smartphone': return Smartphone;
    case 'battery': return Gift;
    case 'headphones': return Headphones;
    case 'cable': return Cable;
    case 'car': return Car;
    case 'watch': return Watch;
    case 'gift': return Gift;
    case 'wrench': return Wrench;
    default: return Shield;
  }
};

export const getRewardBalanceFromStorage = () => {
  if (typeof window === 'undefined') return defaultRewardBalance;
  try {
    const raw = window.localStorage.getItem('imei-safe-reward-balance');
    return raw ? Number(raw) || defaultRewardBalance : defaultRewardBalance;
  } catch {
    return defaultRewardBalance;
  }
};

export const setRewardBalanceInStorage = (value: number) => {
  if (typeof window === 'undefined') return;
  const nextValue = Number.isFinite(value) ? value : defaultRewardBalance;
  window.localStorage.setItem('imei-safe-reward-balance', String(nextValue));

  if (typeof window.CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('imei-safe-reward-balance-updated', {
      detail: nextValue,
    }));
  }
};

export const getDailyClaimedDays = () => {
  if (typeof window === 'undefined') return [] as number[];
  try {
    const raw = window.localStorage.getItem('imei-safe-daily-claimed-days');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((value) => Number(value)).filter(Boolean) : [];
  } catch {
    return [] as number[];
  }
};

export const setDailyClaimedDays = (days: number[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('imei-safe-daily-claimed-days', JSON.stringify(days));
};

export const getRedemptions = () => {
  if (typeof window === 'undefined') return [] as any[];
  try {
    const raw = window.localStorage.getItem('imei-safe-reward-redemptions');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [] as any[];
  }
};

export const setRedemptions = (items: any[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('imei-safe-reward-redemptions', JSON.stringify(items));
};
