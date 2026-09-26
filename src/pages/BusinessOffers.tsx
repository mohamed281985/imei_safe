import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Clock3, ImagePlus, Loader2, Plus, Send, Store, X } from 'lucide-react';
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

const BusinessOffers: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
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
    try {
      const response = await axiosInstance.get('/api/business/offers');
      setOffers(response.data?.offers || []);
    } catch (loadError) {
      console.error('Could not load business offers:', loadError);
      setError('تعذر تحميل عروض المتجر. حاول مرة أخرى.');
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

  return (
    <PageContainer>
      <AppNavbar />
      <main className="mx-auto w-full max-w-3xl">
        {step === 0 && (
          <>
            <header className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Store className="h-5 w-5" /></span>
                <div><h1 className="text-xl font-black text-slate-900">لوحة عروض المتجر</h1><p className="text-sm text-slate-500">أضف عروضك وتابع مراجعتها</p></div>
              </div>
              <Button type="button" onClick={startOffer} className="shrink-0 gap-2 bg-orange-500 font-bold hover:bg-orange-600"><Plus className="h-4 w-4" /><span className="hidden sm:inline">إضافة عرض جديد</span><span className="sm:hidden">إضافة</span></Button>
            </header>

            <div className="mb-5 grid grid-cols-3 gap-2">
              {[
                ['كل العروض', offers.length, 'bg-blue-50 text-blue-800'],
                ['قيد المراجعة', offers.filter((offer) => offer.status === 'pending').length, 'bg-amber-50 text-amber-800'],
                ['معتمدة', offers.filter((offer) => offer.status === 'approved').length, 'bg-emerald-50 text-emerald-800'],
              ].map(([label, count, color]) => (
                <div key={String(label)} className={`rounded-xl p-3 ${color}`}><div className="text-xl font-black">{count}</div><div className="text-[11px] font-bold sm:text-xs">{label}</div></div>
              ))}
            </div>

            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-3 font-black text-slate-900">عروض المتجر</h2>
              {loading ? <div className="py-10 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />جارٍ تحميل العروض...</div> : offers.length ? (
                <div className="divide-y divide-slate-100">
                  {offers.map((offer) => (
                    <article key={offer.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0"><h3 className="truncate font-bold text-slate-800">{offer.product_name}</h3><p className="mt-1 text-xs text-slate-500">{t(ACCESSORY_CATEGORIES.find((category) => category.value === offer.category)?.labelKey || offer.category)} · {new Intl.NumberFormat('en-US').format(offer.offer_price)} ج.م</p></div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${offer.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : offer.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{statusLabels[offer.status] || statusLabels.pending}</span>
                    </article>
                  ))}
                </div>
              ) : <div className="py-10 text-center"><Store className="mx-auto mb-3 h-10 w-10 text-slate-300" /><p className="font-bold text-slate-700">لا توجد عروض بعد</p><p className="mt-1 text-sm text-slate-500">ابدأ بإضافة أول عرض لمتجرك</p></div>}
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
              <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">اسم العرض <b className="text-rose-500">*</b></span><input value={form.productName} onChange={(event) => updateForm('productName', event.target.value)} maxLength={120} placeholder="مثال: جراب حماية iPhone 15" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500" /></label>
              <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">وصف العرض <b className="text-rose-500">*</b></span><textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} rows={3} maxLength={1500} placeholder="اكتب تفاصيل المنتج ومميزاته" className="w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500" /></label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="business-offer-category" className="mb-1 flex items-center gap-1 text-base font-bold text-slate-700">تصنيف العرض</label>
                  <Select value={form.category} onValueChange={(value) => updateForm('category', value)}>
                    <SelectTrigger id="business-offer-category" className="h-auto min-h-12 w-full min-w-0 max-w-full rounded-2xl border-blue-300/50 bg-white px-4 py-3 text-right text-sm font-bold text-slate-800 shadow-[0_2px_10px_rgba(37,99,235,0.08)] transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60 focus:shadow-[0_6px_18px_rgba(37,99,235,0.18)] sm:text-base">
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
                <label className="space-y-1.5"><span className="text-sm font-bold text-slate-700">السعر الأصلي (ج.م) <b className="text-rose-500">*</b></span><input type="number" min="0.01" step="0.01" value={form.originalPrice} onChange={(event) => updateForm('originalPrice', event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label>
                <label className="space-y-1.5"><span className="text-sm font-bold text-slate-700">سعر العرض (ج.م) <b className="text-rose-500">*</b></span><input type="number" min="0.01" step="0.01" value={form.offerPrice} onChange={(event) => updateForm('offerPrice', event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label>
                <label className="space-y-1.5"><span className="text-sm font-bold text-slate-700">النقاط المطلوبة</span><input type="number" min="0" step="1" value={form.coinsRequired} onChange={(event) => updateForm('coinsRequired', event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label>
              </div>
              <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">تاريخ انتهاء العرض <b className="text-rose-500">*</b></span><input type="date" min={new Date().toISOString().slice(0, 10)} value={form.expiresAt} onChange={(event) => updateForm('expiresAt', event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label>
              <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">ملاحظات إضافية</span><textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={2} maxLength={500} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label>
              {discount > 0 && <div className="flex justify-between rounded-xl bg-rose-50 px-3 py-2 text-sm"><span className="text-rose-800">نسبة الخصم</span><strong className="text-rose-800">{discount}%</strong></div>}
              <Button type="button" disabled={!form.productName.trim() || !form.description.trim() || !form.expiresAt || discount <= 0 || !Number.isInteger(Number(form.coinsRequired)) || Number(form.coinsRequired) < 0} onClick={() => { setError(''); setStep(2); }} className="w-full bg-blue-600 font-bold hover:bg-blue-700">التالي: إضافة الصور</Button>
            </div>}

            {step === 2 && <div className="space-y-4 p-4 sm:p-6">
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-5 text-center hover:border-blue-400"><ImagePlus className="mb-2 h-8 w-8 text-blue-600" /><span className="font-bold text-slate-800">إضافة صور العرض</span><span className="mt-1 text-xs text-slate-500">حتى 5 صور، بحد أقصى 8 ميجابايت للصورة</span><input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { addImages(event.target.files); event.currentTarget.value = ''; }} /></label>
              {images.length > 0 && <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">{images.map((file, index) => <div key={`${file.name}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-slate-200"><img src={previews[index]} alt={file.name} className="h-full w-full object-cover" />{index === 0 && <span className="absolute bottom-1 left-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">الصورة الرئيسية</span>}<button type="button" onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-rose-600" aria-label="حذف الصورة"><X className="h-4 w-4" /></button></div>)}</div>}
              <div className="flex gap-3"><Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">السابق</Button><Button type="button" disabled={!images.length} onClick={() => { setError(''); setStep(3); }} className="flex-1 bg-blue-600 font-bold hover:bg-blue-700">معاينة العرض</Button></div>
            </div>}

            {step === 3 && <div className="space-y-4 p-4 sm:p-6">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <img src={previews[0]} alt={form.productName} className="h-52 w-full object-cover" />
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-500">{t(ACCESSORY_CATEGORIES.find((category) => category.value === form.category)?.labelKey || form.category)}</p><h2 className="mt-1 font-black text-slate-900">{form.productName}</h2></div><span className="rounded-lg bg-rose-100 px-2 py-1 text-xs font-black text-rose-700">خصم {discount}%</span></div>
                  <p className="text-sm leading-6 text-slate-600">{form.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><span className="font-black text-orange-700">{new Intl.NumberFormat('en-US').format(Number(form.offerPrice))} ج.م</span><span className="text-slate-400 line-through">{new Intl.NumberFormat('en-US').format(Number(form.originalPrice))} ج.م</span><span className="font-bold text-amber-700">{new Intl.NumberFormat('en-US').format(Number(form.coinsRequired))} Coins</span></div>
                </div>
              </div>
              {previews.length > 1 && <div className="grid grid-cols-4 gap-2">{previews.slice(1).map((preview, index) => <img key={preview} src={preview} alt={`صورة العرض ${index + 2}`} className="aspect-square w-full rounded-lg object-cover" />)}</div>}
              <div className="flex gap-3"><Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1">تعديل الصور</Button><Button type="button" disabled={submitting} onClick={() => void submitOffer()} className="flex-1 gap-2 bg-orange-500 font-bold hover:bg-orange-600">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}إرسال للمراجعة</Button></div>
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