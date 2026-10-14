import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgePercent, CalendarDays, Check, Clock3, Coins, ImagePlus, Loader2, MapPin, Plus, RefreshCw, Search, Send, Store, Trash2, X } from 'lucide-react';
import axiosInstance from '@/services/axiosInterceptor';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import AppNavbar from '@/components/AppNavbar';
import PageContainer from '@/components/PageContainer';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACCESSORY_CATEGORIES } from '@/constants/accessoryCategories';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCountryCurrency } from '@/hooks/useCountryCurrency';
import { pointsForDiscountPercent } from '../../shared/rewardPoints.js';
import { useGeolocated } from 'react-geolocated';
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

type OfferImage = { id: string; image_path: string; main_image: boolean; sort_order: number };
type Offer = {
  id: string;
  product_name: string;
  category: string;
  offer_price: number;
  original_price: number;
  currency_symbol?: string;
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
  expiresAt: string;
  notes: string;
};

type BusinessProfile = {
  store_name: string;
  phone: string;
  country_code: string;
  address: string;
  country: string;
};

const emptyForm: OfferForm = {
  productName: '', description: '', category: 'cases',
  originalPrice: '', offerPrice: '', expiresAt: '', notes: '',
};

const getCurrentStoreLocation = (translate: (key: string) => string): Promise<{ storeLatitude: number; storeLongitude: number }> => new Promise((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error(translate('offers_error_location_unsupported')));
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ storeLatitude: coords.latitude, storeLongitude: coords.longitude }),
    () => reject(new Error(translate('offers_error_location_denied'))),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
});

const MapUpdater: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
};

const BusinessOffers: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { currencySymbol } = useCountryCurrency();
  const { coords } = useGeolocated({
    positionOptions: { enableHighAccuracy: true },
    userDecisionTimeout: 5000,
  });
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [submitting, setSubmitting] = useState(false);
  const [deletingOfferId, setDeletingOfferId] = useState<string | null>(null);
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [form, setForm] = useState<OfferForm>(emptyForm);
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [profileReload, setProfileReload] = useState(0);
  const [storeLocation, setStoreLocation] = useState<{ storeLatitude: number; storeLongitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadBusinessProfile = async () => {
      if (!user?.id) return;
      setProfileLoading(true);
      setProfileError(false);
      try {
        const response = await axiosInstance.get('/api/decrypted-user');
        const business = response.data?.business;
        const account = response.data?.user;
        if (!business) throw new Error('Business profile is missing');
        let country = business.countries || business.country || account?.countries || account?.country || '';
        if (!country) {
          try {
            const { data: userRow, error: userError } = await supabase
              .from('users')
              .select('countries')
              .eq('id', user.id)
              .maybeSingle();
            if (!userError && userRow?.countries) country = userRow.countries;
          } catch (countryError) {
            console.warn('Could not load account country for business offer:', countryError);
          }
        }
        if (!cancelled) {
          setBusinessProfile({
            store_name: business.store_name || '',
            phone: business.phone || '',
            country_code: business.country_code || account?.country_code || '',
            address: business.address || '',
            country: String(country || '').trim(),
          });
        }
      } catch (loadError) {
        console.error('Could not load business profile for offer:', loadError);
        if (!cancelled) setProfileError(true);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };
    void loadBusinessProfile();
    return () => { cancelled = true; };
  }, [user?.id, profileReload]);

  useEffect(() => {
    if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return;
    setStoreLocation((current) => current || {
      storeLatitude: coords.latitude,
      storeLongitude: coords.longitude,
    });
  }, [coords]);

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
  const requiredPoints = pointsForDiscountPercent(discount);

  const loadOffers = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await axiosInstance.get('/api/business/offers');
      setOffers(response.data?.offers || []);
    } catch (loadError) {
      console.error('Could not load business offers:', loadError);
      setLoadError(t('offers_error_load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOffers();
  }, [t]);

  const updateForm = (field: keyof OfferForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  };

  const continueToDetails = () => {
    if (!businessProfile?.store_name.trim()) {
      setError(t('offers_error_business_profile'));
      return;
    }
    if (!storeLocation) {
      setError(t('offers_error_location_required'));
      return;
    }
    setError('');
    setStep(2);
  };

  const captureStoreLocation = async () => {
    setLocationLoading(true);
    setError('');
    try {
      setStoreLocation(await getCurrentStoreLocation(t));
    } catch (locationError: any) {
      setError(locationError?.message || t('offers_error_location_denied'));
    } finally {
      setLocationLoading(false);
    }
  };

  const continueToImages = () => {
    const originalPrice = Number(form.originalPrice);
    const offerPrice = Number(form.offerPrice);
    const expirationTime = form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).getTime() : 0;

    if (!form.productName.trim() || !form.description.trim()) {
      setError(t('offers_error_name_description'));
      return;
    }
    if (!Number.isFinite(originalPrice) || !Number.isFinite(offerPrice) || originalPrice <= 0 || offerPrice <= 0 || offerPrice >= originalPrice) {
      setError(t('offers_error_prices'));
      return;
    }
    if (!discount || !requiredPoints) {
      setError(t('offers_error_discount'));
      return;
    }
    if (!form.expiresAt || !Number.isFinite(expirationTime) || expirationTime <= Date.now()) {
      setError(t('offers_error_expiry'));
      return;
    }
    setError('');
    setStep(3);
  };

  const continueToPreview = () => {
    if (!images.length) {
      setError(t('offers_error_add_image'));
      return;
    }
    setError('');
    setStep(4);
  };

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const additions = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (images.length + additions.length > 5) {
      setError(t('offers_error_max_images'));
      return;
    }
    if (additions.some((file) => file.size > 8 * 1024 * 1024)) {
      setError(t('offers_error_image_size'));
      return;
    }
    setError('');
    setImages((current) => [...current, ...additions]);
  };

  const submitOffer = async () => {
    if (!user?.id) {
      setError(t('offers_error_login'));
      return;
    }
    setSubmitting(true);
    setError('');
    const token = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const uploadedPaths: string[] = [];

    try {
      if (!storeLocation) throw new Error(t('offers_error_location_required'));
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
        coinsRequired: requiredPoints,
        discountPercent: discount,
        imagePaths: uploadedPaths,
        ...storeLocation,
      });
      setStep(5);
      await loadOffers();
    } catch (submitError: any) {
      if (uploadedPaths.length) {
        await supabase.storage.from('business-offer-images').remove(uploadedPaths);
      }
      console.error('Could not submit business offer:', submitError);
      setError(submitError?.response?.data?.error || submitError?.message || t('offers_error_submit'));
    } finally {
      setSubmitting(false);
    }
  };

  const deleteOffer = async (offer: Offer) => {
    if (!window.confirm(t('offers_delete_confirm', { name: offer.product_name }))) return;
    setDeletingOfferId(offer.id);
    setLoadError('');
    try {
      await axiosInstance.delete(`/api/business/offers/${offer.id}`);
      setOffers((current) => current.filter((item) => item.id !== offer.id));
    } catch (deleteError: any) {
      console.error('Could not delete business offer:', deleteError);
      setLoadError(deleteError?.response?.data?.error || t('offers_error_delete'));
    } finally {
      setDeletingOfferId(null);
    }
  };

  const startOffer = () => {
    setForm(emptyForm);
    setImages([]);
    setError('');
    setStep(1);
  };

  const stepNames = [t('offers_step_business'), t('offers_step_details'), t('offers_step_images'), t('offers_step_preview')];
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
                <div className="min-w-0"><h1 className="whitespace-nowrap text-xl font-black text-slate-900 sm:text-3xl">{t('offers_title')}</h1><p className="hidden text-sm text-slate-500 sm:mt-0.5 sm:block">{t('offers_subtitle')}</p></div>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={startOffer} aria-label={t('offers_add')} className="h-11 shrink-0 gap-1.5 rounded-xl bg-orange-500 px-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 sm:h-12 sm:gap-2 sm:px-5 sm:text-base"><Plus className="h-4 w-4 sm:h-5 sm:w-5" /><span className="whitespace-nowrap">{t('offers_add')}</span></Button>
              </div>
            </header>

            <div className="mb-6 grid grid-cols-3 divide-x divide-x-reverse divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {[
                { label: t('offers_total'), count: offers.length, color: 'text-slate-900' },
                { label: t('offers_pending'), count: offers.filter((offer) => offer.status === 'pending').length, color: 'text-amber-700' },
                { label: t('offers_approved'), count: offers.filter((offer) => offer.status === 'approved').length, color: 'text-emerald-700' },
              ].map((item) => (
                <div key={item.label} className="min-w-0 px-2 py-3 text-center sm:px-4 sm:py-4"><p className={`text-2xl font-black tabular-nums sm:text-4xl ${item.color}`}>{item.count}</p><p className="mt-0.5 whitespace-normal break-words text-sm font-semibold leading-snug text-slate-600 sm:text-base">{item.label}</p></div>
              ))}
            </div>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t('offers_search')} className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-9 pl-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
                </div>
                <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1" role="tablist" aria-label={t('offers_filter_aria')}>
                  {[
                    ['all', t('offers_all')], ['pending', t('offers_pending')], ['approved', t('offers_approved')], ['rejected', t('offers_rejected')],
                  ].map(([value, label]) => (
                    <button key={value} type="button" role="tab" aria-selected={statusFilter === value} onClick={() => setStatusFilter(value as typeof statusFilter)} className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${statusFilter === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-slate-700" />{t('offers_loading')}</div>
              ) : loadError ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-4 text-center"><p className="text-sm text-rose-700">{loadError}</p><Button type="button" variant="outline" onClick={() => void loadOffers()} className="h-9 gap-2 rounded-lg"><RefreshCw className="h-4 w-4" />{t('offers_retry')}</Button></div>
              ) : visibleOffers.length ? (
                <div className="divide-y divide-slate-100">
                  {visibleOffers.map((offer) => {
                    const categoryName = t(ACCESSORY_CATEGORIES.find((category) => category.value === offer.category)?.labelKey || offer.category);
                    const imagePath = offer.business_offer_images?.find((image) => image.main_image)?.image_path || offer.business_offer_images?.[0]?.image_path;
                    const imageUrl = imagePath ? supabase.storage.from('business-offer-images').getPublicUrl(imagePath).data.publicUrl : null;
                    const expiryDate = offer.expires_at ? new Date(offer.expires_at) : null;
                    const hasExpiryDate = expiryDate !== null && Number.isFinite(expiryDate.getTime());
                    const isExpired = hasExpiryDate && expiryDate.getTime() <= Date.now();
                    return (
                      <article key={offer.id} className="flex items-center justify-center gap-3 p-3 text-center transition-colors hover:bg-slate-50/70 sm:gap-4 sm:px-4 sm:py-3.5">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 sm:h-[72px] sm:w-[72px]">
                          {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full w-full items-center justify-center text-slate-300"><BadgePercent className="h-7 w-7" /></div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-center gap-2"><h3 className="max-w-full break-words text-lg font-bold leading-6 text-slate-900 sm:text-xl">{offer.product_name}</h3><span className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-bold ${isExpired ? 'bg-slate-100 text-slate-600' : offer.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : offer.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>{isExpired ? t('offers_expired') : t(`offers_${offer.status}`)}</span></div>
                          <p className="mt-1 break-words text-base text-slate-600">{categoryName}</p>
                          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-base">
                            <span className="font-extrabold tabular-nums text-slate-900">{new Intl.NumberFormat('en-US').format(offer.offer_price)} <span className="font-medium text-slate-500">{offer.currency_symbol || currencySymbol}</span></span>
                            <span className="text-slate-400 line-through">{new Intl.NumberFormat('en-US').format(offer.original_price)} {offer.currency_symbol || currencySymbol}</span>
                            {hasExpiryDate && <span className={`inline-flex items-center gap-1 ${isExpired ? 'font-semibold text-slate-600' : 'text-slate-500'}`}><CalendarDays className="h-3.5 w-3.5" />{isExpired ? t('offers_expired_verb') : t('offers_expires_verb')} {new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(expiryDate)}</span>}
                          </div>
                        </div>
                        <button type="button" onClick={() => void deleteOffer(offer)} disabled={deletingOfferId === offer.id} aria-label={t('offers_delete_aria', { name: offer.product_name })} title={t('offers_delete_title')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50">
                          {deletingOfferId === offer.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center"><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Store className="h-5 w-5" /></span><p className="font-bold text-slate-800">{offers.length ? t('offers_no_results') : t('offers_empty')}</p><p className="mt-1 max-w-sm text-sm text-slate-500">{offers.length ? t('offers_search_hint') : t('offers_empty_hint')}</p>{!offers.length && <Button type="button" onClick={startOffer} className="mt-4 h-9 gap-2 rounded-lg bg-slate-900 text-white hover:bg-slate-700"><Plus className="h-4 w-4" />{t('offers_add_first')}</Button>}</div>
              )}
            </section>
          </>
        )}

        {step > 0 && step < 5 && (
          <section className="rounded-[28px] border-2 border-blue-300 bg-gradient-to-br from-blue-100 via-white to-cyan-100 shadow-lg">
            <div className="overflow-hidden rounded-2xl bg-white/90 shadow-sm ring-1 ring-slate-200">
            <header className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-3 border-b border-blue-200/70 bg-gradient-to-br from-blue-100 via-white to-cyan-100 px-4 py-4">
              <button type="button" onClick={() => step === 1 ? setStep(0) : setStep((step - 1) as 1 | 2 | 3 | 4)} className="col-start-1 row-start-1 rounded-full bg-slate-100 p-2 text-slate-700" aria-label={t('store_back')}><ArrowLeft className="h-4 w-4" /></button>
              <div className="col-start-2 row-start-1 text-center"><h1 className="text-xl font-black text-slate-900 sm:text-2xl">{t('offers_add_new')}</h1><p className="text-xs text-slate-500">{t('offers_step', { step: String(step) })}</p></div>
            </header>
            <div className="grid grid-cols-3 border-b border-slate-100">
              {stepNames.map((name, index) => <div key={name} className={`border-b-2 px-1 py-3 text-center text-[11px] font-bold sm:text-sm ${step === index + 1 ? 'border-blue-600 text-blue-700' : step > index + 1 ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-400'}`}>{name}</div>)}
            </div>

            {step === 1 && <div className="space-y-4 p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">{t('store_name')}</span><input readOnly value={businessProfile?.store_name || ''} className="w-full rounded-2xl border border-blue-300/50 bg-slate-50 px-4 py-3 text-base font-semibold text-slate-700" placeholder={t('auto_filled')} /></label>
                <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">{t('country_code')}</span><input readOnly dir="ltr" value={businessProfile?.country_code || ''} className="w-full rounded-2xl border border-blue-300/50 bg-slate-50 px-4 py-3 text-base font-semibold text-slate-700" placeholder={t('auto_filled')} /></label>
                <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">{t('phone_number')}</span><input readOnly dir="ltr" value={businessProfile?.phone || ''} className="w-full rounded-2xl border border-blue-300/50 bg-slate-50 px-4 py-3 text-base font-semibold text-slate-700" placeholder={t('auto_filled')} /></label>
                <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">{t('region')}</span><input readOnly value={businessProfile?.address || ''} className="w-full rounded-2xl border border-blue-300/50 bg-slate-50 px-4 py-3 text-base font-semibold text-slate-700" placeholder={t('auto_filled')} /></label>
                <label className="block space-y-1.5 sm:col-span-2"><span className="text-sm font-bold text-slate-700">{t('country')}</span><input readOnly value={businessProfile?.country || ''} className="w-full rounded-2xl border border-blue-300/50 bg-slate-50 px-4 py-3 text-base font-semibold text-slate-700" placeholder={t('auto_filled')} /></label>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2 text-sm text-slate-700">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                    <div><p className="font-bold">{t('map_location')}</p><p className="mt-1 text-xs text-slate-500">{t('offers_location_hint')}</p></div>
                  </div>
                  <Button type="button" variant="outline" disabled={locationLoading} onClick={() => void captureStoreLocation()} className="shrink-0 gap-2 rounded-lg bg-white">
                    {locationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                    {locationLoading ? t('loading_map_location') : t(storeLocation ? 'offers_location_update' : 'offers_location_detect')}
                  </Button>
                </div>
                {storeLocation && <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-emerald-700">{t('offers_location_captured')}: {storeLocation.storeLatitude.toFixed(5)}, {storeLocation.storeLongitude.toFixed(5)}</p>}
                {storeLocation && <div className="mt-3 h-48 overflow-hidden rounded-xl border border-blue-200">
                  <MapContainer center={[storeLocation.storeLatitude, storeLocation.storeLongitude]} zoom={13} scrollWheelZoom={false} className="h-full w-full" attributionControl>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                    <CircleMarker center={[storeLocation.storeLatitude, storeLocation.storeLongitude]} radius={8} pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.8 }} />
                    <MapUpdater center={[storeLocation.storeLatitude, storeLocation.storeLongitude]} />
                  </MapContainer>
                </div>}
                {profileLoading && <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{t('offers_profile_loading')}</p>}
                {profileError && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-700"><span>{t('offers_error_profile')}</span><Button type="button" variant="outline" onClick={() => setProfileReload((current) => current + 1)} className="h-8 rounded-lg bg-white">{t('offers_retry')}</Button></div>}
              </div>
              <Button type="button" disabled={profileLoading || profileError || !businessProfile} onClick={continueToDetails} className="w-full bg-blue-600 font-bold hover:bg-blue-700">{t('offers_next_details')}</Button>
            </div>}

            {step === 2 && <div className="space-y-4 p-4 sm:p-6">
              <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">{t('offers_name')} <b className="text-rose-500">*</b></span><input value={form.productName} onChange={(event) => updateForm('productName', event.target.value)} maxLength={120} placeholder={t('offers_name_placeholder')} className="w-full rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-base font-medium text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60" /></label>
              <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">{t('offers_description')} <b className="text-rose-500">*</b></span><textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} rows={3} maxLength={1500} placeholder={t('offers_description_placeholder')} className="w-full resize-y rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-base font-medium text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60" /></label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="business-offer-category" className="mb-1 flex items-center gap-1 text-base font-bold text-slate-700">{t('offers_category')}</label>
                  <Select value={form.category} onValueChange={(value) => updateForm('category', value)}>
                    <SelectTrigger id="business-offer-category" className="h-auto min-h-12 w-full min-w-0 max-w-full rounded-2xl border-blue-300/50 bg-white px-4 py-3 text-right text-base font-semibold text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60 focus:shadow-[0_6px_18px_rgba(37,99,235,0.18)]">
                      <SelectValue placeholder={t('offers_choose_category')} />
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
                <label className="space-y-1.5"><span className="text-sm font-bold text-slate-700">{t('offers_original_price')} ({currencySymbol}) <b className="text-rose-500">*</b></span><input type="number" min="0.01" step="0.01" value={form.originalPrice} onChange={(event) => updateForm('originalPrice', event.target.value)} className="w-full rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-base font-medium text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60" /></label>
                <label className="space-y-1.5"><span className="text-sm font-bold text-slate-700">{t('offers_price')} ({currencySymbol}) <b className="text-rose-500">*</b></span><input type="number" min="0.01" step="0.01" value={form.offerPrice} onChange={(event) => updateForm('offerPrice', event.target.value)} className="w-full rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-base font-medium text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60" /></label>
                <div className="space-y-1.5"><span className="block text-sm font-bold text-slate-700">{t('offers_points_required')}</span><div aria-live="polite" className="flex min-h-12 items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-base font-bold text-amber-900"><Coins className="h-5 w-5 text-amber-600" />{new Intl.NumberFormat('en-US').format(requiredPoints)} {t('offers_points_unit')}</div></div>
              </div>
              <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">{t('offers_expiry_date')} <b className="text-rose-500">*</b></span><input type="date" min={new Date().toISOString().slice(0, 10)} value={form.expiresAt} onChange={(event) => updateForm('expiresAt', event.target.value)} className="w-full rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-base font-medium text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60" /></label>
              <label className="block space-y-1.5"><span className="text-sm font-bold text-slate-700">{t('offers_notes')}</span><textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={2} maxLength={500} className="w-full rounded-2xl border border-blue-300/50 bg-white px-4 py-3 text-base font-medium text-black shadow-[0_2px_10px_rgba(37,99,235,0.08)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-200/60" /></label>
              {discount > 0 && <div className="flex justify-between rounded-xl bg-rose-50 px-3 py-2 text-sm"><span className="text-rose-800">{t('offers_discount_percent')}</span><strong className="text-rose-800">{discount}%</strong></div>}
              <Button type="button" onClick={continueToImages} className="w-full bg-blue-600 font-bold hover:bg-blue-700">{t('offers_next_add_images')}</Button>
            </div>}

            {step === 3 && <div className="space-y-4 p-4 sm:p-6">
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-5 text-center hover:border-blue-400"><ImagePlus className="mb-2 h-8 w-8 text-blue-600" /><span className="font-bold text-slate-800">{t('offers_add_images')}</span><span className="mt-1 text-xs text-slate-500">{t('offers_image_limit')}</span><input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { addImages(event.target.files); event.currentTarget.value = ''; }} /></label>
              {images.length > 0 && <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">{images.map((file, index) => <div key={`${file.name}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-slate-200"><img src={previews[index]} alt={file.name} className="h-full w-full object-cover" />{index === 0 && <span className="absolute bottom-1 left-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{t('offers_main_image')}</span>}<button type="button" onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-rose-600" aria-label={t('offers_delete_image')}><X className="h-4 w-4" /></button></div>)}</div>}
              <div className="flex gap-3"><Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1">{t('offers_back')}</Button><Button type="button" onClick={continueToPreview} className="flex-1 bg-blue-600 font-bold hover:bg-blue-700">{t('offers_preview')}</Button></div>
            </div>}

            {step === 4 && <div className="space-y-4 p-4 sm:p-6">
              <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                <span>{t('offers_location_hint')}</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="relative">
                  <img src={previews[0]} alt={form.productName} className="h-52 w-full bg-slate-100 object-cover sm:h-64" />
                  <span className="absolute left-3 top-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-black text-white shadow-md">{t('offers_discount_badge', { percent: String(discount) })}</span>
                </div>
                <div className="space-y-4 p-4 sm:p-5">
                  <div>
                    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{t(ACCESSORY_CATEGORIES.find((category) => category.value === form.category)?.labelKey || form.category)}</span>
                    <h2 className="mt-2 text-xl font-black leading-snug text-slate-900 sm:text-2xl">{form.productName}</h2>
                  </div>
                  <p className="whitespace-pre-line border-t border-slate-100 pt-3 text-sm leading-6 text-slate-600">{form.description}</p>
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Clock3 className="h-4 w-4 text-blue-600" aria-hidden="true" />
                    <span>{t('offers_ends_on')}</span>
                    <span className="font-bold tabular-nums text-slate-800">
                      {new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${form.expiresAt}T00:00:00`))}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-4">
                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-500">{t('offers_price_label')}</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black tabular-nums text-orange-600">{new Intl.NumberFormat('en-US').format(Number(form.offerPrice))}</span>
                        <span className="text-sm font-bold text-slate-600">{currencySymbol}</span>
                        <span className="text-sm tabular-nums text-slate-400 line-through">{new Intl.NumberFormat('en-US').format(Number(form.originalPrice))} {currencySymbol}</span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-800">
                      <Coins className="h-4 w-4 text-amber-600" aria-hidden="true" />
                      {new Intl.NumberFormat('en-US').format(requiredPoints)} Coins
                    </span>
                  </div>
                </div>
              </div>
              {previews.length > 1 && <div className="grid grid-cols-4 gap-2">{previews.slice(1).map((preview, index) => <img key={preview} src={preview} alt={`${t('offers_main_image')} ${index + 2}`} className="aspect-square w-full rounded-lg object-cover" />)}</div>}
              <div className="flex gap-3"><Button type="button" variant="outline" onClick={() => setStep(3)} className="flex-1">{t('offers_edit_images')}</Button><Button type="button" disabled={submitting} onClick={() => void submitOffer()} className="flex-1 gap-2 bg-orange-500 font-bold text-white hover:bg-orange-600">{submitting ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Send className="h-4 w-4 text-white" />}{t('offers_submit_review')}</Button></div>
            </div>}
            </div>
          </section>
        )}

        {step === 5 && <section className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 sm:p-10"><span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-8 w-8" /></span><h1 className="text-2xl font-black text-slate-900">{t('offers_sent_success')}</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{t('offers_sent_description')}</p><div className="mx-auto mt-5 flex max-w-xs items-center justify-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"><Clock3 className="h-4 w-4" />{t('offers_status_label')}</div><div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center"><Button type="button" onClick={() => setStep(0)} variant="outline">{t('offers_back_to_list')}</Button><Button type="button" onClick={startOffer} className="gap-2 bg-blue-600"><Plus className="h-4 w-4" />{t('offers_add_another')}</Button></div></section>}

        {error && <div role="alert" className="mt-3 flex items-start justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label={t('offers_close')}><X className="h-4 w-4" /></button></div>}
      </main>
    </PageContainer>
  );
};

export default BusinessOffers;