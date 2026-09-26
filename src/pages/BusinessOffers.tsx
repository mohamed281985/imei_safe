import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgePercent, CalendarDays, Check, Clock3, Coins, ImagePlus, Loader2, MapPin, Plus, RefreshCw, Search, Send, Store, X } from 'lucide-react';
import axiosInstance from '@/services/axiosInterceptor';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import AppNavbar from '@/components/AppNavbar';
import PageContainer from '@/components/PageContainer';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACCESSORY_CATEGORIES } from '@/constants/accessoryCategories';
import { useLanguage } from '@/contexts/LanguageContext';

type OfferImage = { id: string; image_path: string; main_image: boolean; sort_order: number };
type Offer = {
  id: string;
  product_name: string;
  category: string;
  offer_price: number;
  original_price: number;
  expires_at: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  business_offer_images?: OfferImage[];
};

type OfferForm = {
  productName: string;
  description: string;
  category: string;
  originalPrice: string;
  offerPrice: string;
  coinsRequired: string;
  expiresAt: string;
  notes: string;
};

const emptyForm: OfferForm = {
  productName: '', description: '', category: 'cases',
  originalPrice: '', offerPrice: '', coinsRequired: '1000', expiresAt: '', notes: '',
};

const statusLabels = {
  pending: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
};

const getCurrentStoreLocation = (): Promise<{ storeLatitude: number; storeLongitude: number }> => new Promise((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error('هذا الجهاز لا يدعم تحديد الموقع.'));
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ storeLatitude: coords.latitude, storeLongitude: coords.longitude }),
    () => reject(new Error('تعذر تحديد موقع المتجر. اسمح بالوصول للموقع وأرسل العرض من المتجر.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
});

const BusinessOffers: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [form, setForm] = useState<OfferForm>(emptyForm);
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const nextPreviews = images.map((file) => URL.createObjectURL(file));
    setPreviews(nextPreviews);
    return () => nextPreviews.forEach((url) => URL.revokeObjectURL(url));
  }, [images]);

  const discount = useMemo(() => {
    const original = Number(form.originalPrice);
    const offer = Number(form.offerPrice);
    return original > 0 && offer >= 0 && offer < original
      ? Math.round(((original - offer) / original) * 100)
      : 0;
  }, [form.originalPrice, form.offerPrice]);

  const loadOffers = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await axiosInstance.get('/api/business/offers');
      setOffers(response.data?.offers || []);
    } catch (loadError) {
      console.error('Could not load business offers:', loadError);
      setLoadError('تعذر تحميل العروض الآن. تحقق من الاتصال ثم أعد المحاولة.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOffers();
  }, []);

  const updateForm = (field: keyof OfferForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const additions = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (images.length + additions.length > 5) {
      setError('يمكنك إضافة 5 صور كحد أقصى.');
      return;
    }
    if (additions.some((file) => file.size > 8 * 1024 * 1024)) {
      setError('حجم الصورة الواحدة يجب ألا يتجاوز 8 ميجابايت.');
      return;
    }
    setError('');
    setImages((current) => [...current, ...additions]);
  };

  const submitOffer = async () => {
    if (!user?.id) {
      setError('يجب تسجيل الدخول لإرسال العرض.');
      return;
    }
    setSubmitting(true);
    setError('');
    const token = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const uploadedPaths: string[] = [];

    try {
      const storeLocation = await getCurrentStoreLocation();
      for (const [index, file] of images.entries()) {
        const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `${user.id}/${token}/${index + 1}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('business-offer-images')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
      }

      await axiosInstance.post('/api/business/offers', {
        ...form,
        originalPrice: Number(form.originalPrice),
        offerPrice: Number(form.offerPrice),
        coinsRequired: Number(form.coinsRequired),
        discountPercent: discount,
        imagePaths: uploadedPaths,
        ...storeLocation,
      });
      setStep(4);
      await loadOffers();
    } catch (submitError: any) {
      if (uploadedPaths.length) {
        await supabase.storage.from('business-offer-images').remove(uploadedPaths);
      }
      console.error('Could not submit business offer:', submitError);
      setError(submitError?.response?.data?.error || submitError?.message || 'تعذر إرسال العرض. تحقق من الاتصال وحاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  const startOffer = () => {
    setForm(emptyForm);
    setImages([]);
    setError('');
    setStep(1);
  };

  const stepNames = ['تفاصيل العرض', 'رفع الصور', 'معاينة العرض'];
  const visibleOffers = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return offers.filter((offer) => {
      const matchesStatus = statusFilter === 'all' || offer.status === statusFilter;
      const categoryName = t(ACCESSORY_CATEGORIES.find((category) => category.value === offer.category)?.labelKey || offer.category);
      const matchesSearch = !query || `${offer.product_name} ${categoryName}`.toLocaleLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [offers, searchQuery, statusFilter, t]);

  return (
    <PageContainer>
      <AppNavbar />
      <main className="mx-auto w-full max-w-3xl">
        {step === 0 && (
          <>
            <header className="mb-6 flex items-center justify-between gap-3 sm:gap-4">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white sm:h-12 sm:w-12"><Store className="h-5 w-5 sm:h-6 sm:w-6" /></span>
                <div className="min-w-0"><h1 className="whitespace-nowrap text-xl font-black text-slate-900 sm:text-3xl">عروض المتجر</h1><p className="hidden text-sm text-slate-500 sm:mt-0.5 sm:block">إدارة العروض ومتابعة حالة مراجعتها</p></div>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={startOffer} aria-label="إضافة عرض" className="h-11 shrink-0 gap-1.5 rounded-xl bg-orange-500 px-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 sm:h-12 sm:gap-2 sm:px-5 sm:text-base"><Plus className="h-4 w-4 sm:h-5 sm:w-5" /><span className="whitespace-nowrap">إضافة عرض</span></Button>
              </div>
            </header>

            <div className="mb-6 grid grid-cols-3 divide-x divide-x-reverse divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {[
                { label: 'إجمالي العروض', count: offers.length, color: 'text-slate-900' },
                { label: 'قيد المراجعة', count: offers.filter((offer) => offer.status === 'pending').length, color: 'text-amber-700' },
                { label: 'معتمدة', count: offers.filter((offer) => offer.status === 'approved').length, color: 'text-emerald-700' },
              ].map((item) => (
                <div key={item.label} className="min-w-0 px-2 py-3 sm:px-4 sm:py-4"><p className={`text-lg font-black tabular-nums sm:text-2xl ${item.color}`}>{item.count}</p><p className="mt-0.5 truncate text-[10px] font-medium text-slate-500 sm:text-xs">{item.label}</p></div>
              ))}
            </div>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="ابحث عن عرض أو تصنيف" className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-9 pl-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
                </div>
                <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1" role="tablist" aria-label="تصفية العروض">
                  {[
                    ['all', 'الكل'], ['pending', 'قيد المراجعة'], ['approved', 'معتمدة'], ['rejected', 'مرفوضة'],
                  ].map(([value, label]) => (
                    <button key={value} type="button" role="tab" aria-selected={statusFilter === value} onClick={() => setStatusFilter(value as typeof statusFilter)} className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${statusFilter === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-slate-700" />جارٍ تحميل العروض</div>
              ) : loadError ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-4 text-center"><p className="text-sm text-rose-700">{loadError}</p><Button type="button" variant="outline" onClick={() => void loadOffers()} className="h-9 gap-2 rounded-lg"><RefreshCw className="h-4 w-4" />إعادة المحاولة</Button></div>
              ) : visibleOffers.length ? (
                <div className="divide-y divide-slate-100">
                  {visibleOffers.map((offer) => {
                    const categoryName = t(ACCESSORY_CATEGORIES.find((category) => category.value === offer.category)?.labelKey || offer.category);
                    const imagePath = offer.business_offer_images?.find((image) => image.main_image)?.image_path || offer.business_offer_images?.[0]?.image_path;
                    const imageUrl = imagePath ? supabase.storage.from('business-offer-images').getPublicUrl(imagePath).data.publicUrl : null;
                    return (
                      <article key={offer.id} className="flex items-center gap-3 p-3 transition-colors hover:bg-slate-50/70 sm:gap-4 sm:px-4 sm:py-3.5">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 sm:h-[72px] sm:w-[72px]">
                          {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full w-full items-center justify-center text-slate-300"><BadgePercent className="h-7 w-7" /></div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2"><h3 className="max-w-full truncate text-sm font-bold text-slate-900 sm:text-base">{offer.product_name}</h3><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${offer.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : offer.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>{statusLabels[offer.status] || statusLabels.pending}</span></div>
                          <p className="mt-1 truncate text-xs text-slate-500">{categoryName}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span className="font-extrabold tabular-nums text-slate-900">{new Intl.NumberFormat('en-US').format(offer.offer_price)} <span className="font-medium text-slate-500">ج.م</span></span>
                            <span className="text-slate-400 line-through">{new Intl.NumberFormat('en-US').format(offer.original_price)} ج.م</span>
                            {offer.expires_at && <span className="inline-flex items-center gap-1 text-slate-500"><CalendarDays className="h-3.5 w-3.5" />ينتهي {new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(offer.expires_at))}</span>}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center"><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Store className="h-5 w-5" /></span><p className="font-bold text-slate-800">{offers.length ? 'لا توجد نتائج مطابقة' : 'لا توجد عروض بعد'}</p><p className="mt-1 max-w-sm text-sm text-slate-500">{offers.length ? 'جرّب تغيير عبارة البحث أو فلتر الحالة.' : 'ابدأ بإضافة أول عرض لمتجرك، وستتابع حالته من هنا.'}</p>{!offers.length && <Button type="button" onClick={startOffer} className="mt-4 h-9 gap-2 rounded-lg bg-slate-900 text-white hover:bg-slate-700"><Plus className="h-4 w-4" />إضافة أول عرض</Button>}</div>
              )}
            </section>
          </>
        )}

        {step > 0 && step < 4 && (
          <section className="rounded-[28px] border-2 border-blue-300 bg-gradient-to-br from-blue-100 via-white to-cyan-100 shadow-lg">
            <div className="overflow-hidden rounded-2xl bg-white/90 shadow-sm ring-1 ring-slate-200">
            <header className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-3 border-b border-blue-200/70 bg-gradient-to-br from-blue-100 via-white to-cyan-100 px-4 py-4">
              <button type="button" onClick={() => step === 1 ? setStep(0) : setStep((step - 1) as 1 | 2 | 3)} className="col-start-1 row-start-1 rounded-full bg-slate-100 p-2 text-slate-700" aria-label="رجوع"><ArrowLeft className="h-4 w-4" /></button>
              <div className="col-start-2 row-start-1 text-center"><h1 className="text-xl font-black text-slate-900 sm:text-2xl">إضافة عرض جديد</h1><p className="text-xs text-slate-500">المرحلة {step} من 3</p></div>
            </header>
            <div className="grid grid-cols-3 border-b border-slate-100">
              {stepNames.map((name, index) => <div key={name} className={`border-b-2 px-1 py-3 text-center text-[11px] font-bold sm:text-sm ${step === index + 1 ? 'border-blue-600 text-blue-700' : step > index + 1 ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-400'}`}>{name}</div>)}
            </div>

            {step === 1 && <div className="space-y-4 p-4 sm:p-6">
              <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">اسم العرض <b className="text-rose-500">*</b></span><input value={form.productName} onChange={(event) => updateForm('productName', event.target.value)} maxLength={120} placeholder="مثال: جراب حماية iPhone 15" className="w-full rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-base font-medium text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60" /></label>
              <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">وصف العرض <b className="text-rose-500">*</b></span><textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} rows={3} maxLength={1500} placeholder="اكتب تفاصيل المنتج ومميزاته" className="w-full resize-y rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-base font-medium text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60" /></label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="business-offer-category" className="mb-1 flex items-center gap-1 text-base font-bold text-slate-700">تصنيف العرض</label>
                  <Select value={form.category} onValueChange={(value) => updateForm('category', value)}>
                    <SelectTrigger id="business-offer-category" className="h-auto min-h-12 w-full min-w-0 max-w-full rounded-2xl border-blue-300/50 bg-white px-4 py-3 text-right text-base font-semibold text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60 focus:shadow-[0_6px_18px_rgba(37,99,235,0.18)]">
                      <SelectValue placeholder="اختر التصنيف" />
                    </SelectTrigger>
                    <SelectContent position="popper" align="end" sideOffset={6} className="z-[120] max-h-[min(60vh,22rem)] w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border-blue-200 bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
                      {ACCESSORY_CATEGORIES.map((category) => (
                        <SelectItem key={category.value} value={category.value} className="min-h-11 cursor-pointer rounded-xl py-2.5 pr-3 text-right text-sm font-semibold text-slate-800 focus:bg-blue-50 focus:text-blue-900 sm:text-base">
                          {t(category.labelKey) || category.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="space-y-1.5"><span className="text-sm font-bold text-slate-700">السعر الأصلي (ج.م) <b className="text-rose-500">*</b></span><input type="number" min="0.01" step="0.01" value={form.originalPrice} onChange={(event) => updateForm('originalPrice', event.target.value)} className="w-full rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-base font-medium text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60" /></label>
                <label className="space-y-1.5"><span className="text-sm font-bold text-slate-700">سعر العرض (ج.م) <b className="text-rose-500">*</b></span><input type="number" min="0.01" step="0.01" value={form.offerPrice} onChange={(event) => updateForm('offerPrice', event.target.value)} className="w-full rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-base font-medium text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60" /></label>
                <label className="space-y-1.5"><span className="text-sm font-bold text-slate-700">النقاط المطلوبة</span><input type="number" min="0" step="1" value={form.coinsRequired} onChange={(event) => updateForm('coinsRequired', event.target.value)} className="w-full rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-base font-medium text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60" /></label>
              </div>
              <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">تاريخ انتهاء العرض <b className="text-rose-500">*</b></span><input type="date" min={new Date().toISOString().slice(0, 10)} value={form.expiresAt} onChange={(event) => updateForm('expiresAt', event.target.value)} className="w-full rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-base font-medium text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60" /></label>
              <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">ملاحظات إضافية</span><textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={2} maxLength={500} className="w-full rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-base font-medium text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60" /></label>
              {discount > 0 && <div className="flex justify-between rounded-xl bg-rose-50 px-3 py-2 text-sm"><span className="text-rose-800">نسبة الخصم</span><strong className="text-rose-800">{discount}%</strong></div>}
              <Button type="button" disabled={!form.productName.trim() || !form.description.trim() || !form.expiresAt || discount <= 0 || !Number.isInteger(Number(form.coinsRequired)) || Number(form.coinsRequired) < 0} onClick={() => { setError(''); setStep(2); }} className="w-full bg-blue-600 font-bold hover:bg-blue-700">التالي: إضافة الصور</Button>
            </div>}

            {step === 2 && <div className="space-y-4 p-4 sm:p-6">
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-5 text-center hover:border-blue-400"><ImagePlus className="mb-2 h-8 w-8 text-blue-600" /><span className="font-bold text-slate-800">إضافة صور العرض</span><span className="mt-1 text-xs text-slate-500">حتى 5 صور، بحد أقصى 8 ميجابايت للصورة</span><input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { addImages(event.target.files); event.currentTarget.value = ''; }} /></label>
              {images.length > 0 && <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">{images.map((file, index) => <div key={`${file.name}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-slate-200"><img src={previews[index]} alt={file.name} className="h-full w-full object-cover" />{index === 0 && <span className="absolute bottom-1 left-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">الصورة الرئيسية</span>}<button type="button" onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-rose-600" aria-label="حذف الصورة"><X className="h-4 w-4" /></button></div>)}</div>}
              <div className="flex gap-3"><Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">السابق</Button><Button type="button" disabled={!images.length} onClick={() => { setError(''); setStep(3); }} className="flex-1 bg-blue-600 font-bold hover:bg-blue-700">معاينة العرض</Button></div>
            </div>}

            {step === 3 && <div className="space-y-4 p-4 sm:p-6">
              <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                <span>لإظهار العرض للمستخدمين القريبين، أرسل العرض من موقع المتجر واسمح بالوصول إلى الموقع.</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="relative">
                  <img src={previews[0]} alt={form.productName} className="h-52 w-full bg-slate-100 object-cover sm:h-64" />
                  <span className="absolute left-3 top-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-black text-white shadow-md">خصم {discount}%</span>
                </div>
                <div className="space-y-4 p-4 sm:p-5">
                  <div>
                    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{t(ACCESSORY_CATEGORIES.find((category) => category.value === form.category)?.labelKey || form.category)}</span>
                    <h2 className="mt-2 text-xl font-black leading-snug text-slate-900 sm:text-2xl">{form.productName}</h2>
                  </div>
                  <p className="whitespace-pre-line border-t border-slate-100 pt-3 text-sm leading-6 text-slate-600">{form.description}</p>
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Clock3 className="h-4 w-4 text-blue-600" aria-hidden="true" />
                    <span>ينتهي العرض في</span>
                    <span className="font-bold tabular-nums text-slate-800">
                      {new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${form.expiresAt}T00:00:00`))}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-4">
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-500">سعر العرض</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black tabular-nums text-orange-600">{new Intl.NumberFormat('en-US').format(Number(form.offerPrice))}</span>
                        <span className="text-sm font-bold text-slate-600">ج.م</span>
                        <span className="text-sm tabular-nums text-slate-400 line-through">{new Intl.NumberFormat('en-US').format(Number(form.originalPrice))}</span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-800">
                      <Coins className="h-4 w-4 text-amber-600" aria-hidden="true" />
                      {new Intl.NumberFormat('en-US').format(Number(form.coinsRequired))} Coins
                    </span>
                  </div>
                </div>
              </div>
              {previews.length > 1 && <div className="grid grid-cols-4 gap-2">{previews.slice(1).map((preview, index) => <img key={preview} src={preview} alt={`صورة العرض ${index + 2}`} className="aspect-square w-full rounded-lg object-cover" />)}</div>}
              <div className="flex gap-3"><Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1">تعديل الصور</Button><Button type="button" disabled={submitting} onClick={() => void submitOffer()} className="flex-1 gap-2 bg-orange-500 font-bold text-white hover:bg-orange-600">{submitting ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Send className="h-4 w-4 text-white" />}إرسال للمراجعة</Button></div>
            </div>}
            </div>
          </section>
        )}

        {step === 4 && <section className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 sm:p-10"><span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-8 w-8" /></span><h1 className="text-2xl font-black text-slate-900">تم إرسال العرض بنجاح</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">تم استلام العرض وسيظهر بعد مراجعته واعتماده من الإدارة.</p><div className="mx-auto mt-5 flex max-w-xs items-center justify-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"><Clock3 className="h-4 w-4" />حالة العرض: قيد المراجعة</div><div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center"><Button type="button" onClick={() => setStep(0)} variant="outline">العودة إلى العروض</Button><Button type="button" onClick={startOffer} className="gap-2 bg-blue-600"><Plus className="h-4 w-4" />إضافة عرض آخر</Button></div></section>}

        {error && <div role="alert" className="mt-3 flex items-start justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="إغلاق"><X className="h-4 w-4" /></button></div>}
      </main>
    </PageContainer>
  );
};

export default BusinessOffers;