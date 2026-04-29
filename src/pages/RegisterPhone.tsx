// Helper to mask last 6 digits (show only last 2)
const maskIdLast6 = (id: string): string => {
  const digits = cleanDigits(id);
  if (!digits) return '';
  if (digits.length <= 2) return '*'.repeat(digits.length);
  return '*'.repeat(digits.length - 2) + digits.slice(-2);
};
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import AdsOfferSlider from '@/components/AdsOfferSlider';
import axiosInstance from '@/services/axiosInterceptor';
import imageCompression from 'browser-image-compression';
import { Button } from '@/components/ui/button';
import { Camera, Upload, CreditCard, User, FileText, CheckCircle, AlertTriangle, Smartphone, Phone, Mail, KeyRound, Hash } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Camera as CapacitorCamera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import PageContainer from '@/components/PageContainer';
import AppNavbar from '@/components/AppNavbar';
import BackButton from '@/components/BackButton';
import PageAdvertisement from '@/components/advertisements/PageAdvertisement';
import { supabase } from '@/lib/supabase';
import { useScrollToTop } from '../hooks/useScrollToTop';
import { useAuth } from '@/contexts/AuthContext';
import CountryCodeSelector from '../components/CountryCodeSelector';

type ReviewStatus = 'تمت المراجعة' | 'بيانات خاطئة';
type Status = 'approved' | 'rejected' | 'pending';

interface PhoneData {
  owner_name: string;
  phone_number: string;
  imei: string;
  phone_type: string;
  password: string;
  id_last6: string;
  phone_image_url: string | null;
  receipt_image_url: string | null;
  registration_date: string;
  review_status: ReviewStatus;
  review_date: string | null;
  status: Status;
  email: string | null;
  user_id: string | null;
}

interface FormData {
  ownerName: string;
  phoneNumber: string;
  imei: string;
  phoneType: string;
  password: string;
  confirmPassword: string;
  id_last6: string;
  phoneImage: File | null;
  receiptImage: File | null;
  review_status?: ReviewStatus;
  review_date?: string | null;
  status?: Status;
  registerType: 'mine' | 'other';
  email: string;
}

type ImageType = keyof Pick<FormData, 'phoneImage' | 'receiptImage'>;

const IMEI_LENGTH = 15;

// Helpers: decode HTML entities and strip surrounding quotes/punctuation
const decodeHtmlEntities = (s: string) => {
  if (!s) return '';
  return s.replace(/&quot;/gi, '"')
          .replace(/&apos;/gi, "'")
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>');
};

const stripSurroundingQuotes = (s: string) => {
  if (!s) return '';
  return s.replace(/^[\u0022\u201C\u201D\u00AB\u00BB'`\s]+|[\u0022\u201C\u201D\u00AB\u00BB'`\s]+$/g, '').trim();
};

const cleanDisplay = (s: string) => stripSurroundingQuotes(decodeHtmlEntities(String(s || ''))).replace(/\u00A0/g, ' ').trim();

function cleanText(s: unknown): string {
  return cleanDisplay(String(s ?? ''));
}

function cleanPhoneNumber(phone: string): string {
  return cleanDisplay(String(phone || '')).replace(/\D/g, '');
}

function cleanDigits(s: unknown): string {
  return cleanText(s).replace(/\D/g, '');
}

function cleanEmailValue(s: unknown): string {
  return cleanText(s).replace(/\s+/g, '');
}

// دوال مساعدة لتنسيق عرض البيانات
const maskName = (name: string): string => {
  if (!name) return '';
  const cleanedName = cleanDisplay(name);
  const names = cleanedName.split(/\s+/);
  return names.map(part => {
    if (!part) return part;
    const core = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!core) return part;
    const graphemes = Array.from(core);
    const firstIdx = graphemes.findIndex(g => /\p{L}|\p{N}/u.test(g));
    if (firstIdx === -1) return core;
    const lettersCount = graphemes.reduce((n, g) => n + (/\p{L}|\p{N}/u.test(g) ? 1 : 0), 0);
    if (lettersCount <= 1) return core;
    let shown = '';
    for (let i = 0; i < graphemes.length; i++) {
      const g = graphemes[i];
      if (i === firstIdx) {
        shown += g;
      } else if (/\p{L}|\p{N}/u.test(g)) {
        shown += '*';
      } else {
        shown += g;
      }
    }
    return shown.replace(/[\u0022\u201C\u201D\u00AB\u00BB'`]/g, '');
  }).join(' ');
};

const maskPhoneNumber = (phone: string): string => {
  const digits = cleanPhoneNumber(phone);
  if (!digits) return '';
  if (digits.length <= 2) return '*'.repeat(digits.length);
  return '*'.repeat(digits.length - 2) + digits.slice(-2);
};

// Helper to mask email for privacy
const maskEmail = (email: string): string => {
  const cleaned = cleanEmailValue(email);
  if (!cleaned) return '';
  const [name, domain] = cleaned.split('@');
  if (!domain) return email;
  const maskedName = name.length > 2 ? name[0] + '*'.repeat(name.length - 2) + name.slice(-1) : name;
  return maskedName + '@' + domain;
};

// دالة مساعدة لتشفير كلمة المرور (SHA-256)
async function sha256(message: string) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// دالة مساعدة للتحقق من التوقيع السحري للملف (Magic Bytes)
const validateImageFile = (file: File): Promise<boolean> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = (e) => {
      if (e.target?.readyState === FileReader.DONE) {
        const arr = (new Uint8Array(e.target.result as ArrayBuffer)).subarray(0, 4);
        let header = "";
        for(let i = 0; i < arr.length; i++) {
           header += arr[i].toString(16);
        }
        
        // JPEG: ffd8...
        // PNG: 89504e47
        // GIF: 47494638
        // WebP: 52494646 (RIFF)
        
        let isValid = false;
        if (header.startsWith('ffd8')) {
            isValid = true; // JPEG
        } else if (header === '89504e47') {
            isValid = true; // PNG
        } else if (header === '47494638') {
            isValid = true; // GIF
        } else if (header === '52494646') {
            isValid = true; // WebP
        }
        
        resolve(isValid);
      } else {
        resolve(false);
      }
    };
    reader.onerror = () => resolve(false);
    reader.readAsArrayBuffer(file.slice(0, 4));
  });
};

// ملاحظة أمنية هامة جداً: 
// لا تضع أبداً مفاتيح API سرية في ملفات .env التي تبدأ بـ VITE_
// لأنها تظهر في الكود المترجم (Build) ويمكن لأي شخص قراءتها من المتصفح
// يجب استخدام Proxy Server أو Backend API Gateway للتعامل مع المفاتيح السرية
// المفاتيح السرية يجب أن تكون فقط في الخلفية (Backend)

// ملاحظة أمنية حرجة: لا تقم أبداً بتشفير البيانات الحساسة في الواجهة الأمامية
// المتصفح بيئة غير موثوقة (Untrusted Environment)
// المنهجية الصحيحة (Zero Trust):
// 1. أرسل البيانات كنص عادي (Plain Text) عبر اتصال HTTPS آمن
// 2. قم بالتشفير (Encryption) في الخلفية (Backend) فقط
// 3. قم بتخزين المفاتيح السرية (Secret Keys) في مدير أسرار متخصص (Secrets Manager)
//    مثل AWS Secrets Manager، HashiCorp Vault، أو متغيرات البيئة في الخادم

// دالة مساعدة لتنظيف رقم IMEI
function cleanImei(imei: string): string {
  // إزالة أي مسافات أو أحرف غير رقمية
  return imei.trim().replace(/\D/g, '');
}

// دالة مساعدة لتنظيف آخر 6 أرقام من البطاقة
function cleanIdLast6(idLast6: string): string {
  // إزالة أي مسافات أو أحرف غير رقمية
  return idLast6.trim().replace(/\D/g, '');
}

const RegisterPhone: React.FC = () => {
  // حالة الحد المسموح
  const [hasReachedRegisterLimit, setHasReachedRegisterLimit] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  useScrollToTop();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const fromPurchase = location.state?.fromPurchase;
  const passedImei = location.state?.imei || '';
  const [countryCode, setCountryCode] = useState('+20');
  const [currentStep, setCurrentStep] = useState(1);

  const stepItems = [
    { title: t('step_device_info_title'), description: t('step_device_info_desc') },
    { title: t('step_personal_info_title'), description: t('step_personal_info_desc') },
    { title: t('step_password_info_title'), description: t('step_password_info_desc') },
    { title: t('step_attachments_title'), description: t('step_attachments_desc') },
  ];

  const handlePrevStep = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  }, []);

  // دالة التحقق من حد التسجيل بنفس منطق SearchIMEI
  const checkRegisterLimit = useCallback(async (userId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await axiosInstance.post('/api/check-limit', 
        { type: 'register_phone', consumeBonusOnLimit: false },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const result = response.data;

      if (!result.allowed) {
        if (result.bonusAvailable) {
          toast({
            title: t('alert'),
            description: t('register_limit_bonus_available'),
            variant: 'default'
          });
          setHasReachedRegisterLimit(false);
          return true;
        }

        toast({
          title: t('alert'),
          description: t('register_limit_exceeded'),
          variant: 'destructive'
        });
        setHasReachedRegisterLimit(true);
        return false;
      }

      if (result.isLastUsage) {
        toast({
          title: t('alert'),
          description: t('last_register_allowed'),
          variant: 'default'
        });
      }

      setHasReachedRegisterLimit(false);
      return true;
    } catch (error) {
      console.error('Error in checkRegisterLimit:', error);
      toast({
        title: t('error'),
        description: t('register_limit_check_failed'),
        variant: 'destructive'
      });
      return false;
    }
  }, [toast]);

  const [formData, setFormData] = useState<FormData>({
    ownerName: '',
    phoneNumber: '',
    imei: passedImei,
    phoneType: '',
    password: '',
    confirmPassword: '',
    id_last6: '',
    phoneImage: null,
    receiptImage: null,
    review_status: 'pending' as ReviewStatus,
    review_date: null,
    status: 'active' as Status,
    registerType: 'mine',
    email: user?.email || ''
  });

  const [previews, setPreviews] = useState<Record<ImageType, string>>({
    phoneImage: '',
    receiptImage: '',
  });

  // حالة لعرض الصورة الكاملة
  const [showFullImage, setShowFullImage] = useState(false);
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imeiError, setImeiError] = useState('');
  const [isImeiValid, setIsImeiValid] = useState(false);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    toast({
      title: t(type),
      description: t(message),
      variant: type === 'error' ? 'destructive' : 'default',
      className: 'z-[10001]'
    });
  }, [t, toast]);

  // Resolve a stored storage path to a usable URL (public or signed)
  const resolveImageUrl = async (path: string) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;

  try {
    const { data } = await axiosInstance.get('/api/signed-url', {
      params: { bucket: 'registerphone', path, expiresIn: 60 }
    });

    return data?.signedUrl || '';
  } catch (e) {
    console.error(e);
    return '';
  }
};
  // Safe getter for multiple possible property names (avoids TS errors)
  const getFirstProp = (obj: any, keys: string[]) => {
    if (!obj) return '';
    for (const k of keys) {
      const v = (obj as any)[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
  };

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user || fromPurchase) return;
      setIsLoading(true);
      try {
        if (formData.registerType === 'mine') {
          // استدعاء API الجديد للحصول على البيانات المفكوكة من الخادم
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;

          // تحقق من وجود token قبل الاستدعاء
          if (!token) {
            console.warn('No authentication token available');
            return;
          }

          const response = await axiosInstance.get('/api/decrypted-user', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          const result = response.data;

          // result: { user: {...} | null, business: {...} | null }
          const userData = result?.user || null;
          const businessData = result?.business || null;

          if (user.role === 'business' && businessData) {
            setFormData(prev => ({
              ...prev,
              ownerName: cleanText(businessData.owner_name || prev.ownerName || ''),
              phoneNumber: cleanPhoneNumber(businessData.phone || prev.phoneNumber || ''),
              email: cleanEmailValue(user?.email || prev.email || ''),
              id_last6: cleanDigits(businessData.id_last6 || prev.id_last6 || '')
            }));
            toast({ title: t('store_data_filled'), description: t('store_data_filled_description') });
          } else if (userData) {
            setFormData(prev => ({
              ...prev,
              ownerName: cleanText(userData.full_name || prev.ownerName || ''),
              phoneNumber: cleanPhoneNumber(userData.phone || prev.phoneNumber || ''),
              email: cleanEmailValue(user?.email || userData.email || prev.email || ''),
              id_last6: cleanDigits(userData.id_last6 || prev.id_last6 || '')
            }));
            toast({ title: t('user_data_filled'), description: t('user_data_filled_description') });
          }
        } else {
          // If registerType is 'other', clear the fields for manual entry
          setFormData(prev => ({
            ...prev,
            ownerName: '',
            phoneNumber: '',
            email: '',
            id_last6: ''
          }));
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        // لا نعرض رسالة خطأ إذا لم تكن هناك بيانات للملء
        // toast({ title: 'خطأ', description: 'فشل تحميل بيانات المستخدم.', variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, fromPurchase, t, toast, formData.registerType]);
  // ...existing code...
  // Restore checkImeiExists definition here if missing
  const checkImeiExists = useCallback(async (imei: string): Promise<{ exists: boolean; phoneDetails: Partial<PhoneData> | null; isOtherUser?: boolean; hasActiveReport?: boolean; isStolen?: boolean; isOwnReport?: boolean }> => {
    try {
      // ملاحظة: تم تشفير رقم IMEI بالفعل قبل استدعاء هذه الدالة باستخدام AES
      // ملاحظة أمنية: استخدام JWT Token للمصادقة بدلاً من مفتاح API
      // استخدام axios للتحقق من IMEI (مع CSRF protection)

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await axiosInstance.post('/api/check-imei',
        { imei: imei, userId: user?.id },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return response.data;
    } catch (err) {
      console.error('Error in checkImeiExists:', err);
      if (err instanceof Error && err.message === t('error_checking_imei')) {
        throw err;
      }
      throw new Error(t('error_checking_imei'));
    }
  }, [t, user]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'id_last6') {
      const numericValue = value.replace(/\D/g, '');
      setFormData(prev => ({ ...prev, [name]: numericValue }));
    } else if (name === 'phoneNumber') {
      let numericValue = value.replace(/\D/g, '');
      if (numericValue.startsWith('0')) {
        numericValue = numericValue.replace(/^0+/, '');
      }
      setFormData(prev => ({ ...prev, [name]: numericValue }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  }, [countryCode]);

  const handleImeiChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length > IMEI_LENGTH) return;

    setImeiError('');
    setFormData(prev => ({ ...prev, imei: value }));
    setIsImeiValid(false);

    if (value.length === IMEI_LENGTH) {
      setIsLoading(true);
      try {
        // ملاحظة أمنية: إرسال البيانات كنص عادي عبر HTTPS آمن
        // التشفير سيتم في الخلفية (Backend)
        const cleanImeiValue = cleanImei(value);
        const { exists, phoneDetails, isOtherUser, hasActiveReport, isStolen, isOwnReport } = await checkImeiExists(cleanImeiValue);
        console.log('Check IMEI result:', { exists, isOtherUser, hasActiveReport, isStolen });

        if (exists) {
          // حالة: البلاغ موجود ولصاحبه هو المستخدم الحالي
          if (isOwnReport) {
            setIsImeiValid(false);
            setImeiError('imei_registered_to_you');
            toast({
              title: t('error'),
              description: t('imei_registered_to_you_error'),
              variant: 'destructive'
            });
          } else if (isStolen) {
            setIsImeiValid(false);
            // الهاتف مسجل ببلاغ نشط (مسروق/مفقود) — إظهار الصندوق الأزرق بدل التنبيه
            setImeiError('imei_stolen');
            setFormData(prev => ({
              ...prev,
              ownerName: user?.role === 'business' ? prev.ownerName : '',
              phoneNumber: user?.role === 'business' ? prev.phoneNumber : '',
              phoneType: '',
              phoneImage: null,
            }));
            setPreviews(prev => ({ ...prev, phoneImage: '' }));
          } else if (isOtherUser) {
            if (hasActiveReport) {
              setIsImeiValid(false);
              // الحالة الجديدة: مسجل لمستخدم آخر وبه بلاغ
              setImeiError('imei_already_exists');
              toast({
                title: t('error'),
                description: t('imei_registered_to_another_account_with_report'),
                variant: 'destructive',
                className: 'z-[10001] bg-red-600 text-white',
                duration: 5000
              });
            } else {
              // الحالة القديمة: مسجل لمستخدم آخر فقط
              setIsImeiValid(false);
              setImeiError('imei_already_exists');
              toast({
                title: t('error'),
                description: t('imei_registered_to_another_account'),
                variant: 'destructive',
                className: 'z-[10001] bg-red-600 text-white',
                duration: 5000
              });
            }
            setFormData(prev => ({
              ...prev,
              ownerName: user?.role === 'business' ? prev.ownerName : '',
              phoneNumber: user?.role === 'business' ? prev.phoneNumber : '',
              phoneType: '',
              phoneImage: null,
            }));
            setPreviews(prev => ({ ...prev, phoneImage: '' }));
          } else if (phoneDetails) {
            // إذا كانت بيانات الهاتف تشير إلى أنه مسجل بالفعل لحساب المستخدم الحالي
            if (phoneDetails.user_id && user && phoneDetails.user_id === user.id) {
              setImeiError('imei_registered_to_you');
              setIsImeiValid(false);
              toast({
                title: t('error'),
                description: t('imei_registered_to_you_error'),
                variant: 'destructive'
              });
              // لا نفرّغ الحقول - نتركها كما هي أو يمكن تهيئتها من بيانات المستخدم
            } else {
              setFormData(prev => ({
                ...prev,
                ownerName: user?.role === 'business' ? prev.ownerName : cleanText(phoneDetails.owner_name || ''),
                phoneNumber: user?.role === 'business' ? prev.phoneNumber : cleanPhoneNumber(phoneDetails.phone_number || ''),
                phoneType: cleanText(phoneDetails.phone_type || ''),
                phoneImage: null,
              }));
              {
                const storedImg = getFirstProp(phoneDetails, ['phone_image_url', 'phoneImageUrl', 'phone_image']);
                let previewUrl = '';
                if (storedImg) {
                  try { previewUrl = await resolveImageUrl(storedImg); } catch (e) { previewUrl = ''; }
                }
                setPreviews(prev => ({ ...prev, phoneImage: previewUrl }));
              }
              setImeiError('imei_already_exists');
              setIsImeiValid(false);
              showToast('error', 'imei_already_exists_data_prefilled');
            }
          }
        } else {
          setIsImeiValid(true);
          setFormData(prev => ({
            ...prev,
            ownerName: (prev.registerType === 'mine' || user?.role === 'business') ? prev.ownerName : '',
            phoneNumber: (prev.registerType === 'mine' || user?.role === 'business') ? prev.phoneNumber : '',
            phoneType: '',
            phoneImage: null,
          }));
          setPreviews(prev => ({ ...prev, phoneImage: '' }));
        }
      } catch (error) {
        setIsImeiValid(false);
        console.error("Error checking IMEI:", error);
        showToast('error', (error instanceof Error) ? error.message : t('error_checking_imei'));
        setFormData(prev => ({
          ...prev,
          ownerName: (prev.registerType === 'mine' || user?.role === 'business') ? prev.ownerName : '',
          phoneNumber: (prev.registerType === 'mine' || user?.role === 'business') ? prev.phoneNumber : '',
          phoneType: '',
          phoneImage: null
        }));
        setPreviews(prev => ({ ...prev, phoneImage: '' }));
      } finally {
        setIsLoading(false);
      }
    }
  }, [checkImeiExists, showToast, t, user, toast]);

  const updateImage = useCallback(async (file: File, type: ImageType) => {
    const previewUrl = URL.createObjectURL(file);
    setPreviews(prev => ({ ...prev, [type]: previewUrl }));

    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: 'image/webp',
    };

    try {
      toast({ description: t('compressing_image') });
      const compressedFile = await imageCompression(file, options);
      setFormData(prev => ({ ...prev, [type]: compressedFile }));
      toast({ title: t('success'), description: t('image_compressed_successfully') });
    } catch (error) {
      console.error('Image compression error:', error);
      toast({ title: t('error'), description: t('image_compression_failed'), variant: 'destructive' });
      setFormData(prev => ({ ...prev, [type]: file }));
    }
  }, [t, toast]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, type: ImageType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('error', 'file_too_large_10mb');
      return;
    }
    if (!file.type.startsWith('image/')) {
      showToast('error', 'invalid_file_type');
      return;
    }

    // التحقق من التوقيع السحري (Magic Bytes)
    const isValidImage = await validateImageFile(file);
    if (!isValidImage) {
      showToast('error', 'invalid_file_type');
      return;
    }

    await updateImage(file, type);
  }, [updateImage, showToast]);

  const startCamera = useCallback(async (direction: 'front' | 'back', type: ImageType) => {
    try {
      const image = await CapacitorCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        direction: direction === 'front' ? CameraDirection.Front : CameraDirection.Rear,
      });

      if (image.webPath) {
        const response = await fetch(image.webPath);
        const blob = await response.blob();
        const file = new File([blob], `${type}.jpg`, { type: 'image/jpeg' });
        await updateImage(file, type);
      }
    } catch (error) {
      console.error('Camera error:', error);
      showToast('error', 'error_capturing_photo');
    }
  }, [updateImage, showToast]);

  const validateForm = useCallback(async (): Promise<boolean> => {
    const needsIdLast6 = formData.registerType === 'other';

    const validations = [
      {
        // If registering for another person, require id_last6; when registering for self,
        // id_last6 may be supplied from decrypted backend data and the field is disabled,
        // so do not force it here.
        condition: !formData.ownerName || !formData.phoneNumber || !formData.imei || !formData.phoneType || !formData.password || !formData.confirmPassword || (needsIdLast6 && !formData.id_last6),
        message: 'fill_all_fields'
      },
      // Validate id_last6 length only when it's required (registering for other)
      ...(needsIdLast6 ? [{ condition: formData.id_last6.length !== 6, message: 'id_last6_invalid' }] : []),
      {
        condition: formData.password.length < 8,
        message: 'password_too_short'
      },
      {
        condition: formData.password !== formData.confirmPassword,
        message: 'passwords_dont_match'
      },
      {
        condition: !formData.phoneImage || !formData.receiptImage,
        message: 'upload_required_images'
      }
    ];

    for (const validation of validations) {
      if (validation.condition) {
        showToast('error', validation.message);
        return false;
      }
    }

    if (formData.imei.length !== IMEI_LENGTH) {
      showToast('error', 'invalid_imei_length');
      return false;
    }

    try {
      // ملاحظة أمنية: إرسال البيانات كنص عادي عبر HTTPS آمن
      // التشفير سيتم في الخلفية (Backend)
      const cleanImeiValue = cleanImei(formData.imei);
      const exists = await checkImeiExists(cleanImeiValue);
      if (exists.exists) {
        setImeiError('imei_already_exists');
        showToast('error', 'imei_already_exists');
        return false;
      }
    } catch (error) {
      console.error("Error checking IMEI:", error);
      showToast('error', (error instanceof Error && error.message) ? error.message : t('error_checking_imei'));
      return false;
    }

    return true;
  }, [formData, checkImeiExists, showToast, t, setImeiError]);

  const savePhoneData = useCallback(async () => {
    try {
      setIsLoading(true);

      let phoneImagePath = null;
      if (formData.phoneImage) {
        const fileName = `${formData.imei}_phone_${Date.now()}.jpg`;
        const { data: phoneUpload, error: phoneError } = await supabase.storage
          .from('registerphone')
          .upload(fileName, formData.phoneImage);

        if (phoneError) throw phoneError;

        // تخزين المسار فقط (path)، بدون URL كامل
        phoneImagePath = fileName;
      }

      let receiptImagePath = null;
      if (formData.receiptImage) {
        const fileName = `${formData.imei}_receipt_${Date.now()}.jpg`;
        const { data: receiptUpload, error: receiptError } = await supabase.storage
          .from('registerphone')
          .upload(fileName, formData.receiptImage);

        if (receiptError) throw receiptError;

        // تخزين المسار فقط (path)، بدون URL كامل
        receiptImagePath = fileName;
      }

      const now = new Date().toISOString();

      // تحديد user_id حسب نوع التسجيل
      let userIdToSave = user?.id || null;
      if (formData.registerType === 'other') {
        userIdToSave = null;
      }
      const phoneData = {
        imei: cleanImei(formData.imei),
        phone_type: formData.phoneType,
        password: formData.password,
        phone_image_url: phoneImagePath,
        receipt_image_url: receiptImagePath,
        registration_date: now,
        review_status: null,
        review_date: null,
        status: 'pending',
        user_id: userIdToSave,
        owner_name: '',
        phone_number: '',
        id_last6: '',
        email: '',
      };

      if (formData.registerType === 'other') {
        phoneData.owner_name = formData.ownerName;
        phoneData.phone_number = cleanPhoneNumber(`${countryCode}${formData.phoneNumber}`);
        phoneData.id_last6 = cleanIdLast6(formData.id_last6);
        phoneData.email = formData.email;
      } else {
        const currentUser = user as any;
        phoneData.owner_name = formData.ownerName || currentUser?.user_metadata?.full_name || '';
        phoneData.phone_number = (formData.phoneNumber && cleanPhoneNumber(`${countryCode}${formData.phoneNumber}`)) || currentUser?.phone || '';
        phoneData.id_last6 = formData.id_last6 || currentUser?.user_metadata?.id_last6 || '';
        phoneData.email = formData.email || user?.email || '';
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await axiosInstance.post('/api/register-phone',
        { ...phoneData, useBonusOnLimit: true },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          validateStatus: () => true // قبول أي استجابة (لا نعتبر 4xx/5xx كأخطاء)
        }
      );

      // التحقق من نجاح الاستجابة
      if (response.status >= 200 && response.status < 300) {
        // نجاح
        Object.values(previews).forEach(url => url && URL.revokeObjectURL(url));
        showToast('success', 'phone_registered_success_description');
        setTimeout(() => {
          navigate('/dashboard');
        }, 3000);
      } else {
        // فشل
        const errorData = response.data;
        const errorMsg = errorData?.error || errorData?.message || t('error_saving_phone_data');
        console.error('Register phone error response:', { status: response.status, data: errorData });
        showToast('error', errorMsg);
      }
    } catch (error) {
      console.error('خطأ في حفظ بيانات الهاتف:', error);
      if ((error as any)?.response?.status === 429) {
        setHasReachedRegisterLimit(true);
        setShowUpgradeModal(true);
        showToast('error', 'register_limit_exceeded');
      } else if ((error as any)?.response?.data?.code === '23514') {
        showToast('error', 'invalid_review_status');
      } else {
        const errorMsg = (error as any)?.message || t('error_saving_phone_data');
        showToast('error', errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [formData, previews, showToast, navigate, user, countryCode]);

  const validateOtherUserData = useCallback(async (): Promise<boolean> => {
    if (formData.registerType !== 'other') return true;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return false;

      const response = await axiosInstance.post('/api/validate-other-registration-data',
        {
          ownerName: cleanText(formData.ownerName),
          phoneNumber: cleanPhoneNumber(`${countryCode}${formData.phoneNumber}`),
          id_last6: cleanDigits(formData.id_last6)
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return response.status === 200 && !!response.data?.valid;
    } catch (error) {
      console.error('Error validating other user data:', error);
      return false;
    }
  }, [formData.registerType, formData.ownerName, formData.phoneNumber, formData.id_last6, countryCode]);

  useEffect(() => {
    if (hasReachedRegisterLimit) {
      setShowUpgradeModal(true);
    }
  }, [hasReachedRegisterLimit]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep < 4) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    setIsLoading(true);

    try {
      // تحقق من الحد المسموح أولاً
      if (!user?.id) {
        toast({ title: t('error'), description: t('please_login_first'), variant: 'destructive' });
        setIsSubmitting(false);
        setIsLoading(false);
        return;
      }
      const canRegister = await checkRegisterLimit(user.id);
      if (!canRegister) {
        setIsSubmitting(false);
        setIsLoading(false);
        return;
      }

      const isValid = await validateForm();
      if (isValid) {
        if (formData.registerType === 'other') {
          const isOtherDataValid = await validateOtherUserData();
          if (!isOtherDataValid) {
            toast({ title: t('error'), description: t('other_registration_data_invalid'), variant: 'destructive' });
            setIsLoading(false);
            setIsSubmitting(false);
            return;
          }
        }

        await savePhoneData();
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      showToast('error', 'error_submitting_form');
    } finally {
      setIsLoading(false);
      setIsSubmitting(false);
    }
  }, [isSubmitting, validateForm, savePhoneData, showToast, user, checkRegisterLimit, toast, formData.registerType, validateOtherUserData, t]);

  useEffect(() => {
    return () => {
      Object.values(previews).forEach(url => url && URL.revokeObjectURL(url));
    };
  }, [previews]);

  const imageTypesData: { type: ImageType; labelKey: string; icon: React.ElementType; showUpload: boolean; cameraDirection: 'front' | 'back' }[] = [
    { type: 'phoneImage', labelKey: 'phone_image', icon: Camera, showUpload: true, cameraDirection: 'back' },
    { type: 'receiptImage', labelKey: 'receipt_image', icon: FileText, showUpload: true, cameraDirection: 'back' },
  ];

  const renderImageUpload = (typeData: typeof imageTypesData[0]) => (
    <div key={typeData.type} className="mb-4 bg-gradient-to-r from-blue-100 to-cyan-100 p-4 rounded-xl border-2 border-imei-cyan hover:border-imei-cyan transition-all duration-300 shadow-lg hover:shadow-xl w-full">
      <div className="flex items-center mb-2">
        <typeData.icon className="w-6 h-6 mr-2 text-imei-cyan" />
        <label className="text-lg font-bold bg-gradient-to-r from-blue-900 to-cyan-700 bg-clip-text text-transparent">
          {t(typeData.labelKey)}
        </label>
      </div>

      <div className="flex flex-col space-y-2">
        {previews[typeData.type] ? (
          <div className="relative group overflow-hidden rounded-lg cursor-pointer" onClick={() => { setFullImageUrl(previews[typeData.type]); setShowFullImage(true); }}>
            <img
              src={previews[typeData.type]}
              alt={t(typeData.labelKey)}
              className="w-full h-64 object-contain rounded-lg border border-imei-cyan/30 group-hover:border-imei-cyan/50 transition-all duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
              <p className="text-gray-800 text-sm font-medium px-4 py-2 rounded-full bg-imei-cyan/20 backdrop-blur-md border border-white/20">
                {t('click_to_change_image')}
              </p>
            </div>
          </div>
        ) : (
          <div className="h-64 border-2 border-dashed border-imei-cyan/20 rounded-lg flex flex-col items-center justify-center bg-gradient-to-b from-imei-dark/30 to-imei-darker/30 group hover:border-imei-cyan/40 transition-all duration-300">
            <typeData.icon className="w-16 h-16 text-imei-cyan/60 group-hover:text-imei-cyan/80 transition-colors duration-300" strokeWidth={1} />
            {typeData.type === 'phoneImage' ? (
              <p className="text-center text-sm text-red-700 font-bold mt-2 bg-red-100 p-2 rounded-md">{t('phone_image_instructions')}</p>
            ) : (
              <>
                <p className="text-center text-sm text-gray-800 mt-2">{t(`no_${typeData.labelKey.replace('_image', '')}_preview`)}</p>
                <p className="text-xs mt-1 text-gray-600">{t('image_will_be_displayed_here')}</p>
              </>
            )}
          </div>
        )}

        <div className="flex space-x-2">
          {typeData.showUpload && (
            <>
              <input
                type="file"
                id={`${typeData.type}-upload`}
                accept="image/*"
                onChange={(e) => handleFileChange(e, typeData.type)}
                className="hidden"
              />
              <label
                htmlFor={`${typeData.type}-upload`}
                className="flex-1 bg-gradient-to-r from-blue-800 via-blue-700 to-blue-800 hover:from-blue-700 hover:via-blue-600 hover:to-blue-700 text-white py-2 px-2 rounded-lg text-center cursor-pointer transition-all duration-300 shadow hover:shadow-md flex items-center justify-center text-sm"
              >
                <Upload className="w-4 h-4 mr-1" />
                {t('upload')}
              </label>
            </>
          )}

          <Button
            type="button"
            onClick={() => startCamera(typeData.cameraDirection, typeData.type)}
            className="flex-1 bg-gradient-to-r from-cyan-800 via-cyan-700 to-cyan-800 hover:from-cyan-700 hover:via-cyan-600 hover:to-cyan-700 text-white py-2 px-2 rounded-lg transition-all duration-300 shadow hover:shadow-md flex items-center justify-center text-sm"
          >
            <Camera className="w-4 h-4 mr-1" />
            {t('capture')}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <PageContainer >
      <div className="pb-3">
        <AppNavbar />
        <PageAdvertisement pageName="registerphone" />
        <div className="flex items-center mb-6 pt-3" style={{ background: 'linear-gradient(to top, #053060 0%, #0a4d8c 100%)', padding: '0.3rem', borderRadius: '1rem', marginTop: '1rem' }}>
          <BackButton to="/dashboard" className="mr-4" />
          <h1
            className="flex-1 text-center text-2xl font-bold"
            style={{ color: '#ffffff' }}
          >
            {t('register_new_phone')}
          </h1>
        </div>
        {showUpgradeModal && user && (
          <AdsOfferSlider onClose={() => setShowUpgradeModal(false)} userId={user.id} isUpgradePrompt={true} />
        )}
        <Card className="max-w-6xl p-0 bg-transparent shadow-none border-none" style={{ backgroundColor: 'transparent' }}>
          <CardContent className="p-0">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* أزرار نوع التسجيل */}
              <div className="flex gap-4 mb-4">
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-lg font-bold border-2 transition-all duration-200 ${formData.registerType === 'mine' ? 'bg-green-600 text-white border-green-700 shadow-lg' : 'bg-white text-green-700 border-green-400 hover:bg-green-50'}`}
                  onClick={() => setFormData(prev => ({ ...prev, registerType: 'mine' }))}
                >
                  {t('register_for_me')}
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-lg font-bold border-2 transition-all duration-200 ${formData.registerType === 'other' ? 'bg-orange-600 text-white border-orange-700 shadow-lg' : 'bg-white text-orange-700 border-orange-400 hover:bg-orange-50'}`}
                  onClick={() => setFormData(prev => ({ ...prev, registerType: 'other' }))}
                >
                  {t('register_for_other')}
                </button>
              </div>
              <div className="w-full px-0 mb-4">
                <div className="relative w-full py-4">
                  <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-slate-200" />
                  <div
                    className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 bg-emerald-500 transition-all duration-300"
                    style={{ width: `${((currentStep - 1) / (stepItems.length - 1)) * 100}%` }}
                  />
                  <div className="relative grid w-full grid-cols-4 gap-2 px-2">
                    {stepItems.map((item, index) => {
                      const stepIndex = index + 1;
                      const isCompleted = stepIndex < currentStep;
                      const isActive = stepIndex === currentStep;
                      return (
                        <div key={item.title} className="flex min-w-0 flex-col items-center text-center">
                          <div
                            className={`relative flex h-14 w-14 items-center justify-center rounded-full text-sm font-semibold shadow-sm transition-all duration-300 ${
                              isCompleted
                                ? 'bg-emerald-500 text-white'
                                : isActive
                                ? 'bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-xl'
                                : 'bg-white border border-slate-300 text-slate-600'
                            }`}
                          >
                            {isCompleted ? <CheckCircle className="h-5 w-5" /> : stepIndex}
                          </div>
                          <p className={`mt-3 w-full text-[10px] leading-5 font-semibold ${isActive ? 'text-slate-900' : 'text-slate-600'}`}>
                            {item.title}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="rounded-[28px] border border-slate-200 bg-white/95 p-4 sm:p-5 shadow-sm">
                <div className="space-y-5">
                  {currentStep === 1 && (
                    <div className="space-y-5">
                      <div>
                        <label htmlFor="imei" className="flex items-center gap-2 text-gray-800 text-sm font-medium mb-1">
                      <Hash className="w-4 h-4 text-[#0a4d8c]" />
                      IMEI
                    </label>
                    <div className="relative">
                      {!isImeiValid && (
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Smartphone className="h-4 w-4 text-gray-500" />
                        </div>
                      )}
                      <input
                        type="text"
                        id="imei"
                        name="imei"
                        value={formData.imei}
                        onChange={handleImeiChange}
                        className={`input-field w-full text-gray-800 !pl-12 ${imeiError ? 'border-red-500' : ''} ${isImeiValid ? 'border-green-500' : ''}`}
                        maxLength={IMEI_LENGTH}
                        pattern="[0-9]*"
                        inputMode="numeric"
                        required
                        placeholder={t('imei_placeholder_15_digits')}
                        disabled={hasReachedRegisterLimit}
                      />
                      {isImeiValid && (
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        </div>
                      )}
                    </div>
                    {imeiError && (
                      (imeiError === 'imei_stolen' || imeiError === 'imei_registered_to_you') ? (
                        <div
                          className="my-4 p-4 rounded-lg text-center flex flex-col items-center space-y-3 shadow-lg border"
                          style={{
                            background: 'linear-gradient(90deg, rgb(240, 247, 255) 0%, rgb(234, 244, 255) 100%)',
                            borderColor: '#2196f3'
                          }}
                        >
                          <AlertTriangle className="w-12 h-12 text-blue-500" />
                          <p className="text-blue-700 font-semibold text-lg">
                            {imeiError === 'imei_stolen' ? t('imei_stolen') : t('imei_registered_to_you_error')}
                          </p>
                        </div>
                      ) : (
                        <p className="text-red-500 text-sm mt-1">{t(imeiError)}</p>
                      )
                    )}
                  </div>
                  <div>
                    <label htmlFor="phoneType" className="flex items-center gap-2 text-gray-800 text-sm font-medium mb-1">
                      <Smartphone className="w-4 h-4 text-[#0a4d8c]" />
                      {t('phone_type')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <FileText className="h-4 w-4 text-gray-500" />
                      </div>
                      <input
                        type="text"
                        id="phoneType"
                        name="phoneType"
                        value={formData.phoneType}
                        onChange={handleChange}
                        className="input-field w-full text-gray-800 !pl-12"
                        required
                        placeholder={t('phone_type_placeholder')}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                </div>
              )}
              {currentStep === 2 && (
                <div className="space-y-5">
                  <div>
                    <label htmlFor="ownerName" className="flex items-center gap-2 text-gray-800 text-sm font-medium mb-1">
                  <User className="w-4 h-4 text-[#0a4d8c]" />
                  {t('owner_name')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-gray-500" />
                  </div>
                  <input
                    type="text"
                    id="ownerName"
                    name="ownerName"
                    value={formData.registerType === 'mine' ? maskName(formData.ownerName) : formData.ownerName}
                    onChange={handleChange}
                    className="input-field w-full text-gray-800 !pl-12"
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    disabled={formData.registerType === 'mine' || isLoading}
                    required
                    placeholder={t('owner_name_placeholder')}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="phoneNumber" className="flex items-center gap-2 text-gray-800 text-sm font-medium mb-1">
                  <Phone className="w-4 h-4 text-[#0a4d8c]" />
                  {t('phone_label')}
                </label>
                <div className="flex gap-2 items-center">
                  <CountryCodeSelector
                    value={countryCode}
                    onChange={setCountryCode}
                    disabled={formData.registerType === 'mine' || isLoading}
                  />
                  <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-4 w-4 text-gray-500" />
                    </div>
                    <input
                      type="tel"
                      id="phoneNumber"
                      name="phoneNumber"
                      value={formData.registerType === 'mine' ? maskPhoneNumber(formData.phoneNumber) : formData.phoneNumber}
                      onChange={handleChange}
                      className="input-field w-full text-gray-800 !pl-12"
                      disabled={formData.registerType === 'mine' || isLoading}
                      required
                      placeholder={t('phone_placeholder')}
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>
              {/* حقل الإيميل */}
              <div>
                <label htmlFor="email" className="flex items-center gap-2 text-gray-800 text-sm font-medium mb-1">
                  <Mail className="w-4 h-4 text-[#0a4d8c]" />
                  {t('email')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-gray-500" />
                  </div>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.registerType === 'mine' ? maskEmail(formData.email) : formData.email}
                    onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="input-field w-full text-gray-800 !pl-12"
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    disabled={formData.registerType === 'mine' || isLoading}
                    required
                    placeholder={t('email_placeholder')}
                  />
                </div>
              </div>
              {/* حقل آخر 6 أرقام من البطاقة الشخصية */}
              <div>
                <label htmlFor="id_last6" className="flex items-center gap-2 text-gray-800 text-sm font-medium mb-1">
                  <CreditCard className="w-4 h-4 text-[#0a4d8c]" />
                  {t('id_last_6_digits')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CreditCard className="h-4 w-4 text-gray-500" />
                  </div>
                  <input
                    type="text"
                    id="id_last6"
                    name="id_last6"
                    value={formData.registerType === 'mine' ? maskIdLast6(formData.id_last6) : formData.id_last6}
                    onChange={handleChange}
                    className="input-field w-full text-gray-800 !pl-12"
                    maxLength={6}
                    pattern="[0-9]*"
                    inputMode="numeric"
                    disabled={formData.registerType === 'mine' || isLoading}
                    required
                    placeholder={t('id_last_6_digits_placeholder')}
                    style={{ direction: 'ltr', textAlign: 'left' }}
                  />
                </div>
              </div>
                </div>
              )}
              {currentStep === 3 && (
                <div className="space-y-5">
                  <div>
                    <label htmlFor="password" className="flex items-center gap-2 text-gray-800 text-sm font-medium mb-1">
                  <KeyRound className="w-4 h-4 text-[#0a4d8c]" />
                  {t('password')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound className="h-4 w-4 text-gray-500" />
                  </div>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="input-field w-full text-gray-800 !pl-12"
                    required
                    placeholder={t('password_placeholder')}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="confirmPassword" className="flex items-center gap-2 text-gray-800 text-sm font-medium mb-1">
                  <KeyRound className="w-4 h-4 text-[#0a4d8c]" />
                  {t('confirm_password')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound className="h-4 w-4 text-gray-500" />
                  </div>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="input-field w-full text-gray-800 !pl-12"
                    required
                    placeholder={t('confirm_password_placeholder')}
                  />
                </div>
              </div>
                </div>
              )}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <h3 className="text-gray-800 text-lg font-semibold">{t('upload_images')}</h3>
                  {imageTypesData.map(renderImageUpload)}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            {currentStep > 1 && (
              <Button
                type="button"
                onClick={handlePrevStep}
                disabled={isLoading || isSubmitting}
                className="flex-1 rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-slate-700 font-semibold transition hover:bg-slate-200"
              >
                {t('previous')}
              </Button>
            )}
            <Button
              type="submit"
              className="flex-1 rounded-lg bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-white font-semibold shadow-lg transition hover:from-sky-700 hover:to-cyan-600"
              disabled={isSubmitting || imeiError !== '' || hasReachedRegisterLimit}
            >
              {currentStep < 4 ? t('next') : (isSubmitting ? t('submitting') : t('register_phone'))}
            </Button>
          </div>
        </form>
          </CardContent>
        </Card>
        {/* نافذة عرض الصورة الكاملة */}
        {showFullImage && (
          <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center p-4" onClick={() => setShowFullImage(false)}>
            <div className="max-w-full max-h-[80vh] flex items-center justify-center relative mb-4">
              <img
                src={fullImageUrl || ''}
                alt={t('full_size_view')}
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={() => setShowFullImage(false)}
                className="absolute top-4 right-4 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition-all duration-200 z-10"
                aria-label={t('close')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="text-white text-center mt-4 mb-6">
              <p className="text-sm">{t('swipe_to_close')}</p>
            </div>
          </div>
        )}
      </div>

    </PageContainer>
  );
};

export default RegisterPhone;
