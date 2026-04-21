import React, { useState, useRef, useEffect } from 'react';
import { Camera as CapacitorCamera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, History, ArrowLeft, AlertCircle, CheckCircle, XCircle, Image as ImageIcon, ChevronDown, FileText, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase'; // استيراد Supabase
import { mockPhoneReports } from '../services/mockData';
import jsPDF from 'jspdf';
import { processArabicTextWithEncoding as processArabicText, loadArabicFontSafe as loadArabicFont } from '../utils/pdf/arabic-final-solution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '../contexts/AuthContext'; // استيراد useAuth
import ImageViewer from '@/components/ImageViewer';
import PageContainer from '@/components/PageContainer';
import Logo from '@/components/Logo';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import CountryCodeSelector from '../components/CountryCodeSelector';
import imageCompression from 'browser-image-compression';
import axiosInstance from '@/services/axiosInterceptor';
import { decryptPhoneNumber } from '../lib/imeiCrypto';

// دالة مساعدة للتحقق من أدوار المستخدم التجاري
const isBusinessRole = (role?: string) => ['business', 'free_business', 'gold_business', 'silver_business'].includes(role || '');

// دالة مساعدة لفك تشفير رقم الهاتف
const decryptPhoneIfEncrypted = (phone: any): string => {
  if (!phone) return '';
  try {
    // تحويل البيانات إلى نص إذا كانت كائناً للتعامل مع التشفير
    let phoneStr = typeof phone === 'object' ? JSON.stringify(phone) : String(phone);

    // تحقق مما إذا كان النص يبدو مشفراً
    if (phoneStr.includes('encryptedData') ||
      (/^[A-Za-z0-9+/=]+$/.test(phoneStr) && phoneStr.length > 20)) {

      const decrypted = decryptPhoneNumber(phoneStr);

      // إذا نجح فك التشفير وأعطى نتيجة مختلفة عن النص الأصلي، فارجعها
      if (decrypted && decrypted !== phoneStr && !decrypted.includes('encryptedData')) {
        return decrypted;
      }
    }
    return phoneStr;
  } catch (e) {
    return typeof phone === 'string' ? phone : (typeof phone === 'object' ? JSON.stringify(phone) : '');
  }
};

// interface TransferRecord { // لم تعد هذه الواجهة مستخدمة بشكل مباشر هنا لإنشاء سجل جديد
//   id: string;
//   date: string;
//   imei: string;
//   phoneType: string;
//   seller: {
//     name: string;
//     phone: string;
//     idImage: string;
//     selfie: string;
//   };
//   buyer: {
//     name: string;
//     phone: string;
//     idImage: string;
//     selfie: string;
//   };
//   receiptImage: string;
//   phoneImage: string;
// }

// إضافة مكون ImageUploader
const ImageUploader: React.FC<{
  label: string;
  image: string;
  setImage: (url: string) => void;
  onCameraClick: () => void;
  disabled?: boolean;
}> = ({ label, image, setImage, onCameraClick, disabled }) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  // إضافة مستمع للنقر خارج المربع المنسدل
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setShowOptions(false);
      return;
    }

    // Validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSizeBytes = 10 * 1024 * 1024; // 10 MB
    if (!allowedTypes.includes(file.type)) {
      toast({ title: t('invalid_file_type') || 'نوع الملف غير مدعوم', description: t('please_upload_images_only') || 'يرجى رفع صور فقط (jpg, png, webp)', variant: 'destructive' });
      e.currentTarget.value = '';
      setShowOptions(false);
      return;
    }
    if (file.size > maxSizeBytes) {
      toast({ title: t('file_too_large') || 'حجم الملف كبير', description: `الحد الأقصى المسموح به هو ${maxSizeBytes / (1024 * 1024)} ميغابايت.`, variant: 'destructive' });
      e.currentTarget.value = '';
      setShowOptions(false);
      return;
    }

    try {
      toast({ description: t('compressing_image') || 'جاري ضغط الصورة...' });
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, initialQuality: 0.8 } as any;
      const compressedFile = await imageCompression(file, options);
      const previewUrl = URL.createObjectURL(compressedFile as File);
      setImage(previewUrl);
    } catch (err) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }

    setShowOptions(false);
  };

  const handleCameraClick = () => {
    onCameraClick();
    setShowOptions(false);
  };


  return (
    <div className="space-y-2">
      <label className="block text-black mb-1">{label}</label>
      <div className="relative group">
        {image ? (
          <div className="relative">
            <img
              src={image}
              alt={label}
              className="w-full h-48 object-cover rounded-lg shadow-lg"
            />
            <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center gap-2">
              <button
                onClick={() => setImage('')}
                className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full"
                title={t('remove') || 'حذف'}
              >
                <XCircle className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowOptions(true)}
                className="bg-imei-cyan hover:bg-cyan-700 text-white p-2 rounded-full"
                title={t('change_photo') || 'تغيير الصورة'}
                disabled={disabled}
              >
                <Camera className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="border-2 border-dashed border-imei-cyan border-opacity-50 rounded-lg p-6 text-center hover:border-opacity-100 transition-all duration-200">
            <div className="flex flex-col items-center gap-4">
              <div className="bg-imei-cyan bg-opacity-10 p-4 rounded-full">
                <ImageIcon className="w-8 h-8 text-imei-cyan" />
              </div>
              <div className="relative" ref={optionsRef}>
                <button
                  onClick={() => setShowOptions(!showOptions)}
                  className="flex items-center gap-2 bg-imei-cyan hover:bg-cyan-700 text-white py-2 px-4 rounded-xl transition-all duration-200"
                  disabled={disabled}
                >
                  <Camera className="w-5 h-5" />
                  <span>{t('add_photo') || 'إضافة صورة'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showOptions ? 'rotate-180' : ''}`} />
                </button>

                {showOptions && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-imei-darker border border-imei-cyan rounded-lg shadow-lg z-10 overflow-hidden">
                    <button
                      onClick={handleCameraClick}
                      className="flex items-center gap-2 w-full px-4 py-3 text-white hover:bg-imei-cyan transition-colors duration-200 border-b border-imei-cyan border-opacity-20"
                    >
                      <Camera className="w-4 h-4" />
                      <span>{t('take_photo') || 'التقاط صورة'}</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 w-full px-4 py-3 text-white hover:bg-imei-cyan transition-colors duration-200"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{t('choose_from_gallery') || 'اختيار من الاستديو'}</span>
                    </button>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImageUpload}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const BusinessTransfer: React.FC = () => {
  useScrollToTop();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://imei-safe.me' : '/api');
  // دالة تلتقط صورة الفاتورة وتعمل على الهاتف (Capacitor) أو المتصفح
  const handleReceiptCamera = async () => {
    // تحقق من وجود منصة Capacitor أو جهاز جوال
    if ((typeof navigator !== 'undefined') && (navigator.userAgent.includes('Capacitor') || navigator.userAgent.includes('Android') || navigator.userAgent.includes('iPhone'))) {
      try {
        const image = await CapacitorCamera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Camera,
          direction: CameraDirection.Rear,
        });
        if (image && image.dataUrl) {
          setReceiptImage(image.dataUrl);
          toast({ title: t('success'), description: t('receipt_captured') || 'تم التقاط صورة الفاتورة بنجاح', variant: 'default' });
        }
      } catch (error) {
        toast({ title: t('error'), description: t('error_capturing_photo') || 'حدث خطأ أثناء التقاط الصورة', variant: 'destructive' });
      }
    } else {
      openCamera('receipt');
    }
  };
  const videoRef = useRef<HTMLVideoElement>(null);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [currentSelfieType, setCurrentSelfieType] = useState<'seller' | 'sellerId' | 'receipt' | null>(null);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false); // حالة جديدة للنافذة المنبثقة
  const [isFormLocked, setIsFormLocked] = useState(false);

  // حالة عرض الصور المكبرة
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);

  const [imei, setImei] = useState('');
  const [debouncedImei, setDebouncedImei] = useState('');
  const [phoneType, setPhoneType] = useState('');
  const [phoneImage, setPhoneImage] = useState<string>('');
  const [originalReceiptImage, setOriginalReceiptImage] = useState<string>('');
  const [sellerName, setSellerName] = useState('');
  const [sellerIdLast6, setSellerIdLast6] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerCountryCode, setBuyerCountryCode] = useState('+20');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerIdLast6, setBuyerIdLast6] = useState('');
  const [paid, setPaid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isPhoneReported, setIsPhoneReported] = useState<boolean | null>(null);

  // رسالة تظهر أسفل حقل IMEI عندما يكون الهاتف مسجل لمستخدم آخر أو منقول
  const [imeiNotice, setImeiNotice] = useState('');

  // Image states
  const [sellerIdImage, setSellerIdImage] = useState<string>('');
  const [sellerSelfie, setSellerSelfie] = useState<string>('');
  const [receiptImage, setReceiptImage] = useState<string>('');

  const [formData, setFormData] = useState({
    ownerName: '',
    phoneNumber: '',
    imei: '',
    lossLocation: '',
    lossTime: '',
    phoneImage: null as File | null,
    reportImage: null as File | null,
    idImage: null as File | null,
    selfieImage: null as File | null,
    password: ''
  });

  const [newOwnerName, setNewOwnerName] = useState('');
  // أزلنا الحالة العامة password لأنها غير مستخدمة وتتسبب في تحقق خاطئ
  const [sellerPassword, setSellerPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentRegisteredPhone, setCurrentRegisteredPhone] = useState<any>(null); // لتخزين سجل الهاتف من registered_phones

  // دالة مساعدة لبناء رابط الصورة الكامل من Supabase أو من الخادم (signed URL)
  const resolveImageUrl = async (path: string | null | undefined) => {
    if (!path || typeof path !== 'string') return '';
    const cleanPath = path.trim();
    if (cleanPath.startsWith('http') || cleanPath.startsWith('data:') || cleanPath.startsWith('blob:')) return cleanPath;


    // 2) اطلب signed URL من الخادم (يتطلب توكن الجلسة)
    try {
      let token = '';
      try { const { data: { session } } = await supabase.auth.getSession(); token = session?.access_token || ''; } catch (e) { token = ''; }
      const headers: any = token ? { Authorization: `Bearer ${token}` } : {};
      const resp = await axiosInstance.get('/api/signed-url', {
        params: { bucket: 'registerphone', path: cleanPath, expiresIn: 300 },
        headers,
        validateStatus: () => true
      });
      if (resp.status === 200 && resp.data?.signedUrl) return resp.data.signedUrl;
    } catch (e) {
      console.error('resolveImageUrl signed-url error', e);
    }

    return '';
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setImage: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const openCamera = (type: 'seller' | 'sellerId' | 'receipt') => {
    setCurrentSelfieType(type);
    setIsCameraOpen(true);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        toast({
          title: t('camera_error') || 'خطأ في الكاميرا',
          description: t('camera_permission_required') || 'يرجى السماح باستخدام الكاميرا',
          variant: 'destructive'
        });
      });
  };

  const captureSelfie = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg');
        if (currentSelfieType === 'seller') {
          setSellerSelfie(imageData);
        } else if (currentSelfieType === 'sellerId') {
          setSellerIdImage(imageData);
        } else if (currentSelfieType === 'receipt') {
          setReceiptImage(imageData);
        }
        closeCamera();
      }
    }
  };

  const closeCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setIsCameraOpen(false);
    setCurrentSelfieType(null);
  };

  const handlePayment = () => {
    setPaid(true);
    toast({
      title: t('payment_success') || 'تم الدفع بنجاح',
      description: t('you_can_now_transfer') || 'يمكنك الآن نقل الملكية.'
    });
  };

  const handleImeiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    setImei(value);
    setIsFormLocked(false);
    setImeiNotice('');
    if (!isBusinessRole(user?.role)) {
      setSellerName('');
      setSellerIdLast6('');
      setSellerPhone('');
    }
    setPhoneType('');
    setPhoneImage('');
    setOriginalReceiptImage('');
    setIsPhoneReported(null);
    setShowRegisterDialog(false);
  };

  // Debounce IMEI similar to buy flow
  useEffect(() => {
    setShowRegisterDialog(false);
    const handler = setTimeout(() => {
      if (imei.length === 15) setDebouncedImei(imei);
      else setDebouncedImei('');
    }, 800);
    return () => clearTimeout(handler);
  }, [imei]);

  // Fetch data for debounced IMEI using server endpoint and supabase for reports
  useEffect(() => {
    if (!debouncedImei) {
      setIsLoading(false);
      return;
    }
    const fetchData = async () => {
      setIsLoading(true);
      try {
        console.log('🔍 جاري البحث عن بلاغات للـ IMEI:', debouncedImei);
        const { count: reportCount, error: reportError } = await supabase
          .from('phone_reports')
          .select('*', { count: 'exact', head: true })
          .eq('imei', debouncedImei)
          .eq('status', 'active');

        console.log('📊 النتائج:', { reportCount, reportError, debouncedImei });
        if (reportError) throw reportError;
        const isReported = (reportCount ?? 0) > 0;
        console.log('✅ setIsPhoneReported:', isReported);
        setIsPhoneReported(isReported);
        if (isReported) {
          console.log('🔴 هاتف مبلغ عنه:', debouncedImei, '| reportCount:', reportCount);
          toast({ title: t('warning'), description: t('phone_is_reported_as_lost'), variant: 'destructive' });
          setIsLoading(false);
          return; // التوقف إذا كان هناك بلاغ - IMPORTANT: return here
        }

        let jwtToken = '';
        try { const { data: { session } } = await supabase.auth.getSession(); jwtToken = session?.access_token || ''; } catch (e) { jwtToken = ''; }

        const resp = await axiosInstance.post('/api/check-imei',
          { imei: debouncedImei, userId: user?.id || null },
          {
            headers: jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {},
            validateStatus: () => true
          }
        );

        if (resp.status !== 200) {
          if (resp.status === 404) {
            setShowRegisterDialog(true);
            setIsLoading(false);
            return;
          }
          const errorMsg = resp.data?.error || resp.data?.message || `Server responded ${resp.status}`;
          throw new Error(errorMsg);
        }

        const registeredPhone = resp.data;
        // احفظ استجابة السيرفر لتستخدم في العرض (مثلاً إظهار أن الهاتف مسجل لمستخدم آخر)
        setCurrentRegisteredPhone(registeredPhone || null);

        // التحقق من البلاغات من استجابة السيرفر
        if (registeredPhone?.hasActiveReport || registeredPhone?.isStolen) {
          console.log('🔴 هاتف مبلغ عنه من السيرفر:', { hasActiveReport: registeredPhone?.hasActiveReport, isStolen: registeredPhone?.isStolen });
          setIsPhoneReported(true);
          toast({ title: t('warning'), description: t('phone_is_reported_as_lost'), variant: 'destructive' });
          setIsLoading(false);
          return;
        }

        // التحقق من isOtherUser: إذا كان الهاتف مسجل لمستخدم آخر فقط
        if (registeredPhone?.isOtherUser && !registeredPhone?.phoneDetails) {
          setSellerName('');
          setSellerPhone('');
          setSellerIdLast6('');
          setPhoneType('');
          setPhoneImage('');
          setOriginalReceiptImage('');
          setIsFormLocked(true);
          setImeiNotice(t('phone_registered_other_field') || (t('phone_owned_by_other') || 'هذا الهاتف مسجل لمستخدم آخر. لا يمكن تعبئة الحقول هنا.'));
          toast({ title: 'معلومات', description: t('phone_owned_by_other') || 'هذا الهاتف مسجل لمستخدم آخر', variant: 'default' });
          setIsLoading(false);
          return;
        }

        if (!registeredPhone) throw new Error('Failed to fetch phone info');

        const pick = (obj: any, keys: string[]) => {
          if (!obj) return '';
          for (const k of keys) {
            if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k];
          }
          return '';
        };

        if (registeredPhone && registeredPhone.phoneDetails) {
          const details = registeredPhone.phoneDetails;
          // إذا أعاد السيرفر أن الهاتف موجود لكنه مملوك لمستخدم آخر أو مُنقَل
          // استثناء: إذا كانت الحالة منقولة (`isTransferred`) ولكن تفاصيل الهاتف تحوي `user_id`
          // يطابق المستخدم الحالي، فاعتبر الهاتف مملوكًا للمستخدم الحالي بدلاً من حظره.
          if (registeredPhone.isOtherUser || (registeredPhone.isTransferred && !(details && details.user_id && user && details.user_id === user.id))) {
            // لا نملأ الحقول الحساسة؛ نعرض رسالة تحت حقل IMEI بدلاً من تعبئتها
            setSellerName('');
            setSellerPhone('');
            setSellerIdLast6('');
            setPhoneType('');
            setPhoneImage('');
            setOriginalReceiptImage('');
            setIsFormLocked(true);
            setImeiNotice(t('phone_registered_other_field') || (t('phone_owned_by_other') || 'هذا الهاتف مسجل لمستخدم آخر. لا يمكن تعبئة الحقول هنا.'));
            toast({ title: 'معلومات', description: t('phone_owned_by_other') || 'هذا الهاتف مسجل لمستخدم آخر أو نُقلت ملكيته', variant: 'default' });
            setIsLoading(false);
            return;
          }
          // اعتبر الهاتف مملوكًا للمستخدم الحالي فقط إذا كان معرف المالك مطابقًا لمعرف المستخدم الحالي.
          // لا نعتمد على العلم `isOwnReport` وحده لأن بعض الاستجابات قد تكون مضللة.
          const isOwnedByCurrentUser = Boolean(details && details.user_id && user && details.user_id === user.id);
          if (isOwnedByCurrentUser) {
            setImeiNotice('');
            // إذا كان الهاتف مسجلاً الآن لحساب المستخدم الحالي بعد نقل الملكية
            // نعبئ حقول البائع بمعلومات المالك الحالي ونعرض رسالة بالعربية
            setSellerName(pick(details, ['owner_name', 'ownerName', 'maskedOwnerName', 'owner', 'name']) || (user?.username || user?.email || ''));
            // حاول الحصول على رقم الهاتف من عدة حقول ثم من user metadata قبل الاستعلام عن جداول غير مؤكدة
            let resolvedPhone = pick(details, ['owner_phone', 'ownerPhone', 'maskedPhoneNumber', 'phone', 'owner_phone_number']) || (user as any)?.phone || '';
            // فحص user metadata كخيار سريع
            const userMetaPhone = (user as any)?.user_metadata?.phone || (user as any)?.user_metadata?.phone_number || '';
            if ((!resolvedPhone || String(resolvedPhone).trim() === '') && userMetaPhone) {
              resolvedPhone = userMetaPhone;
            }

            // إذا بقي الرقم فارغاً، حاول جلبه من server endpoint (مفك التشفير)
            if ((!resolvedPhone || String(resolvedPhone).trim() === '') && user?.id) {
              try {
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                if (token) {
                  const response = await axiosInstance.get('/api/decrypted-user', {
                    headers: {
                      'Authorization': `Bearer ${token}`
                    }
                  });
                  if (response.data?.business?.phone) {
                    resolvedPhone = response.data.business.phone || resolvedPhone;
                  } else if (response.data?.user?.phone) {
                    resolvedPhone = response.data.user.phone || resolvedPhone;
                  }
                }
              } catch (e) {
                console.error('Error fetching decrypted phone number:', e);
              }
            }

            // لا داعي لمحاولة جدول businesses الآن لأننا استخدمنا server endpoint
            if ((!resolvedPhone || String(resolvedPhone).trim() === '') && user?.id) {
              try {
                const response = await axiosInstance.get('/api/decrypted-user');
                if (response.data?.business?.phone) {
                  resolvedPhone = response.data.business.phone || resolvedPhone;
                } else if (response.data?.user?.phone) {
                  resolvedPhone = response.data.user.phone || resolvedPhone;
                }
              } catch (e) {
                console.error('Unexpected error fetching decrypted user data:', e);
              }
            }

            // Phone from server is already decrypted
            setSellerPhone(resolvedPhone || '');
            setSellerIdLast6(pick(details, ['owner_id_last6', 'ownerIdLast6', 'maskedIdLast6', 'id_last6']) || '');
            setPhoneType(pick(details, ['phone_type', 'phoneType', 'model']) || '');
            {
              const imgPath = pick(details, ['phone_image_url', 'phoneImageUrl', 'phone_image']);
              const r = await resolveImageUrl(imgPath);
              setPhoneImage(r);
            }
            {
              const rcpt = pick(details, ['receipt_image_url', 'receiptImageUrl']);
              const r2 = await resolveImageUrl(rcpt);
              setOriginalReceiptImage(r2);
            }

            toast({
              title: 'معلومات',
              description: 'هذا الـ IMEI مسجل الآن لحسابك بعد نقل الملكية. تم تعبئة بيانات البائع تلقائيًا.',
              variant: 'default'
            });

            setIsFormLocked(false);
            setIsLoading(false);
            return;
          }

          setImeiNotice('');
          setSellerName(pick(details, ['owner_name', 'ownerName', 'maskedOwnerName', 'owner', 'name']));
          setSellerPhone(decryptPhoneIfEncrypted(pick(details, ['owner_phone', 'ownerPhone', 'maskedPhoneNumber', 'phone', 'owner_phone_number'])));
          setSellerIdLast6(pick(details, ['owner_id_last6', 'ownerIdLast6', 'maskedIdLast6', 'id_last6']));
          setPhoneType(pick(details, ['phone_type', 'phoneType', 'model']));
          {
            const imgPath = pick(details, ['phone_image_url', 'phoneImageUrl', 'phone_image']);
            const r = await resolveImageUrl(imgPath);
            setPhoneImage(r);
          }
          {
            const rcpt = pick(details, ['receipt_image_url', 'receiptImageUrl']);
            const r2 = await resolveImageUrl(rcpt);
            setOriginalReceiptImage(r2);
          }
        } else if (registeredPhone && registeredPhone.exists) {
          setImeiNotice('');
          setSellerName(pick(registeredPhone, ['owner_name', 'ownerName', 'maskedOwnerName']));
          setSellerPhone(decryptPhoneIfEncrypted(pick(registeredPhone, ['owner_phone', 'ownerPhone', 'maskedPhoneNumber'])));
          setSellerIdLast6(pick(registeredPhone, ['owner_id_last6', 'maskedIdLast6']));
          setPhoneType(pick(registeredPhone, ['phone_type', 'phoneType']));
          {
            const imgPath = pick(registeredPhone, ['phone_image_url', 'phoneImageUrl']);
            const r = await resolveImageUrl(imgPath);
            setPhoneImage(r);
          }
          {
            const rcpt = pick(registeredPhone, ['receipt_image_url', 'receiptImageUrl']);
            const r2 = await resolveImageUrl(rcpt);
            setOriginalReceiptImage(r2);
          }
        } else {
          setShowRegisterDialog(true);
        }
      } catch (error) {
        console.error('Error fetching data for IMEI:', error);
        toast({ title: t('error'), description: t('error_fetching_data'), variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [debouncedImei, t, toast, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!imei || !buyerName || !buyerPhone || !sellerName || !buyerIdLast6 || !buyerEmail) { // التأكد من وجود اسم البائع أيضاً
        toast({ title: 'خطأ', description: 'يرجى ملء جميع الحقول المطلوبة', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      // التحقق من صحة الإيميل
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(buyerEmail)) {
        toast({ title: 'خطأ', description: 'يرجى إدخال بريد إلكتروني صحيح', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      if (buyerIdLast6.length !== 6) {
        toast({ title: 'خطأ', description: 'يجب أن يتكون رقم البطاقة من 6 أرقام', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      // Request masked info from server instead of direct DB read
      let jwtTokenForSubmit = '';
      try { const { data: { session } } = await supabase.auth.getSession(); jwtTokenForSubmit = session?.access_token || ''; } catch (e) { jwtTokenForSubmit = ''; }

      const resp = await axiosInstance.post('/api/check-imei',
        { imei },
        {
          headers: jwtTokenForSubmit ? { 'Authorization': `Bearer ${jwtTokenForSubmit}` } : {},
          validateStatus: () => true
        }
      );

      if (resp.status !== 200) {
        const errMsg = resp.data?.error || resp.data?.message || 'لم يتم العثور على الهاتف في قاعدة البيانات للتسجيل الأولي';
        toast({ title: 'خطأ', description: errMsg, variant: 'destructive', className: 'bg-red-50 text-red-800 font-bold rtl border-2 border-red-500' });
        setIsLoading(false);
        return;
      }

      const phone = resp.data;

      // Some server responses use `exists` while older code expected `isRegistered`.
      const isRegistered = !!(phone?.isRegistered || phone?.exists);
      if (!isRegistered) {
        toast({ title: 'خطأ', description: 'لم يتم العثور على الهاتف في قاعدة البيانات للتسجيل الأولي', variant: 'destructive', className: 'bg-red-50 text-red-800 font-bold rtl border-2 border-red-500' });
        setIsLoading(false);
        return;
      }

      // Save masked phone info for UI; sensitive verification and final update happen server-side
      setCurrentRegisteredPhone(phone);
      setShowPasswordDialog(true);
      setIsLoading(false);
      return;

      // تم تعطيل هذا الكود واستبداله بنافذة الحوار المخصصة
      /* 
      const newPassword = prompt('...');
      */

      // تم حذف كود prompt القديم

      // Removed old client-side direct DB update code. Operations now delegated to server endpoints.
    } catch (error: any) {
      console.error("Error during ownership transfer:", error);
      // تحسين رسالة الخطأ لتكون أكثر تحديدًا
      let errorMessage = 'حدث خطأ أثناء معالجة الطلب';
      if (error && error.message) {
        // عرض رسالة الخطأ من Supabase مباشرة إذا كانت متاحة
        errorMessage = error.message;
      }
      toast({ title: 'خطأ', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async () => {
    setIsLoading(true);
    try {
      // 1) تحقق المدخلات في مربع الحوار - بالعربية وبدقة
      if (!sellerPassword || sellerPassword.trim().length === 0) {
        toast({
          title: 'كلمة المرور مطلوبة',
          description: 'يرجى إدخال كلمة مرور البائع الحالية',
          variant: 'destructive',
          className: 'bg-red-50 text-red-800 font-bold rtl border-2 border-red-500'
        });
        setIsLoading(false);
        return;
      }
      if (!newPassword) {
        toast({
          title: 'كلمة المرور مطلوبة',
          description: 'يرجى إدخال كلمة مرور للمشتري الجديد',
          variant: 'destructive',
          className: 'bg-red-50 text-red-800 font-bold rtl border-2 border-red-500'
        });
        setIsLoading(false);
        return;
      }
      if (newPassword.trim().length < 6) {
        toast({
          title: 'كلمة المرور قصيرة',
          description: 'يجب أن تتكون كلمة مرور المشتري من 6 أحرف على الأقل',
          variant: 'destructive',
          className: 'bg-red-50 text-red-800 font-bold rtl border-2 border-red-500'
        });
        setIsLoading(false);
        return;
      }

      if (!currentRegisteredPhone) {
        toast({
          title: 'بيانات غير موجودة',
          description: 'لم يتم العثور على بيانات الهاتف في النظام',
          variant: 'destructive',
          className: 'bg-red-50 text-red-800 font-bold rtl border-2 border-red-500'
        });
        setIsLoading(false);
        return;
      }

      // 2) تحقق الهوية وكلمة المرور عبر السيرفر بدلاً من قراءة الحقول الحساسة في العميل
      if (!(user && user.role === 'business')) {
        // Let axios interceptor handle Authorization header automatically
        const verifyResp = await axiosInstance.post('/api/verify-seller-password',
          { imei, password: sellerPassword, sellerIdLast6 },
          { validateStatus: () => true }
        );

        if (verifyResp.status !== 200) {
          const errMsg = verifyResp.data?.error || verifyResp.data?.message || 'تعذر التحقق من بيانات البائع';
          toast({ title: 'تعذر التحقق', description: errMsg, variant: 'destructive', className: 'bg-red-50 text-red-800 font-bold rtl border-2 border-red-500' });
          setIsLoading(false);
          return;
        }

        // read JSON and ensure server validated the password
        const verifyJson = verifyResp.data;
        if (!verifyJson || verifyJson.ok !== true) {
          const message = verifyJson && verifyJson.error ? verifyJson.error : t('seller_verification_failed') || 'تعذر التحقق من بيانات البائع';
          toast({ title: 'تعذر التحقق', description: message, variant: 'destructive', className: 'bg-red-50 text-red-800 font-bold rtl border-2 border-red-500' });
          setIsLoading(false);
          return;
        }
      } else {
        console.log('🚫 تم تخطي تحقق رقم بطاقة البائع لأن البائع مستخدم تجاري.');
      }

      // 3) رفع صورة الفاتورة الجديدة (إذا وجدت)
      let newReceiptImagePath: string | null = null;
      if (receiptImage) {
        const response = await fetch(receiptImage);
        const blob = await response.blob();
        const fileName = `receipt_${imei}_${Date.now()}.jpg`;
        const imageFile = new File([blob], fileName, { type: blob.type });
        const filePath = `receipts/${fileName}`;
        const { error: uploadError } = await supabase.storage.from('transfer-assets').upload(filePath, imageFile, { upsert: true });
        if (uploadError) throw uploadError;
        // تخزين المسار فقط (path)، بدون URL كامل
        newReceiptImagePath = filePath;
      }

      // 4) Delegate the transfer and update to server-side endpoint to handle sensitive writes
      let jwtTokenTransfer = '';
      try { const { data: { session } } = await supabase.auth.getSession(); jwtTokenTransfer = session?.access_token || ''; } catch (e) { jwtTokenTransfer = ''; }
      const transferPayload: any = {
        imei: String(imei).trim(),
        sellerPassword,
        newOwner: {
          owner_name: buyerName,
          phone_number: `${buyerCountryCode}${buyerPhone}`,
          id_last6: buyerIdLast6 || null,
          email: buyerEmail || null,
          password: newPassword,
          phone_type: phoneType || null,
          // لا نرسل معرف المستخدم الحالي هنا لأن العميل (المشتري) قد يختلف عن المستخدم المسجّل الآن.
          // اتركه null حتى يحدده الخادم من التوكن أو يبقى غير مرتبط إذا لم يكن للمشتري حساب.
          user_id: null
        },
        new_receipt_image_url: newReceiptImagePath || currentRegisteredPhone?.receipt_image_url,
        phone_image: phoneImage || null
      };

      const transferResp = await axiosInstance.post('/api/transfer-ownership',
        transferPayload,
        {
          headers: jwtTokenTransfer ? { 'Authorization': `Bearer ${jwtTokenTransfer}` } : {},
          validateStatus: () => true
        }
      );

      if (transferResp.status !== 200) {
        const errMsg = transferResp.data?.error || transferResp.data?.message || 'Transfer failed';
        throw new Error(errMsg);
      }

      // 5) نجاح
      toast({
        title: 'تمت العملية بنجاح',
        description: 'تم تحديث كلمة المرور ونقل ملكية الهاتف بنجاح',
        className: "bg-gradient-to-r from-green-500 to-green-600 text-white font-bold rtl"
      });

      setSuccess(true);
      setShowPasswordDialog(false);
    } catch (error: any) {
      console.error("Error in handlePasswordSubmit:", error);
      let errorMessage = 'حدث خطأ أثناء معالجة الطلب';
      if (error && error.message) {
        errorMessage = error.message;
      }
      toast({ title: 'خطأ', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // يجب استدعاء setCurrentPhoneReport عند الحاجة، مثلاً عند اختيار بلاغ معين للتعامل معه
  // هذا الجزء من الكود غير مكتمل في الملف الأصلي لكيفية تعيين currentPhone

  useEffect(() => {
    let logoutTimer: NodeJS.Timeout;

    const resetTimer = () => {
      if (logoutTimer) clearTimeout(logoutTimer);
      logoutTimer = setTimeout(() => {
        navigate('/logout'); // Redirect to logout page
      }, 5 * 60 * 1000); // 5 minutes in milliseconds
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resetTimer();
      } else {
        clearTimeout(logoutTimer);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    resetTimer();

    return () => {
      clearTimeout(logoutTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [navigate]);

  useEffect(() => {
    const fetchBusinessData = async () => {
      console.log('تشغيل useEffect لجلب بيانات المتجر. بيانات user:', user);
      // Check if the user is a business user
      if (user && isBusinessRole(user.role)) {
        setIsLoading(true);
        try {
          // Use server endpoint that properly decrypts all fields
          const response = await axiosInstance.get('/api/decrypted-user');
          const decryptedData = response.data;

          if (!decryptedData || (!decryptedData.user && !decryptedData.business)) {
            throw new Error('No data returned from decrypted-user endpoint');
          }

          // Use business data if available, otherwise fall back to user data
          const businessData = decryptedData.business;
          const userData = decryptedData.user;

          if (businessData) {
            console.log('نتيجة استعلام businesses (مفك التشفير):', businessData);

            // تعبئة اسم ورقم هاتف البائع تلقائياً للمستخدم التجاري
            const nameFromBusiness = businessData.owner_name?.trim() || businessData.store_name?.trim();
            const phoneFromBusiness = businessData.phone?.trim();
            const emailFromBusiness = businessData.email?.trim();

            const sellerNameValue = nameFromBusiness || user?.username || user?.email || 'اسم غير متوفر';
            setSellerName(sellerNameValue);
            console.log('تعبئة اسم البائع:', sellerNameValue);
            // Phone is already decrypted from server
            setSellerPhone(phoneFromBusiness || (user as any)?.phone || '');

            // تعبئة بيانات البائع فقط، بدون بيانات المشتري
            const idLast6Value = businessData.id_last6 || userData?.id_last6 || '';
            setSellerIdLast6(idLast6Value);
          } else if (userData) {
            // Fallback to user data if no business data
            const sellerNameValue = userData.full_name?.trim() || user?.username || user?.email || 'اسم غير متوفر';
            setSellerName(sellerNameValue);
            // Phone is already decrypted from server
            setSellerPhone(userData.phone?.trim() || '');

            // تعبئة البائع فقط، لا نملأ حقول المشتري
            setSellerIdLast6(userData.id_last6 || '');
          }
        } catch (error) {
          console.error('Error fetching decrypted user data:', error);
          toast({ title: 'خطأ', description: 'فشل تحميل بيانات المتجر.', variant: 'destructive' });
        } finally {
          setIsLoading(false);
        }
      }
    };

    fetchBusinessData();
  }, [user, t, toast]);

  return (
    <PageContainer>
      <div className="pb-3">

        {isCameraOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-imei-darker rounded-xl p-4 w-full max-w-md">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full rounded-lg mb-4"
              />
              <div className="flex justify-center gap-4">
                <button
                  onClick={captureSelfie}
                  className="bg-imei-cyan hover:bg-cyan-700 text-white py-2 px-4 rounded-xl font-bold"
                >
                  {t('capture')}
                </button>
                <button
                  onClick={closeCamera}
                  className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-xl font-bold"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="w-full max-w-2xl p-4 sm:p-8 py-12">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-imei-cyan hover:text-cyan-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>{t('back')}</span>
            </button>
            <Logo size="md" />
          </div>
          <h2 className="text-2xl font-bold text-orange-500 mb-6 text-center">{t('transfer_ownership')}</h2>
          {isLoading && <p className="text-center text-white my-4">{t('loading')}...</p>}
          {/* Removed top duplicated Alert — message now shown under IMEI input */}
          {success ? (
            <div className="text-green-500 text-center text-lg font-semibold py-8">
              {t('ownership_transferred')}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-black mb-1">IMEI</label>
                  <div className="relative">
                    {isPhoneReported !== null && imei.length === 15 && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        {isPhoneReported ? (
                          <span className="text-red-500 font-bold">{t('lost')}</span>
                        ) : (
                          <span className="text-green-500">✓</span>
                        )}
                      </div>
                    )}
                    <Input
                      type="text"
                      value={imei}
                      onChange={handleImeiChange}
                      className="input-field w-full"
                      maxLength={15}
                      placeholder="123456789012345"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  {isPhoneReported && imei.length === 15 && (
                    <div
                      className="my-4 p-4 rounded-lg text-center flex flex-col items-center space-y-3 shadow-lg border"
                      style={{
                        background: 'linear-gradient(90deg, #ffebee 0%, #ffcdd2 100%)',
                        borderColor: '#f44336'
                      }}
                    >
                      <AlertTriangle className="w-12 h-12 text-red-600" />
                      <p className="text-red-700 font-semibold text-lg">
                        هذا الهاتف مبلغ عنه كمفقود ولا يمكن نقل ملكيته.
                      </p>
                    </div>
                  )}
                  {(imeiNotice || (currentRegisteredPhone && (currentRegisteredPhone.isOtherUser || (currentRegisteredPhone.isTransferred && currentRegisteredPhone.phoneDetails?.user_id !== user?.id)))) && imei.length === 15 && (
                    <div
                      className="my-4 p-4 rounded-lg text-center flex flex-col items-center space-y-3 shadow-lg border"
                      style={{
                        background: 'linear-gradient(90deg, #f0f7ff 0%, #eaf4ff 100%)',
                        borderColor: '#2196f3'
                      }}
                    >
                      <AlertTriangle className="w-12 h-12 text-blue-500" />
                      <p className="text-blue-700 font-semibold text-lg">
                        هذا الهاتف مسجل لحساب آخر ولا يمكنك بيعه من هذا الحساب.
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-black mb-1">{t('phone_type')}</label>
                  <input
                    type="text"
                    value={phoneType}
                    onChange={e => setPhoneType(e.target.value)}
                    className="input-field w-full"
                    required
                    disabled={!!phoneType || isLoading || isFormLocked} // يبقى معطلاً إذا تم ملؤه تلقائياً
                    readOnly={!!phoneType}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h3 className="text-black font-bold text-xl border-b border-imei-cyan pb-2">
                    {t('seller_info')}
                  </h3>
                  <div>
                    <label className="block text-black mb-1">{t('seller_name')}</label>
                    <input
                      type="text"
                      value={sellerName}
                      onChange={e => setSellerName(e.target.value)}
                      className="input-field w-full"
                      dir="ltr"
                      required
                      placeholder="اسم البائع سيظهر هنا تلقائياً"
                      disabled={isLoading || isBusinessRole(user?.role) || isFormLocked}
                    />
                  </div>
                  <div>
                    <label className="block text-black mb-1">{t('seller_phone')}</label>
                    {typeof sellerPhone === 'string' && sellerPhone.includes('encryptedData') && (
                      <div className="mb-2 p-2 bg-yellow-100 border border-yellow-400 rounded text-yellow-800 text-sm">
                        ⚠️ البيانات مشفرة. يرجى تحديث الصفحة.
                      </div>
                    )}
                    <input
                      type="text"
                      value={sellerPhone}
                      onChange={e => setSellerPhone(e.target.value.replace(/\D/g, ''))}
                      className="input-field w-full"
                      dir="ltr"
                      inputMode="tel"
                      maxLength={15}
                      required
                      disabled={isLoading || user?.role === 'business' || isFormLocked}
                    />
                  </div>
                  {phoneImage && (
                    <div className="space-y-2">
                      <label className="block text-black mb-1">{t('phone_image')}</label>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedImage(phoneImage);
                          setIsImageViewerOpen(true);
                        }}
                        className="w-full cursor-pointer"
                      >
                        <img
                          src={phoneImage}
                          alt={t('phone_image')}
                          className="w-full h-48 object-contain rounded-lg shadow-lg bg-imei-dark p-2 border border-imei-cyan/30 transition-transform hover:scale-[1.02]"
                        />
                      </button>
                    </div>
                  )}
                  {originalReceiptImage && (
                    <div className="space-y-2">
                      <label className="block text-black mb-1">{t('receipt_image')}</label>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedImage(originalReceiptImage);
                          setIsImageViewerOpen(true);
                        }}
                        className="w-full cursor-pointer"
                      >
                        <img
                          src={originalReceiptImage}
                          alt={t('receipt_image')}
                          className="w-full h-48 object-contain rounded-lg shadow-lg bg-imei-dark p-2 border border-imei-cyan/30 transition-transform hover:scale-[1.02]"
                        />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <h3 className="text-black font-bold text-xl border-b border-imei-cyan pb-2">
                    {t('buyer_info')}
                  </h3>
                  <div>
                    <label className="block text-black mb-1">{t('buyer_name')}</label>
                    <input
                      type="text"
                      value={buyerName}
                      onChange={e => setBuyerName(e.target.value)}
                      className="input-field w-full"
                      required
                      disabled={isLoading || isFormLocked}
                    />
                  </div>
                  <div>
                    <label className="block text-black mb-1">{t('buyer_phone')}</label>
                    <div className="flex gap-2 items-center">
                      <CountryCodeSelector
                        value={buyerCountryCode}
                        onChange={setBuyerCountryCode}
                        disabled={isLoading || isFormLocked}
                      />
                      <input
                        type="text"
                        value={buyerPhone}
                        onChange={e => {
                          let val = e.target.value.replace(/\D/g, '');
                          if (val.startsWith('0')) val = val.replace(/^0+/, '');
                          setBuyerPhone(val);
                        }}
                        className="input-field w-full"
                        maxLength={15}
                        required
                        disabled={isLoading || isFormLocked}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-black mb-1">{t('buyer_email') || 'إيميل المشتري'}</label>
                    <input
                      type="email"
                      value={buyerEmail}
                      onChange={e => setBuyerEmail(e.target.value)}
                      className="input-field w-full"
                      required
                      disabled={isLoading || isFormLocked}
                      placeholder="example@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-black mb-1">آخر 6 أرقام من البطاقة الشخصية</label>
                    <input
                      type="text"
                      value={buyerIdLast6}
                      onChange={e => setBuyerIdLast6(e.target.value.replace(/\D/g, ''))}
                      className="input-field w-full"
                      maxLength={6}
                      pattern="[0-9]*"
                      inputMode="numeric"
                      placeholder="******"
                      required
                      disabled={isLoading || isFormLocked}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-black font-bold text-xl border-b border-imei-cyan pb-2">
                  {t('receipt_info')}
                </h3>

                <div className="mb-4 bg-gradient-to-br from-imei-darker via-imei-dark to-imei-darker p-4 rounded-xl border border-imei-cyan/30 hover:border-imei-cyan/60 transition-all duration-300 shadow-lg hover:shadow-xl w-full">
                  <div className="flex items-center mb-2">
                    <FileText className="w-6 h-6 mr-2 text-imei-cyan" />
                    <label className="text-lg font-bold bg-gradient-to-r from-black to-imei-cyan bg-clip-text text-transparent">
                      {t('receipt_image')}
                    </label>
                  </div>

                  <div className="flex flex-col space-y-2">
                    {receiptImage ? (
                      <>
                        <button
                          type="button"
                          className="relative group overflow-hidden rounded-lg w-full cursor-pointer"
                          onClick={() => {
                            setSelectedImage(receiptImage);
                            setIsImageViewerOpen(true);
                          }}
                        >
                          <img
                            src={receiptImage}
                            alt={t('receipt_image')}
                            className="w-full h-40 object-cover rounded-lg border border-imei-cyan/30 group-hover:border-imei-cyan/50 transition-all duration-300"
                          />
                        </button>
                        <ImageViewer
                          imageUrl={selectedImage || ''}
                          isOpen={isImageViewerOpen}
                          onClose={() => setIsImageViewerOpen(false)}
                        />
                      </>
                    ) : (
                      <div className="h-40 border-2 border-dashed border-imei-cyan/20 rounded-lg flex flex-col items-center justify-center bg-gradient-to-b from-imei-dark/30 to-imei-darker/30 group hover:border-imei-cyan/40 transition-all duration-300">
                        <FileText className="w-16 h-16 text-imei-cyan/60 group-hover:text-imei-cyan/80 transition-colors duration-300" strokeWidth={1} />
                        <p className="text-center text-sm text-imei-cyan/60 mt-2">{t('no_receipt_preview')}</p>
                        <p className="text-xs mt-1 text-imei-cyan/40">{t('image_will_be_displayed_here')}</p>
                      </div>
                    )}

                    <div className="flex space-x-2 rtl:space-x-reverse">
                      <input type="file" id="receipt-upload" ref={receiptFileInputRef} accept="image/*" onChange={(e) => handleImageUpload(e, setReceiptImage)} className="hidden" />
                      <label htmlFor="receipt-upload" className="flex-1 bg-gradient-to-r from-blue-800 via-blue-700 to-blue-800 hover:from-blue-700 hover:via-blue-600 hover:to-blue-700 text-white py-2 px-2 rounded-lg text-center cursor-pointer transition-all duration-300 shadow hover:shadow-md flex items-center justify-center text-sm">
                        <Upload className="w-4 h-4 ml-1 rtl:mr-1" />
                        {t('upload')}
                      </label>
                      <Button type="button" onClick={handleReceiptCamera} className="flex-1 bg-gradient-to-r from-cyan-800 via-cyan-700 to-cyan-800 hover:from-cyan-700 hover:via-cyan-600 hover:to-cyan-700 text-white py-2 px-2 rounded-lg transition-all duration-300 shadow hover:shadow-md flex items-center justify-center text-sm">
                        <Camera className="w-4 h-4 ml-1 rtl:mr-1" />
                        {t('capture')}
                      </Button>

                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <div className="flex gap-4">
                  <Button
                    type="submit"
                    className="flex-1 bg-imei-cyan hover:bg-imei-cyan-dark text-white py-3 px-4 rounded-xl font-bold transition-all duration-300 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30"
                    disabled={isLoading || isPhoneReported === true || isFormLocked} // تعطيل إذا كان الهاتف مبلغ عنه - تم إلغاء شرط الدفع مؤقتاً
                  >
                    {isLoading ? t('processing') : t('transfer_ownership')}
                  </Button>
                </div>
              </div>
            </form>
          )}

          <Dialog open={showRegisterDialog} onOpenChange={setShowRegisterDialog}>
            <DialogContent className="bg-imei-darker text-white border-2 border-imei-cyan shadow-lg shadow-imei-cyan/20">
              <DialogHeader>
                <DialogTitle className="text-imei-cyan text-xl mb-4">
                  {t('unregistered_phone') || 'هاتف غير مسجل'}
                </DialogTitle>
                <DialogDescription className="text-white mb-6">
                  {t('unregistered_phone_prompt') || 'هذا الهاتف غير مسجل بالنظام. هل تريد التسجيل قبل نقل الملكية؟'}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:justify-start">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRegisterDialog(false);
                    setImei(''); // مسح حقل IMEI عند الضغط على "لا"
                  }}
                  className="text-white border-gray-600 hover:bg-gray-700"
                >
                  {t('no') || 'لا'}
                </Button>
                <Button
                  onClick={() => navigate('/register-phone', { state: { imei: imei, fromBusinessSale: true } })}
                  className="bg-imei-cyan hover:bg-imei-cyan-dark text-white"
                >
                  {t('yes') || 'نعم'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
            <DialogContent className="bg-white/90 backdrop-blur-lg text-gray-800 w-[90%] sm:max-w-md border-2 border-orange-400 shadow-2xl rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-gray-900 text-xl mb-2 text-center">
                  {t('transfer_ownership')}
                </DialogTitle>
                <DialogDescription className="text-gray-600 mb-6 text-center">
                  {t('transfer_ownership_desc')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-gray-800 text-sm font-medium mb-1">
                    {t('seller_current_password')}
                  </label>
                  <Input
                    type="password"
                    value={sellerPassword}
                    onChange={(e) => setSellerPassword(e.target.value)}
                    className="bg-white/95 border-2 border-orange-300 text-gray-800 placeholder-gray-500"
                    placeholder={t('enter_seller_password')}
                    disabled={isLoading}
                    required
                  />
                  {!sellerPassword && <p className="text-xs text-red-400 mt-1">{t('seller_password_required')}</p>}
                </div>
                <div className="space-y-2">
                  <label className="block text-gray-800 text-sm font-medium mb-1">
                    {t('buyer_new_password')}
                  </label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-white/95 border-2 border-orange-300 text-gray-800 placeholder-gray-500"
                    placeholder={t('password_min_6_chars')}
                    disabled={isLoading}
                    required
                  />
                  {!newPassword && <p className="text-xs text-red-400 mt-1">{t('buyer_password_required')}</p>}
                  {newPassword && newPassword.length < 6 && <p className="text-xs text-red-400 mt-1">{t('password_length_error')}</p>}
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowPasswordDialog(false)}
                  className="text-white border-gray-600 hover:bg-gray-700"
                  disabled={isLoading}
                >
                  {t('cancel')}
                </Button>
                <Button
                  onClick={handlePasswordSubmit}
                  className="bg-imei-cyan hover:bg-imei-cyan-dark text-white"
                  disabled={isLoading}
                >
                  {isLoading ? t('processing') : t('confirm')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* مكون عارض الصور */}
          <ImageViewer
            imageUrl={selectedImage || ''}
            isOpen={isImageViewerOpen}
            onClose={() => setIsImageViewerOpen(false)}
          />
        </div>
      </div>
    </PageContainer>
  );
};

export default BusinessTransfer;
