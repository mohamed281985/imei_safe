import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useGeolocated } from 'react-geolocated';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { generateRandomFilename, sanitizeFilename } from '@/lib/storageUtils';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Browser } from '@capacitor/browser';
import axiosInstance from '@/services/axiosInterceptor';

// طلب توقيع من الخادم. يجب أن يتم التوقيع الحقيقي على الخادم.
const requestSignature = async (payload: { merchantOrderId: string; amount: number; timestamp: number; offerId?: string; offerData?: { type: string; duration_days: number | null } }) => {
  try {
    const resp = await axiosInstance.post('https://imei-safe.me/paymob/sign', payload);
    return resp.data.signature as string;
  } catch (err: any) {
    throw new Error(err.response?.data?.error || 'Failed to obtain signature');
  }
};

// UI Components
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import BackButton from '../components/BackButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

// Icons
import { Upload, Store, Link as LinkIcon, CalendarDays, Send, MapPin, X, Phone } from 'lucide-react';
import PackageBadge from '@/components/PackageBadge';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import AdImagePreviewModal from '../components/AdImagePreviewModal';
import CountryCodeSelector from '../components/CountryCodeSelector';

const PublishAd: React.FC = () => {
  useScrollToTop();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const [searchParams] = useSearchParams();
  const [adId, setAdId] = useState<string | null>(null);
  const [adImage, setAdImage] = useState<File | null>(null);
  const [adImagePreview, setAdImagePreview] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+20'); // Default to Egypt
  const [whatsapp, setWhatsapp] = useState(false);
  const [duration, setDuration] = useState('7'); // Default duration
  const [adPrice, setAdPrice] = useState<number | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [availableDurations, setAvailableDurations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  // استخدام useRef لتتبع وضع التحديث
  const isUpdateModeRef = useRef(false);
  const [isUpdateMode, setIsUpdateMode] = useState(false);

  // Track plan info fetched from DB (authoritative)
  const [basePlanFromDB, setBasePlanFromDB] = useState<string | null>(null);
  // Keep full normalized role from DB (e.g. 'gold_business') to match `plans.type`
  const [normalizedRoleFromDB, setNormalizedRoleFromDB] = useState<string | null>(null);
  const [isPlanLoading, setIsPlanLoading] = useState(false);

  // Derive user's base plan from authoritative DB role (fallback to auth `user.role`)
  const basePlan = useMemo(() => {
    const source = basePlanFromDB ?? String(user?.role || 'free').toLowerCase().trim();
    const raw = String(source).toLowerCase().trim();
    const normalized = raw.replace(/[\s\-]+/g, '_');
    const base = normalized.split('_')[0];
    return base; // 'gold' | 'silver' | 'free' | others
  }, [basePlanFromDB, user?.role]);
  const isPackageUser = basePlan === 'gold' || basePlan === 'silver';

  // Fetch authoritative role from `users` table to match PackageBadge behavior
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const fetchRole = async () => {
      setIsPlanLoading(true);
      try {
        const { data, error } = await supabase.from('users').select('role').eq('id', user.id).single();
        if (cancelled) return;
        if (error) {
          console.error('PublishAd: error fetching user role from DB', error);
          return;
        }
        const raw = String(data?.role ?? user.role ?? 'free').toLowerCase().trim();
        const normalized = raw.replace(/[\s\-]+/g, '_');
        const base = normalized.split('_')[0];
        setNormalizedRoleFromDB(normalized);
        setBasePlanFromDB(base);
      } catch (err) {
        if (!cancelled) console.error('PublishAd: unexpected error fetching role', err);
      } finally {
        if (!cancelled) setIsPlanLoading(false);
      }
    };
    fetchRole();
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  // Number of publish ads included in the user's plan (from `plans.Publish_Ad` column)
  const [packagePublishAdsCount, setPackagePublishAdsCount] = useState<number | null>(null);
  // الأيام المتبقية للباقة
  const [packageDaysRemaining, setPackageDaysRemaining] = useState<number | null>(null);
  // عدد الإعلانات المنشورة فعلياً (pending + approved وغير منتهية الصلاحية) من جدول ads_payment
  const [actualPublishedAdsCount, setActualPublishedAdsCount] = useState<number | null>(null);
  // عدد الإعلانات المتبقية (من الخادم)
  const [packageAdsRemaining, setPackageAdsRemaining] = useState<number | null>(null);
  // (packageStartDate removed) — server provides authoritative counts

  // Derived remaining ads to display (يتم الحصول عليه من الخادم الآن)
  const packagePublishAdsRemaining = useMemo(() => {
    // إذا كان لدينا القيمة من الخادم، استخدمها
    if (packageAdsRemaining != null) {
      return packageAdsRemaining;
    }
    // Fallback للحساب المحلي إذا لم يكن متاحاً
    if (packagePublishAdsCount != null && actualPublishedAdsCount != null) {
      const diff = Number(packagePublishAdsCount) - Number(actualPublishedAdsCount);
      return Number.isFinite(diff) ? Math.max(0, diff) : null;
    }
    if (packagePublishAdsCount != null) return packagePublishAdsCount;
    return null; // If actual count is not available, show max allowed
  }, [packageAdsRemaining, packagePublishAdsCount, actualPublishedAdsCount]);

  // Fetch package remaining ads from server
  const fetchPackageRemaining = async () => {
    if (!user?.id) return;

    try {
      let token: string | undefined;
      try {
        const sessionRes: any = await supabase.auth.getSession();
        token = sessionRes?.data?.session?.access_token;
      } catch (e) {
        try {
          // @ts-ignore
          const sess = await supabase.auth.session();
          // @ts-ignore
          token = sess?.access_token;
        } catch (e2) {
          token = undefined;
        }
      }

      const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '';
      const api = (path: string) => (API_BASE ? `${API_BASE}${path}` : path);

      const resp = await fetch(api('/api/ads/package-remaining'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!resp.ok) {
        console.error('Failed to fetch package remaining:', resp.status);
        return;
      }

      const json = await resp.json();
      if (json.ok) {
        setPackagePublishAdsCount(json.publishAdsCount);
        setActualPublishedAdsCount(json.actualPublishedAdsCount);
        setPackageAdsRemaining(json.remainingAds);
        setPackageDaysRemaining(json.daysRemaining);
        console.log(`[PublishAd] Package stats: remaining=${json.remainingAds}, published=${json.actualPublishedAdsCount}, max=${json.publishAdsCount}`);
      }
    } catch (err) {
      console.error('Error fetching package remaining:', err);
    }
  };

  useEffect(() => {
    if (!user?.id || !isPackageUser) return;
    fetchPackageRemaining();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPackageRemaining, 30000);
    return () => clearInterval(interval);
  }, [user?.id, isPackageUser]);

  // All ads_payment counting is done server-side. Frontend must not query ads_payment directly.
  // We rely on `fetchPackageRemaining()` (above) to populate package counts and days remaining.

  // Fetch package expiry date and calculate remaining days
  useEffect(() => {
    if (!user?.id || !isPackageUser) return;
    let cancelled = false;
    const fetchPackageExpiry = async () => {
      try {
        // جلب expires_at من جدول users
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('expires_at')
          .eq('id', user.id)
          .maybeSingle();

        if (userError) {
          console.error('PublishAd: error fetching user expires_at:', userError);
          return;
        }

        if (!userData?.expires_at) {
          console.log('PublishAd: no expires_at found for user');
          return;
        }

        // حساب الأيام المتبقية من expires_at فقط
        const expiryDate = new Date(userData.expires_at);
        const today = new Date();
        const diffTime = expiryDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (!cancelled) {
          setPackageDaysRemaining(Math.max(0, diffDays));
        }
      } catch (err) {
        console.error('PublishAd: error calculating package days remaining:', err);
        if (!cancelled) setPackageDaysRemaining(null);
      }
    };
    fetchPackageExpiry();
    return () => { cancelled = true; };
  }, [user?.id, isPackageUser]);

  // دالة لجلب سعر الإعلان بناءً على المدة
  const fetchAdPrices = async () => {
    try {
      const { data, error } = await supabase
        .from('ads_price')
        .select('duration_days, amount') // جلب الأعمدة المطلوبة فقط
        .eq('type', 'publish'); // جلب أسعار إعلانات النشر العامة

      if (error) {
        console.error('Error fetching publish ad prices:', error);
        return null;
      }

      if (data) {
        const pricesMap = data.reduce((acc, price) => {
          acc[price.duration_days] = price.amount;
          return acc;
        }, {} as Record<string, number>);

        // استخراج المدد المتاحة وترتيبها
        const durations = data.map(item => item.duration_days.toString()).sort((a, b) => parseInt(a) - parseInt(b));
        setAvailableDurations(durations);

        setPrices(pricesMap);
        if (!isUpdateMode) {
          // التحقق من أن المدة الافتراضية (7) متوفرة، وإلا اختيار أول مدة متاحة
          const defaultDuration = durations.includes('7') ? '7' : durations[0] || '';
          setDuration(defaultDuration);
          setAdPrice(pricesMap[defaultDuration] || null);
        }
        return pricesMap;
      } else {
        setPrices({});
        setAvailableDurations([]);
        return null;
      }
    } catch (error) {
      console.error('Error in fetchAdPrices:', error);
      return null;
    }
  }

  // تحديث isUpdateModeRef عند تغيير adId
  useEffect(() => {
    const updateMode = !!adId;
    isUpdateModeRef.current = updateMode;
    setIsUpdateMode(updateMode);
  }, [adId]);

  // Effect لجلب سعر الإعلان عند تغيير المدة
  useEffect(() => {
    setAdPrice(prices[duration] || null);
  }, [duration, prices]);

  // متغير للعرض في واجهة المستخدم تم تعريفه أعلاه
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);


  // متغيرات الدفع داخل التطبيق
  const [showPayment, setShowPayment] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState('');

  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    width: 100,
    height: 56.25, // 9/16 of 100 for 16:9 ratio
    x: 0,
    y: 21.875 // Centered vertically: (100 - 56.25) / 2
  });
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);

  const { coords, isGeolocationAvailable, isGeolocationEnabled } = useGeolocated({
    positionOptions: {
      enableHighAccuracy: true,
    },
    userDecisionTimeout: 5000,
  });

  // API base (can be empty to use same-origin). Use Vite env when available.
  const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '';
  const api = (path: string) => (API_BASE ? `${API_BASE}${path}` : path);

  // Replace hardcoded token usage
  const API_TOKEN = (import.meta as any).env?.VITE_API_TOKEN;

  // Effect to check for an ad ID in the URL for editing
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) {
      setAdId(id);
      const fetchAdData = async () => {
        setIsLoading(true);

        try {
          // جلب الإعلان مباشرة من جدول publish_ad
          const { data: pubAd, error: pubErr } = await supabase
            .from('publish_ad')
            .select('*')
            .eq('id', id)
            .single();

          if (pubErr) {
            console.error('Error loading ad from publish_ad:', pubErr);
            toast({ title: t('error'), description: t('error_fetching_ad_details'), variant: 'destructive' });
            navigate('/myads');
            return;
          }

          if (!pubAd) {
            toast({ title: t('error'), description: t('ad_not_found'), variant: 'destructive' });
            navigate('/myads');
            return;
          }

          // Populate form with existing ad data
          setStoreName(pubAd.store_name || '');
          setWhatsapp(!!pubAd.whatsapp);
          // Extract country code and phone from stored phone
          const fullPhone = normalizePhoneNumber(pubAd.phone) || '';
          if (fullPhone) {
            const match = fullPhone.match(/^(\+\d{1,3})(.*)$/);
            if (match) {
              setCountryCode(match[1]);
              setPhoneNumber(match[2]);
            } else {
              setPhoneNumber(fullPhone);
            }
          }
          const durationDays = String(pubAd.duration_days || '7');
          setDuration(durationDays);
          setAdImagePreview(pubAd.image_url);

          const fetchedPrices = await fetchAdPrices();
          if (fetchedPrices && fetchedPrices[durationDays]) {
            setAdPrice(fetchedPrices[durationDays]);
          }
        } catch (err) {
          console.error('Error fetching ad from publish_ad:', err);
          toast({ title: t('error'), description: t('error_fetching_ad_details'), variant: 'destructive' });
          navigate('/myads');
        } finally {
          setIsLoading(false);
        }
      };
      fetchAdData();
    } else {
      // جلب الأسعار في وضع الإنشاء
      fetchAdPrices();
    }
  }, [adId, searchParams, navigate, t, toast]);


  // Effect to auto-fill store name and phone from business profile
  useEffect(() => {
    const loadBusinessData = async () => {
      // Only run if creating a new ad and user is logged in
      if (user && !adId) {
        try {
          // Try to get decrypted business info from server
          let token: string | undefined;
          try {
            const sessionRes: any = await supabase.auth.getSession();
            token = sessionRes?.data?.session?.access_token;
          } catch (e) {
            try {
              // @ts-ignore
              const sess = await supabase.auth.session();
              // @ts-ignore
              token = sess?.access_token;
            } catch (e2) {
              token = undefined;
            }
          }

          const resp = await fetch(api('/api/businesses/me'), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          if (!resp.ok) {
            throw new Error('failed');
          }
          const json = await resp.json();
          const business = json?.business;

          if (business) {
            setStoreName(prev => prev || business.store_name || '');
            const fullPhone = normalizePhoneNumber(business.phone) || '';
            if (fullPhone) {
              const match = fullPhone.match(/^(\+\d{1,3})(.*)$/);
              if (match) {
                setCountryCode(match[1]);
                setPhoneNumber(prev => prev || match[2] || '');
              } else {
                setPhoneNumber(prev => prev || fullPhone || '');
              }
            }
            if (business.store_name || business.phone) {
              toast({ title: t('success'), description: t('business_data_auto_filled') });
            }
          }
        } catch (error) {
          console.error('Error loading business data:', error);
        }
      }
    };
    loadBusinessData();
  }, [user, adId, toast]);

  // Effect لجلب سعر الإعلان عند تغيير المدة
  useEffect(() => {
    fetchAdPrices();
  }, []);

  useEffect(() => {
    setAdPrice(prices[duration] || null);
  }, [duration, prices]);

  // Bonus logic removed — package/subscription UI is used instead

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: t('error'), description: t('file_too_large'), variant: 'destructive' });
        return;
      }
      const reader = new FileReader();
      const img = new window.Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        if (img.width <= img.height) {
          toast({
            title: t('error_in_image_dimensions'),
            description: t('please_upload_landscape_image'),
            variant: 'destructive',
          });
          return;
        }
        setAdImage(file);
        reader.addEventListener('load', () => {
          setAdImagePreview(reader.result as string);
          setShowPreviewModal(true);
        });
        reader.readAsDataURL(file);
      };
    }
  };


  const getCroppedImg = async (
    image: HTMLImageElement,
    crop: Crop
  ): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('No 2d context');
    }

    // The crop dimensions are in display pixels, we need to scale them
    // to the natural image size to preserve quality.
    const sourceX = crop.x * scaleX;
    const sourceY = crop.y * scaleY;
    const sourceWidth = crop.width * scaleX;
    const sourceHeight = crop.height * scaleY;

    // To avoid overly large images, we can cap the output resolution.
    // 1920px is a good balance between quality and file size for web.
    const MAX_WIDTH_OR_HEIGHT = 1920;
    let outputWidth = sourceWidth;
    let outputHeight = sourceHeight;

    if (outputWidth > MAX_WIDTH_OR_HEIGHT || outputHeight > MAX_WIDTH_OR_HEIGHT) {
      const ratio = outputWidth / outputHeight;
      if (ratio > 1) { // Landscape
        outputWidth = MAX_WIDTH_OR_HEIGHT;
        outputHeight = MAX_WIDTH_OR_HEIGHT / ratio;
      } else { // Portrait or square
        outputHeight = MAX_WIDTH_OR_HEIGHT;
        outputWidth = MAX_WIDTH_OR_HEIGHT * ratio;
      }
    }

    canvas.width = Math.round(outputWidth);
    canvas.height = Math.round(outputHeight);

    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas is empty'));
            return;
          }
          resolve(blob);
        },
        'image/webp',
        0.9
      );
    });
  };

  const handleCropComplete = async () => {
    if (!imgRef.current || !completedCrop) return;

    try {
      const croppedBlob = await getCroppedImg(imgRef.current, completedCrop);
      setAdImage(new File([croppedBlob], 'cropped.webp', { type: 'image/webp' }));
      setAdImagePreview(URL.createObjectURL(croppedBlob));
      setIsEditing(false);
      toast({
        title: t('success'),
        description: t('image_cropped_successfully'),
        variant: 'default'
      });
    } catch (e) {
      console.error('Error cropping image:', e);
      toast({
        title: t('error'),
        description: t('error_cropping_image'),
        variant: 'destructive'
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const goToMyAdsAfterDelay = () => setTimeout(() => navigate('/myads'), 5000);
    if (!storeName || !phoneNumber) {
      toast({ title: t('error'), description: t('required_fields'), variant: 'destructive' });
      setIsLoading(false);
      goToMyAdsAfterDelay();
      return;
    }
    let activeUser = user;
    if (!activeUser) {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data?.session?.user;
        if (sessionUser) {
          activeUser = {
            id: sessionUser.id,
            email: sessionUser.email || '',
            username: sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.username || ''
          };
        }
      } catch (sessionErr) {
        console.error('Failed to read current session in PublishAd:', sessionErr);
      }
    }
    if (!activeUser) {
      toast({ title: t('error'), description: t('must_be_logged_in'), variant: 'destructive' });
      goToMyAdsAfterDelay();
      return;
    }

    setIsLoading(true);
    try {
      // 1. رفع الصورة إذا كانت جديدة
      let imageUrl = adImagePreview;
      if (adImage) {
        const safeOriginal = sanitizeFilename(adImage.name || 'upload');
        const randomName = generateRandomFilename(safeOriginal);
        const filePath = `ads/${activeUser.id}/${randomName}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('advertisements')
          .upload(filePath, adImage);
        if (uploadError || !uploadData) {
          throw uploadError;
        }
        const { data: { publicUrl } } = supabase.storage
          .from('advertisements')
          .getPublicUrl(filePath);
        imageUrl = publicUrl;
      }

      const durationDays = parseInt(duration, 10);
      if (!Number.isFinite(durationDays) || durationDays <= 0) {
        throw new Error(t('invalid_ad_duration'));
      }

      // Build ad payload for bonus route.
      const adPayload = {
        store_name: storeName,
        image_url: imageUrl,
        whatsapp: whatsapp,
        duration_days: durationDays,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        phone: phoneNumber || null,
        amount: adPrice ?? 0,
        upload_date: new Date().toISOString(),
        expires_at: (() => { const d = new Date(); d.setDate(d.getDate() + durationDays); return d.toISOString(); })(),
        type: 'publish',
        is_active: true
      };

      // Bonus-based publish removed; proceed with normal payment flow

      // Decide amount: package users (gold/silver) pay 0 here
      const amount = isPackageUser ? 0 : (prices[duration] || 0);
      const fullAdData = {
        user_id: activeUser.id,
        store_name: storeName,
        image_url: imageUrl,
        whatsapp: whatsapp,
        duration_days: duration ? parseInt(duration, 10) : null,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        phone: `${countryCode}${phoneNumber}`,
        country_code: countryCode,
        upload_date: new Date().toISOString(),
        expires_at: (() => { const d = new Date(); d.setDate(d.getDate() + parseInt(duration, 10)); return d.toISOString(); })(),
        is_paid: false,
        payment_status: 'pending',
        type: 'publish',
        amount: amount,
        is_active: false,
        status: 'pending'
      };
      const paymentData = {
        amount: amount,
        email: activeUser.email,
        name: storeName,
        phone: phoneNumber,
        merchantOrderId: `AD-${Date.now()}`,
        isSpecialAd: false,
        adData: fullAdData,
        redirect_url_success: `https://imei-safe.me/paymob/redirect-success`,
        redirect_url_failed: `https://imei-safe.me/paymob/redirect-failed`
      };
      // If user is on a package (gold/silver), call server endpoint to verify and create the ad/payment
      if (isPackageUser) {
        try {
          // Acquire a server-authorized token (if available) to let server validate subscription
          let token: string | undefined;
          try {
            const sessionRes: any = await supabase.auth.getSession();
            token = sessionRes?.data?.session?.access_token;
          } catch (e) {
            try {
              // @ts-ignore
              const sess = await supabase.auth.session();
              // @ts-ignore
              token = sess?.access_token;
            } catch (e2) {
              token = undefined;
            }
          }

          const packageType = normalizedRoleFromDB ?? `${basePlan}_business`;
          const serverPayload = {
            adData: fullAdData,
            packageType,
            merchantOrderId: paymentData.merchantOrderId
          };

          // Acquire CSRF token (server sets httpOnly cookie and returns token)
          let csrfToken: string | undefined;
          try {
            const csrfResp = await fetch(api('/api/csrf-token'), { credentials: 'include' });
            if (csrfResp.ok) {
              const csrfJson = await csrfResp.json().catch(() => ({}));
              csrfToken = csrfJson?.csrfToken;
            }
          } catch (e) {
            // ignore and continue; server may still accept if cookie already present
          }

          const resp = await fetch(api('/api/ads/package-publish'), {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
            },
            body: JSON.stringify(serverPayload)
          });

          if (!resp.ok) {
            const errJson = await resp.json().catch(() => ({}));
            throw new Error(errJson.error || t('ad_publish_package_failed'));
          }

          toast({ 
            title: t('success'), 
            description: 'تم إرسال إعلانك بنجاح! سيتم مراجعته ونشره في أقرب وقت.' 
          });
          // Refresh package remaining ads from server
          await fetchPackageRemaining();
          goToMyAdsAfterDelay();
          return; // done — server handled DB insertion and no payment gateway is required
        } catch (err: any) {
          console.error('Package publish error:', err);
          toast({ title: t('error'), description: err.message || t('ad_publish_package_failed'), variant: 'destructive' });
          goToMyAdsAfterDelay();
          return;
        }
      }

      // Regular (non-package) payment flow follows
      // أرفق طابع زمني واطلب توقيعًا من الخادم قبل إرسال بيانات الدفع
      const timestamp = Date.now();
      let signature = '';
      try {
        signature = await requestSignature({
          merchantOrderId: paymentData.merchantOrderId,
          amount: paymentData.amount,
          timestamp,
          offerId: `publish-${fullAdData.duration_days ?? 'default'}`,
          offerData: { type: fullAdData.type, duration_days: fullAdData.duration_days }
        });
      } catch (err) {
        throw new Error(t('failed_to_get_signature'));
      }

      const paymentPayload = { ...paymentData, timestamp, signature };

      const response = await axiosInstance.post('https://imei-safe.me/paymob/create-payment', paymentPayload);
      if (response.status !== 200) {
        const errorData = response.data;
        throw new Error(errorData.error || t('failed_to_create_payment'));
      }
      const data = response.data;
      if (data.iframe_url) {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
          await window.Capacitor.Plugins.Browser.open({ url: data.iframe_url, toolbarColor: '#000000' });
        } else {
          window.open(data.iframe_url, '_blank', 'noopener,noreferrer');
        }
        toast({ 
          title: t('redirecting_to_payment'), 
          description: 'بعد إتمام الدفع، سيتم مراجعة إعلانك ونشره في أقرب وقت.' 
        });
        goToMyAdsAfterDelay();
      } else if (data.payment_url) {
        window.open(data.payment_url, '_blank', 'noopener,noreferrer');
        toast({ 
          title: t('redirecting_to_payment'), 
          description: 'بعد إتمام الدفع، سيتم مراجعة إعلانك ونشره في أقرب وقت.' 
        });
        goToMyAdsAfterDelay();
      } else {
        toast({ title: t('error'), description: t('payment_link_error'), variant: 'destructive' });
        goToMyAdsAfterDelay();
      }
    } catch (error: any) {
      toast({ title: t('error'), description: error.message || t('operation_error'), variant: 'destructive' });
      goToMyAdsAfterDelay();
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeLocation = () => {
    if (coords && coords.latitude && coords.longitude) {
      const url = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
      if (window.Capacitor && (window as any).Capacitor.Plugins?.Browser) {
        // @ts-ignore
        window.Capacitor.Plugins.Browser.open({ url, toolbarColor: '#0A84FF' });
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } else {
      toast({ title: t('info'), description: t('please_enable_location'), variant: 'default' });
    }
  };

  const closePaymentModal = () => {
    setShowPayment(false);
    setPaymentUrl('');
  };

  const normalizePhoneNumber = (phone: string): string => {
    if (!phone) return '';
    try {
      const parsed = JSON.parse(phone);
      return typeof parsed === 'string' ? parsed : phone;
    } catch {
      return phone;
    }
  };

  return (
    <PageContainer>
      <div dir="rtl" className="min-h-screen flex justify-center items-start py-6 px-4">
        <div className="w-full max-w-md">

          <div className="flex items-center justify-between mb-6 gap-4 mt-2">
            <div className="p-2 rounded-full bg-orange-400 text-white shadow-md">
              <BackButton />
            </div>
            <h1 className="text-2xl font-extrabold text-center flex-1 text-gray-900">{t('publish_ad')}</h1>
            <div className="flex flex-col items-center">
              <PackageBadge user={user} />
            </div>
          </div>



          {/* Premium Stats Card (GOLD VIP) - Improved Design */}
          <div className="mt-2">
            <div className="rounded-xl bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-md border border-amber-200/50 shadow-lg overflow-hidden">
              <div dir="rtl" className="p-3">
                {/* Header with Package Info */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                    <span className="text-xs font-medium text-amber-700">{t('package_status')}</span>
                  </div>
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-gradient-to-r from-amber-50 to-white border border-amber-200 text-amber-700 text-xs font-bold shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-crown mr-1">
                      <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path>
                    </svg>
                    {t('package_total')}:&nbsp;{packagePublishAdsCount != null ? `${packagePublishAdsCount} ${t('ads')}` : t('not_specified')}
                  </div>
                </div>

                {/* Main Stats - Compact Layout */}
                <div className="flex items-center justify-between gap-3 bg-white/50 rounded-lg p-2">
                  {/* Remaining Ads */}
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="text-2xl font-extrabold text-amber-600">{packagePublishAdsRemaining != null ? packagePublishAdsRemaining : '—'}</div>
                    <div className="text-[10px] text-gray-600 mt-0.5 font-medium">{t('package_remaining_ads')}</div>
                  </div>

                  {/* Vertical Divider */}
                  <div className="w-px h-8 bg-gradient-to-b from-amber-200 to-transparent"></div>

                  {/* Duration */}
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="text-2xl font-extrabold text-gray-900">{duration ? duration : '—'}</div>
                    <div className="text-[10px] text-gray-600 mt-0.5 font-medium">{t('ad_duration_per_ad')}</div>
                  </div>

                  {/* Vertical Divider */}
                  <div className="w-px h-8 bg-gradient-to-b from-amber-200 to-transparent"></div>

                  {/* Package Expiry */}
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="text-xl font-bold text-gray-700">
                      {isPackageUser ? (packageDaysRemaining !== null ? packageDaysRemaining : '—') : '-'}
                    </div>
                    <div className="text-[10px] text-gray-600 mt-0.5 font-medium">{t('days_remaining')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>



          <div className="mx-auto">
            <form onSubmit={handleSubmit} className="space-y-6 pb-7">
              {/* Image Upload */}
              <div>
                <Label className="text-gray-800">{t('ad_image')}</Label>
                <div
                  className="mt-2 flex flex-col items-center justify-center px-4 pt-6 pb-6 border-2 border-dotted rounded-lg cursor-pointer bg-white/40 border-[#0A84FF]/30 shadow-sm"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ boxShadow: '0 6px 18px rgba(10,132,255,0.06)' }}
                >
                  <div className="space-y-2 text-center w-full">
                    {adImagePreview ? (
                      <img src={adImagePreview} alt={t('ad_preview')} className="mx-auto h-44 w-auto rounded-lg shadow-inner" />
                    ) : (
                      <div className="mx-auto w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-sm">
                        <Upload className="h-8 w-8 text-[#0A84FF]" />
                      </div>
                    )}
                    <div className="flex justify-center text-sm text-gray-700">
                      <p className="pl-1">{t('click_to_upload')}</p>
                    </div>
                    <p className="text-xs text-gray-500">{t('image_format_hint')}</p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/png, image/jpeg"
                  onChange={handleImageChange}
                />

                {/* Image Preview */}
                {isEditing && adImagePreview ? (
                  <div className="mt-6">
                    <Label className="text-gray-700 mb-4 block">{t('crop_image')}</Label>
                    <ReactCrop
                      crop={crop}
                      onChange={(c) => setCrop(c)}
                      onComplete={(c) => setCompletedCrop(c)}
                      keepSelection={true}
                      circularCrop={false}
                      minHeight={100}
                      aspect={16 / 9}
                      className="max-w-full bg-gray-900 rounded-lg overflow-hidden"
                    >
                      <img
                        ref={imgRef}
                        src={adImagePreview}
                        alt={t('preview')}
                        className="max-w-full"
                      />
                    </ReactCrop>
                    <Button
                      onClick={handleCropComplete}
                      className="mt-4 bg-imei-cyan text-white hover:bg-imei-cyan/80"
                    >
                      {t('complete_crop')}
                    </Button>
                  </div>
                ) : adImagePreview ? (
                  <div className="mt-6">
                    <Label className="text-gray-700 mb-4 block">{t('ad_preview')}</Label>

                    {/* Featured Ad Preview */}
                    <div className="mb-6">
                      <h3 className="text-imei-cyan text-sm mb-2">{t('featured_ad_preview')}</h3>
                      <div className="relative rounded-xl overflow-hidden border-2 border-imei-cyan/20 hover:border-imei-cyan/40 transition-all aspect-video">
                        <img src={adImagePreview} alt={t('ad_image')} className="w-full aspect-video object-cover" />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                          <div className="flex items-center gap-2">
                            <Store className="h-4 w-4 text-imei-cyan" />
                            <span className="text-gray-900 text-sm font-medium">{storeName || t('your_store_name')}</span>
                          </div>
                          {whatsapp && (
                            <div className="flex items-center gap-2 mt-1">
                              <LinkIcon className="h-4 w-4 text-imei-cyan" />
                              <span className="text-gray-500 text-xs">{t('whatsapp_label')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Regular Ad Preview */}
                    <div>
                      <h3 className="text-imei-cyan text-sm mb-2">{t('regular_ad_preview')}</h3>
                      <div className="relative rounded-xl overflow-hidden border-2 border-imei-cyan/20 hover:border-imei-cyan/40 transition-all">
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                          <div className="flex items-center gap-2">
                            <Store className="h-4 w-4 text-imei-cyan" />
                            <span className="text-gray-900 text-sm font-medium">{storeName || t('your_store_name')}</span>
                          </div>
                          {whatsapp && (
                            <div className="flex items-center gap-2 mt-1">
                              <LinkIcon className="h-4 w-4 text-imei-cyan" />
                              <span className="text-gray-500 text-xs">WhatsApp</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Store Name */}
              <div>
                <Label htmlFor="storeName" className="text-gray-700">{t('store_name')}</Label>
                <div className="relative mt-2">
                  <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="storeName"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder={t('enter_store_name')}
                    required
                    readOnly
                    className="pl-10 bg-white text-black border-gray-300 focus:border-imei-cyan focus:ring-imei-cyan"
                  />
                </div>
              </div>

              {/* Phone Number with Country Code */}
              <div>
                <Label htmlFor="phoneNumber" className="text-gray-700">{t('phone_label')}</Label>
                <div className="flex gap-2 items-center mt-2">
                  <CountryCodeSelector
                    value={countryCode}
                    onChange={setCountryCode}
                    disabled={true}
                  />
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="phoneNumber"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder={t('phone_placeholder')}
                      required
                      readOnly
                      className="pl-10 bg-white text-black border-gray-300 focus:border-imei-cyan focus:ring-imei-cyan"
                    />
                  </div>
                </div>
              </div>

              {/* Ad Duration */}
              <div className={!isUpdateMode ? 'block' : 'hidden'}>
                <Label className="text-gray-700">{t('ad_duration')}</Label>
                <RadioGroup
                  defaultValue="7"
                  className="mt-2 grid grid-cols-3 gap-4"
                  value={duration}
                  onValueChange={setDuration}
                >
                  {availableDurations.map((days) => (
                    <Label key={days} htmlFor={`d${days}`} className="relative flex flex-col items-center justify-between rounded-xl border-2 border-gray-200 bg-white p-3 shadow-sm transition-all duration-200 hover:shadow-md [&:has([data-state=checked])]:border-orange-500 [&:has([data-state=checked])]:bg-orange-50 [&:has([data-state=checked])]:shadow-lg">
                      <RadioGroupItem value={days} id={`d${days}`} className="sr-only" />
                      <div className="w-full text-center mb-1">
                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#E6F7FF] text-[#0A84FF] mb-1">
                          <CalendarDays className="h-4 w-4" />
                        </div>
                        <h3 className="text-base font-bold text-gray-800">{days} {t('days')}</h3>
                      </div>

                      {!isPackageUser && (
                        <div className="w-full mt-auto pt-2 border-t border-gray-100">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-credit-card text-gray-400">
                              <rect width="20" height="14" x="2" y="5" rx="2"></rect>
                              <line x1="2" y1="10" x2="22" y2="10"></line>
                            </svg>
                            <span className="text-xs text-gray-600">{t('price')}</span>
                          </div>
                          <div className="text-lg font-bold text-gray-900 flex items-center justify-center gap-1 [&:has([data-state=checked])]:text-orange-500">
                            {prices[days] || 0} <span className="text-xs font-normal text-gray-500">{t('currency_short')}</span>
                          </div>
                        </div>
                      )}
                    </Label>
                  ))}
                </RadioGroup>

                {/* Current Price Display */}
                {!isPackageUser && adPrice !== null && (
                  <div className="mt-4 p-4 bg-gradient-to-r from-[#E6F7FF] to-white border border-white/30 rounded-xl text-center shadow-sm">
                    <p className="text-gray-800 font-medium">
                      الإجمالي: <span className="text-2xl font-extrabold text-gray-900">{adPrice} {t('currency_short')}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Location Info */}
              <div className="p-3 bg-gradient-to-r from-[#E6F7FF] to-white rounded-xl border border-white/30 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#E6F7FF]">
                    <MapPin className="h-5 w-5 text-[#0A84FF]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{coords ? t('location_set_success') : t('ad_location')}</div>
                    <div className="text-xs text-gray-500">{coords ? `${coords.latitude?.toFixed(3)}, ${coords.longitude?.toFixed(3)}` : t('location_not_set')}</div>
                  </div>
                </div>
                <div>
                  <button type="button" onClick={handleChangeLocation} className="bg-white border border-[#0A84FF] text-[#0A84FF] px-3 py-2 rounded-lg shadow-sm">{t('change_location')}</button>
                </div>
              </div>

              {/* WhatsApp Checkbox */}
              <div className="p-4 bg-white/40 border border-[#0A84FF]/20 rounded-xl shadow-sm">
                <div className="flex items-center space-x-3 space-x-reverse">
                  <input
                    id="whatsapp"
                    type="checkbox"
                    checked={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 text-[#0A84FF] focus:ring-[#0A84FF]"
                  />
                  <Label htmlFor="whatsapp" className="text-gray-800 font-bold cursor-pointer flex-1">
                    {t('allow_whatsapp_contact')}
                  </Label>
                </div>
                <p className="text-xs text-gray-500 mt-2 mr-8">
                  {t('allow_whatsapp_description')}
                </p>
              </div>

              {/* Submit Button */}
              <div className="mt-3">
                <Button type="submit" className="w-full text-white mb-6 py-4 text-lg rounded-xl shadow-xl" style={{ background: 'linear-gradient(90deg,#0A84FF 0%,#005BFF 100%)' }} disabled={isLoading}>
                  {isLoading ? (isUpdateMode ? t('updating') : t('publishing')) : (
                    <>
                      <Send className="mr-2 h-4 w-4 text-white" />
                      {isUpdateMode ? t('update_and_edit_ad') : t('publish_ad')}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default PublishAd;
