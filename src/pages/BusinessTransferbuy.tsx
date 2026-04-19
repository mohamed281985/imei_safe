import ImageViewer from '@/components/ImageViewer';
import Logo from '@/components/Logo';
import PageContainer from '@/components/PageContainer';
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, History, ArrowLeft, AlertCircle, CheckCircle, XCircle, Image as ImageIcon, ChevronDown, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { mockPhoneReports } from '../services/mockData';
import jsPDF from 'jspdf';
import { processArabicTextWithEncoding as processArabicText, loadArabicFontSafe as loadArabicFont } from '../utils/pdf/arabic-final-solution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '../contexts/AuthContext';
import ImageUploader from '@/components/ImageUploader';
import { Camera as CapacitorCamera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera';
import imageCompression from 'browser-image-compression';
import axiosInstance from '@/services/axiosInterceptor';
import { decryptPhoneNumber } from '../lib/imeiCrypto';

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

// دوال مساعدة لإخفاء البيانات الحساسة

// إخفاء الاسم: وضع النجوم أولاً والحرف الأول في النهاية
const maskName = (name: string): string => {
  if (!name) return '';

  // تقسيم الاسم إلى كلمات
  const words = name.trim().split(/\s+/);

  // معالجة كل كلمة - النجوم أولاً والحرف الأول في النهاية
  const maskedWords = words.map(word => {
    if (word.length <= 1) return word;
    // 6 نجوم متبوعة بالحرف الأول من الكلمة
    return '******' + word.charAt(0);
  });

  // إعادة تجميع الكلمات بالترتيب الأصلي
  return maskedWords.join(' ');
};

// إخفاء رقم الهاتف: إظهار آخر رقمين أولاً ثم النجوم
const maskPhone = (phone: string): string => {
  if (!phone) return '';

  // إزالة أي أحرف غير رقمية
  const cleanPhone = phone.replace(/\D/g, '');

  if (cleanPhone.length <= 2) return cleanPhone;

  // الحصول على آخر رقمين
  const lastTwoDigits = cleanPhone.slice(-2);

  // إظهار الرقمين أولاً ثم النجوم (بدون مسافات)
  return lastTwoDigits + '*'.repeat(Math.min(cleanPhone.length - 2, 8));
};

// إخفاء رقم البطاقة: إظهار آخر 4 أرقام أولاً ثم النجوم
const maskIdNumber = (idNumber: string): string => {
  if (!idNumber) return '';

  // إزالة أي أحرف غير رقمية
  const cleanId = idNumber.replace(/\D/g, '');

  if (cleanId.length <= 4) return cleanId;

  // الحصول على آخر 4 أرقام
  const lastFourDigits = cleanId.slice(-4);

  // إظهار الأرقام أولاً ثم النجوم (بدون مسافات)
  return lastFourDigits + '*'.repeat(Math.min(cleanId.length - 4, 6));
};

// دالة مساعدة لفك تشفير رقم الهاتف
const decryptPhoneIfEncrypted = (phone: any): string => {
  if (!phone) return '';
  try {
    // تحويل البيانات إلى نص إذا كانت كائناً للتعامل مع التشفير
    let phoneStr = typeof phone === 'object' ? JSON.stringify(phone) : String(phone);

    // تحقق مما إذا كان النص يبدو مشفراً (يحتوي على علامات التشفير المعروفة)
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

const BusinessTransferBuy: React.FC = () => {
  // دالة تلتقط صورة الفاتورة وتعمل على الهاتف (Capacitor) أو المتصفح
  const handleReceiptCamera = async () => {
    // تحقق من وجود منصة Capacitor
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
          try {
            const resp = await fetch(image.dataUrl);
            const blob = await resp.blob();
            const fileName = `receipt_capture_${Date.now()}.jpg`;
            const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
            // compress the captured file
            toast({ description: t('compressing_image') });
            const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, initialQuality: 0.8 } as any;
            const compressed = await imageCompression(file, options);
            setReceiptFile(compressed as File);
            setReceiptImage(URL.createObjectURL(compressed as File));
            toast({ title: t('success'), description: t('receipt_captured') || 'تم التقاط صورة الفاتورة بنجاح', variant: 'default' });
          } catch (err) {
            console.debug('Error processing captured image:', err);
            setReceiptImage(image.dataUrl);
            toast({ title: t('success'), description: t('receipt_captured') || 'تم التقاط صورة الفاتورة بنجاح', variant: 'default' });
          }
        }
      } catch (error) {
        toast({ title: t('error'), description: t('error_capturing_photo') || 'حدث خطأ أثناء التقاط الصورة', variant: 'destructive' });
      }
    } else {
      openCamera('receipt');
    }
  };
  const { t } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate(); // تم تعريف navigate هنا
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://imei-safe.me' : '/api');
  const videoRef = useRef<HTMLVideoElement>(null);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [currentSelfieType, setCurrentSelfieType] = useState<'seller' | 'buyer' | 'sellerId' | 'buyerId' | 'receipt' | null>(null);
  const { user } = useAuth(); // استخدام hook useAuth
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [debouncedImei, setDebouncedImei] = useState('');
  const [isImeiRegisteredToOtherUser, setIsImeiRegisteredToOtherUser] = useState(false);
  const [otherOwnerInfo, setOtherOwnerInfo] = useState<{ name?: string; phone?: string; idLast6?: string; phoneType?: string } | null>(null);

  const [imei, setImei] = useState('');
  const [imeiMessage, setImeiMessage] = useState<string>('');
  const [phoneType, setPhoneType] = useState('');
  const [phoneImage, setPhoneImage] = useState<string>('');
  const [sellerName, setSellerName] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [sellerIdLast6, setSellerIdLast6] = useState('');
  const [showUnmaskedSellerInfo, setShowUnmaskedSellerInfo] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerVerified, setBuyerVerified] = useState(false);
  const [paid, setPaid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isPhoneReported, setIsPhoneReported] = useState<boolean | null>(null);

  // الاسم المقنع للبائع للعرض (أو العرض غير المقنع إذا طُلب)
  const maskedSellerName = showUnmaskedSellerInfo ? sellerName : maskName(sellerName);
  // رقم الهاتف المقنع للبائع للعرض (أو العرض غير المقنع إذا طُلب)
  const maskedSellerPhone = showUnmaskedSellerInfo ? sellerPhone : maskPhone(sellerPhone);
  // رقم البطاقة المقنع للبائع للعرض (أو العرض غير المقنع إذا طُلب)
  const maskedSellerId = showUnmaskedSellerInfo ? sellerIdLast6 : maskIdNumber(sellerIdLast6);

  // Image states for the current transaction
  const [receiptImage, setReceiptImage] = useState<string>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [originalReceiptImage, setOriginalReceiptImage] = useState<string>('');

  // State for current registered phone fetched from server (used before password dialog)
  const [currentRegisteredPhone, setCurrentRegisteredPhone] = useState<any | null>(null);
  // Buyer identification helpers (optional inputs)
  const [buyerIdLast6, setBuyerIdLast6] = useState<string>('');
  const [buyerEmail, setBuyerEmail] = useState<string>('');

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

  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [sellerPassword, setSellerPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPhoneReport, setCurrentPhoneReport] = useState<any>(null); // لتخزين بلاغ الهاتف الحالي

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, setImage: (url: string) => void, type?: 'receipt') => {
    const file = e.target.files?.[0];
    if (file) {
      const maxSizeBytes = 10 * 1024 * 1024; // 10 MB allowed here before compression
      if (!file.type || !file.type.startsWith('image/')) {
        toast({ title: t('invalid_file_type') || 'نوع الملف غير مدعوم', description: t('please_upload_images_only') || 'يرجى رفع صور فقط (jpg, png, ...)', variant: 'destructive' });
        return;
      }
      if (file.size > maxSizeBytes) {
        // we'll still try to compress but warn user
        toast({ title: t('compressing_image'), description: t('compressing_image') });
      }

      try {
        toast({ description: t('compressing_image') });
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, initialQuality: 0.8 } as any;
        const compressedFile = await imageCompression(file, options);
        const previewUrl = URL.createObjectURL(compressedFile as File);
        setImage(previewUrl);
        if (type === 'receipt') setReceiptFile(compressedFile as File);
        toast({ title: t('success'), description: t('image_compressed_successfully') });
      } catch (error) {
        console.debug('Image compression error:', error);
        toast({ title: t('error'), description: t('image_compression_failed'), variant: 'destructive' });
        // fallback to raw preview
        const reader = new FileReader();
        reader.onloadend = () => setImage(reader.result as string);
        reader.readAsDataURL(file);
        if (type === 'receipt') setReceiptFile(file);
      }
    }
  };

  const openCamera = (type: 'seller' | 'buyer' | 'sellerId' | 'buyerId' | 'receipt') => {
    setCurrentSelfieType(type);
    setIsCameraOpen(true);

    // استخدام الكاميرا الخلفية لصورة الفاتورة والأمامية للسيلفي
    const facingMode = type === 'receipt' ? 'environment' : 'user';

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: facingMode,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // التشغيل التلقائي بمجرد جاهزية التدفق
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
          };
        }
      })
      .catch((err) => {
        console.debug("Camera error:", err);
        toast({
          title: t('camera_error') || 'خطأ في الكاميرا',
          description: t('camera_permission_required') || 'يرجى السماح باستخدام الكاميرا',
          variant: 'destructive'
        });
      });
  };

  const captureSelfie = () => {
    if (videoRef.current) {
      try {
        const canvas = document.createElement('canvas');
        // الحفاظ على نسبة العرض إلى الارتفاع للفيديو
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          // رسم الإطار الحالي على الكانفاس
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

          // تحويل الكانفاس إلى Blob ثم اضغطه إن كان الفاتورة
          canvas.toBlob(async (blob) => {
            if (!blob) return;
            try {
              const fileName = `capture_${Date.now()}.jpg`;
              const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
              if (currentSelfieType === 'receipt') {
                toast({ description: t('compressing_image') });
                const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, initialQuality: 0.8 } as any;
                const compressed = await imageCompression(file, options);
                setReceiptFile(compressed as File);
                setReceiptImage(URL.createObjectURL(compressed as File));
                toast({ title: t('success') || 'تم بنجاح', description: t('receipt_captured') || 'تم التقاط صورة الفاتورة بنجاح', variant: 'default' });
              }
            } catch (err) {
              console.debug('Error processing canvas blob:', err);
              if (currentSelfieType === 'receipt') {
                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                setReceiptImage(dataUrl);
                toast({ title: t('success') || 'تم بنجاح', description: t('receipt_captured') || 'تم التقاط صورة الفاتورة بنجاح', variant: 'default' });
              }
            }
          }, 'image/jpeg', 0.9);
          closeCamera();
        }
      } catch (error) {
        console.debug("Error capturing image:", error);
        toast({
          title: t('capture_error') || 'خطأ في التقاط الصورة',
          description: t('try_again') || 'يرجى المحاولة مرة أخرى',
          variant: 'destructive'
        });
      }
    }
  };

  const closeCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      // إيقاف جميع المسارات
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

  // تحديث حالة IMEI فقط عند الإدخال
  const handleImeiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    setImei(value);
    setImeiMessage('');
  };

  // تأثير لتأخير التحقق من IMEI (Debouncing)
  useEffect(() => {
    // مسح البيانات السابقة عند كل تغيير في IMEI
    setSellerName('');
    setSellerPhone('');
    setSellerIdLast6('');
    setPhoneType('');
    setPhoneImage('');
    setOriginalReceiptImage('');
    setIsPhoneReported(null);
    setShowRegisterDialog(false); // إخفاء الحوار عند الإدخال الجديد
    setShowUnmaskedSellerInfo(false);
    setIsImeiRegisteredToOtherUser(false);
    setOtherOwnerInfo(null);

    const handler = setTimeout(() => {
      if (imei.length === 15) {
        setDebouncedImei(imei);
      } else {
        setDebouncedImei(''); // مسح القيمة المؤجلة إذا لم يكن الطول 15
      }
    }, 800); // تأخير 800 مللي ثانية

    // دالة التنظيف لإلغاء المؤقت إذا قام المستخدم بالكتابة مرة أخرى
    return () => {
      clearTimeout(handler);
    };
  }, [imei]);

  // تأثير لجلب البيانات بناءً على IMEI المؤجل
  useEffect(() => {
    // لا تقم بأي شيء إذا كانت القيمة المؤجلة فارغة
    if (!debouncedImei) {
      setIsLoading(false); // تأكد من إيقاف التحميل
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. التحقق من وجود بلاغ فعال
        const { count: reportCount, error: reportError } = await supabase
          .from('phone_reports')
          .select('*', { count: 'exact', head: true })
          .eq('imei', debouncedImei)
          .eq('status', 'active');

        if (reportError) throw reportError;

        const isReported = (reportCount ?? 0) > 0;
        setIsPhoneReported(isReported);

        if (isReported) {
          toast({ title: t('warning'), description: t('phone_is_reported_as_lost'), variant: 'destructive' });
          return; // التوقف إذا كان هناك بلاغ
        }

        // 2. استعلام آمن من السيرفر للحصول على معلومات الهاتف
        // استخدم نفس endpoint مثل صفحة التسجيل لضمان نفس السلوك
        let jwtToken = '';
        try { const { data: { session } } = await supabase.auth.getSession(); jwtToken = session?.access_token || ''; } catch(e) { jwtToken = ''; }

        // تسجيل للمساعدة في التشخيص
        console.log('BusinessTransferBuy: checking IMEI', debouncedImei, 'hasJwt=', !!jwtToken);

        const checkResp = await axiosInstance.post('/api/check-imei',
          { imei: debouncedImei, userId: user?.id || null },
          {
            headers: jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {},
            validateStatus: () => true // Don't throw on any status
          }
        );

        if (checkResp.status !== 200) {
          // إذا أعاد السيرفر 404 فاعتبر الهاتف غير مسجل
          if (checkResp.status === 404) {
            setShowRegisterDialog(true);
            setIsLoading(false);
            return;
          }
          const errorMsg = checkResp.data?.error || checkResp.data?.message || `Server responded with ${checkResp.status}`;
          throw new Error(errorMsg);
        }

        const registeredPhone = checkResp.data;

        if (!registeredPhone) throw new Error('Failed to fetch phone info');

        // دعم أشكال استجابة متعددة من API
        // حالة 1: الاستجابة تحتوي على تفاصيل الهاتف داخل phoneDetails
        // مسح أي رسالة سابقة
        setImeiMessage('');

        // helper to pick first existing field from multiple possible keys
        const pick = (obj: any, keys: string[]) => {
          if (!obj) return '';
          for (const k of keys) {
            if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).toString().trim() !== '') return obj[k];
          }
          return '';
        };

        if (registeredPhone && registeredPhone.phoneDetails) {
          const details = registeredPhone.phoneDetails;
          // تحقق مما إذا كان الهاتف مسجل للمستخدم الحالي (عن طريق user id أو isOwnReport)
          const isOwnedByCurrentUser = (details.user_id && user && details.user_id === user.id) || registeredPhone.isOwnReport === true;
          if (isOwnedByCurrentUser) {
            setIsImeiRegisteredToOtherUser(false);
            setOtherOwnerInfo(null);
            // عرض رسالة تحت حقل IMEI بدلاً من فتح مربع التسجيل
            setImeiMessage(t('imei_belongs_to_current_user') || 'هذا الهاتف مسجل لنفس المستخدم');
            setIsLoading(false);
            return;
          }

          setIsImeiRegisteredToOtherUser(true);
          setOtherOwnerInfo({
            name: pick(details, ['owner_name', 'ownerName', 'maskedOwnerName', 'owner', 'name']),
            phone: pick(details, ['owner_phone', 'ownerPhone', 'maskedPhoneNumber', 'phone', 'owner_phone_number']),
            idLast6: pick(details, ['owner_id_last6', 'ownerIdLast6', 'maskedIdLast6', 'id_last6']),
            phoneType: pick(details, ['phone_type', 'phoneType', 'model'])
          });

          // تحقق مما إذا كان الهاتف مسجل باسم المتجر التجاري الحالي (مطابقة مقنّعة)
          if (user?.role === 'business' && details.maskedOwnerName === buyerName && details.maskedPhoneNumber === buyerPhone) {
            toast({
              title: t('alert_title'),
              description: t('phone_already_registered_to_you'),
              variant: 'destructive',
              className: 'bg-red-100 border-2 border-red-500 text-red-800 font-bold rtl'
            });
            // إعادة تعيين الحقول لعدم المتابعة
            setImei('');
            setSellerName('');
            setSellerPhone('');
            setSellerIdLast6('');
            setPhoneType('');
            setPhoneImage('');
            setOriginalReceiptImage('');
            setShowUnmaskedSellerInfo(false);
            setIsPhoneReported(null);
            setIsLoading(false);
            return;
          }

          // املأ الحقول: استخدم حقول المالك الحقيقية إن توفرت وإلا استخدم النسخ المقنعة
          setSellerName(pick(details, ['owner_name', 'ownerName', 'maskedOwnerName', 'owner', 'name']));
          setSellerPhone(decryptPhoneIfEncrypted(pick(details, ['owner_phone', 'ownerPhone', 'maskedPhoneNumber', 'phone', 'owner_phone_number'])));
          setSellerIdLast6(pick(details, ['owner_id_last6', 'ownerIdLast6', 'maskedIdLast6', 'id_last6']));
          setPhoneType(pick(details, ['phone_type', 'phoneType', 'model']));
          setPhoneImage(pick(details, ['phone_image_url', 'phoneImageUrl', 'phone_image']));
          setOriginalReceiptImage(pick(details, ['receipt_image_url', 'receiptImageUrl']));
          // عرض القيم غير المقنعة للمستخدم لأن الهاتف مسجل لحساب آخر (إظهار حقيقي إن وُجد)
          setShowUnmaskedSellerInfo(Boolean(pick(details, ['owner_name', 'owner_phone', 'owner_id_last6', 'maskedOwnerName', 'maskedPhoneNumber', 'maskedIdLast6'])));

        // حالة 2: يوجد سجل (exists === true) لكن تفاصيل الهاتف غير موجودة
        } else if (registeredPhone && registeredPhone.exists && !registeredPhone.phoneDetails) {
          // إذا كان هناك بلاغ نشط، أعلِم المستخدم وملأ بعض الحالات إن أمكن
          if (registeredPhone.hasActiveReport) {
            setIsPhoneReported(true);
            // خزّن بيانات البلاغ إن توفرت
            setCurrentPhoneReport(registeredPhone.report || { isStolen: registeredPhone.isStolen, isOwnReport: registeredPhone.isOwnReport });
            toast({ title: t('warning'), description: t('phone_has_active_report') || 'يوجد بلاغ نشط على هذا الهاتف', variant: 'destructive' });
            // لا نعرض مربع التسجيل لأن السجل موجود لكن بدون تفاصيل؛ اسمح للمستخدم بالتحقق أو التواصل
          } else if (registeredPhone.isOtherUser || registeredPhone.owner_name || registeredPhone.maskedOwnerName) {
            setIsImeiRegisteredToOtherUser(true);
            setOtherOwnerInfo({
              name: pick(registeredPhone, ['owner_name', 'ownerName', 'maskedOwnerName', 'owner', 'name']),
              phone: pick(registeredPhone, ['owner_phone', 'ownerPhone', 'maskedPhoneNumber', 'phone', 'owner_phone_number']),
              idLast6: pick(registeredPhone, ['owner_id_last6', 'ownerIdLast6', 'maskedIdLast6', 'id_last6']),
              phoneType: pick(registeredPhone, ['phone_type', 'phoneType', 'model'])
            });
            // السجل موجود لحساب آخر ولكن بدون phoneDetails التفصيلية - املأ الحقول المتاحة
            setSellerName(pick(registeredPhone, ['owner_name', 'ownerName', 'maskedOwnerName', 'owner', 'name']));
            setSellerPhone(decryptPhoneIfEncrypted(pick(registeredPhone, ['owner_phone', 'ownerPhone', 'maskedPhoneNumber', 'phone', 'owner_phone_number'])));
            setSellerIdLast6(pick(registeredPhone, ['owner_id_last6', 'ownerIdLast6', 'maskedIdLast6', 'id_last6']));
            setPhoneType(pick(registeredPhone, ['phone_type', 'phoneType', 'model']));
            setPhoneImage(pick(registeredPhone, ['phone_image_url', 'phoneImageUrl', 'phone_image']));
            setOriginalReceiptImage(pick(registeredPhone, ['receipt_image_url', 'receiptImageUrl']));
            // عرض القيم غير المقنعة (أو الحقيقية إن وفرت)
            setShowUnmaskedSellerInfo(Boolean(pick(registeredPhone, ['owner_name', 'owner_phone', 'owner_id_last6', 'maskedOwnerName', 'maskedPhoneNumber', 'maskedIdLast6'])));
            // تخزين المرجع للسجل المسترجع إن لزم لاحقاً
            setCurrentRegisteredPhone(registeredPhone);
          } else {
            // السجل موجود لكن بدون تفاصيل أو بلاغات => اعرض نافذة التعديل/التسجيل لتحديث البيانات
            setShowRegisterDialog(true);
          }

        // حالة 3: غير موجود
        } else {
          setIsImeiRegisteredToOtherUser(false);
          setOtherOwnerInfo(null);
          setShowRegisterDialog(true);
        }
      } catch (error) {
        console.debug("Error fetching data for IMEI:", error);
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
      if (!imei || !buyerName || !buyerPhone || !sellerName) { // التأكد من وجود اسم البائع أيضاً
        toast({ title: 'خطأ', description: 'يرجى ملء جميع الحقول المطلوبة', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      // منع نقل الملكية إذا كان الهاتف مسجلاً لنفس المستخدم الحالي
      if (imeiMessage) {
        toast({ title: t('alert_title'), description: t('imei_belongs_to_current_user') || 'هذا الهاتف مسجل لديك بالفعل ولا يمكنك نقل الملكية', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      // Ask server for masked info instead of direct DB read
      let jwtTokenForSubmit = '';
      try { const { data: { session } } = await supabase.auth.getSession(); jwtTokenForSubmit = session?.access_token || ''; } catch(e) { jwtTokenForSubmit = ''; }

      console.log('BusinessTransferBuy: handleSubmit checking IMEI', imei, 'jwt=', !!jwtTokenForSubmit);
      const resp = await axiosInstance.post('/api/check-imei',
        { imei: imei, userId: user?.id || null },
        {
          headers: jwtTokenForSubmit ? { 'Authorization': `Bearer ${jwtTokenForSubmit}` } : {},
          validateStatus: () => true
        }
      );

      if (resp.status !== 200) {
        if (resp.status === 404) {
          toast({ title: 'خطأ', description: 'الهاتف غير مسجل.', variant: 'destructive' });
        } else {
          const errMsg = resp.data?.error || resp.data?.message || `خطأ من السيرفر: ${resp.status}`;
          toast({ title: 'خطأ', description: errMsg, variant: 'destructive' });
        }
        setIsLoading(false);
        return;
      }

      const phone = resp.data;

      // إذا كان الهاتف مسجلاً لنفس المستخدم، امنع المتابعة
      if (phone && phone.phoneDetails) {
        const pd = phone.phoneDetails;
        const isOwnedByCurrentUser = (pd.user_id && user && pd.user_id === user.id) || phone.isOwnReport === true;
        if (isOwnedByCurrentUser) {
          toast({ title: t('alert_title'), description: t('imei_belongs_to_current_user') || 'هذا الهاتف مسجل لديك بالفعل ولا يمكنك نقل الملكية', variant: 'destructive' });
          setIsLoading(false);
          return;
        }
      }

      if (phone && phone.exists && !phone.phoneDetails && phone.isOwnReport) {
        toast({ title: t('alert_title'), description: t('imei_belongs_to_current_user') || 'هذا الهاتف مسجل لديك بالفعل ولا يمكنك نقل الملكية', variant: 'destructive' });
        setIsLoading(false);
        return;
      }
      const isRegistered = (phone?.isRegistered ?? phone?.exists ?? !!phone?.phoneDetails) === true;
      if (!isRegistered) {
        toast({ title: 'خطأ', description: 'لم يتم العثور على الهاتف في قاعدة البيانات للتسجيل الأولي', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      // Show password dialog to continue; sensitive verification and transfer happen server-side
      setCurrentRegisteredPhone(phone);
      setShowPasswordDialog(true);
      setIsLoading(false);
      return;

      // تم نقل الكود التالي إلى دالة handlePasswordSubmit
    } catch (error) {
      console.debug("Error during ownership transfer:", error);
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء معالجة الطلب', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // تعديل دالة handlePasswordSubmit لتتضمن منطق نقل الملكية
  const handlePasswordSubmit = async () => { // This function now handles the entire transfer confirmation logic
    setIsLoading(true);
    try {
      // 1. التحقق من صحة المدخلات في مربع الحوار
      if (!sellerPassword) {
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
      if (newPassword.length < 6) {
        toast({
          title: 'كلمة المرور قصيرة',
          description: 'يجب أن تتكون كلمة المرور الجديدة من 6 أحرف على الأقل',
          variant: 'destructive',
          className: 'bg-red-50 text-red-800 font-bold rtl border-2 border-red-500'
        });
        setIsLoading(false);
        return;
      }

      // 2. رفع صورة الفاتورة الجديدة (إذا وجدت) - يجب أن يتم هذا قبل استدعاء الدالة
      let newReceiptImagePath: string | null = null;
      if (receiptFile) {
        const ext = (receiptFile.type && receiptFile.type.split('/')[1]) ? receiptFile.type.split('/')[1].split('+')[0] : 'jpg';
        const fileName = `receipt_${imei}_${Date.now()}.${ext}`;
        const filePath = `receipts/${fileName}`;
        const { error: uploadError } = await supabase.storage.from('transfer-assets').upload(filePath, receiptFile as File, { upsert: true, contentType: receiptFile.type });
        if (uploadError) throw uploadError;
        // تخزين المسار فقط (path)، بدون URL كامل
        newReceiptImagePath = filePath;
      } else if (receiptImage) {
        // fallback for legacy dataUrl usage
        try {
          const response = await fetch(receiptImage);
          const blob = await response.blob();
          const fileName = `receipt_${imei}_${Date.now()}.jpg`;
          const imageFile = new File([blob], fileName, { type: blob.type });
          const filePath = `receipts/${fileName}`;
          const { error: uploadError } = await supabase.storage.from('transfer-assets').upload(filePath, imageFile, { upsert: true });
          if (uploadError) throw uploadError;
          // تخزين المسار فقط (path)، بدون URL كامل
          newReceiptImagePath = filePath;
        } catch (err) {
          console.debug('Failed to upload fallback receipt image:', err);
        }
      }

      // 3. استدعاء دالة قاعدة البيانات (RPC) لتنفيذ النقل بشكل آمن
      // لاحقًا سيتم استخدام رقم بطاقة المالك السابق القادم من السيرفر إن توفّر
      const sellerIdValue = sellerIdLast6?.trim() || 'غير متوفر';

      // تعريف دالة لتحديث رقم بطاقة البائع يدوياً
      const updateSellerIdManually = async (imeiValue: string, sellerIdValue: string) => {
        try {
          // تأخير بسيط للتأكد من إنشاء سجل النقل
          await new Promise(resolve => setTimeout(resolve, 1500));

          // البحث عن آخر سجل نقل تم إنشاؤه لهذا الـ IMEI
          const { data: latestTransfer, error: fetchError } = await supabase
            .from('transfer_records')
            .select('id, created_at, imei')
            .eq('imei', imeiValue)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (!fetchError && latestTransfer) {
            console.log('تم العثور على سجل النقل:', latestTransfer);

            // تحديث السجل بإضافة رقم بطاقة البائع
            const { data: updateData, error: updateError } = await supabase
              .from('transfer_records')
              .update({ seller_id_last6: sellerIdValue })
              .eq('id', latestTransfer.id)
              .select();

            if (updateError) {
              console.debug('خطأ في تحديث رقم بطاقة البائع يدوياً:', updateError);
              return false;
            } else {
              console.log('✅ تم تحديث رقم بطاقة البائع يدوياً بنجاح:', updateData);
              return true;
            }
          } else {
            console.debug('لم يتم العثور على سجل النقل للتحديث اليدوي:', fetchError);
            return false;
          }
        } catch (error) {
          console.debug('خطأ أثناء محاولة التحديث اليدوي:', error);
          return false;
        }
      };

      // المتغيرات لتخزين حالة الخطأ ومعرّف سجل النقل
      let rpcError: any = null;
      let createdTransferRecordId: number | null = null;
      let previousOwnerIdLast6FromServer: string | null = null;

      try {
        // اطلب من السيرفر تنفيذ نقل الملكية (التشفير، التحقق، والتحديث)
        let jwtToken = '';
        try { const { data: { session } } = await supabase.auth.getSession(); jwtToken = session?.access_token || ''; } catch(e) { jwtToken = ''; }

        const transferPayload: any = {
          imei,
          sellerPassword,
            newOwner: {
            owner_name: buyerName,
            phone_number: buyerPhone,
            id_last6: buyerIdLast6 || null,
            // Prefer authenticated user's email when available, otherwise use entered buyerEmail
            email: (user && user.email) ? user.email : (buyerEmail || null),
            phone_type: phoneType || null,
            password: newPassword,
            user_id: user?.id || null
          },
          new_receipt_image_url: newReceiptImagePath || null
        };

        const resp = await axiosInstance.post('/api/transfer-ownership',
          transferPayload,
          {
            headers: jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {},
            validateStatus: () => true
          }
        );
        const json = resp.data;
        if (resp.status !== 200) {
          const serverMessage = (json && (json.message || json.error || json.details)) || `Transfer failed (${resp.status})`;
          rpcError = { message: serverMessage };
        } else {
          rpcError = null;
          previousOwnerIdLast6FromServer = (json && json.previousOwnerIdLast6) ? String(json.previousOwnerIdLast6) : null;
          // server returns the created transfer record id directly
          createdTransferRecordId = (json && (json.transferRecordId || json.transfer_record_id)) || null;
        }
      } catch (error) {
        console.debug('خطأ غير متوقع أثناء محاولة نقل الملكية:', error);
        rpcError = error;
      }


      if (rpcError) {
        // التعامل مع الأخطاء المحددة من الدالة
        if (
          rpcError.message.includes('Invalid seller password') ||
          rpcError.message.includes('Incorrect seller password')
        ) {
          toast({
            title: 'كلمة المرور خاطئة',
            description: t('seller_password_incorrect') || 'كلمة مرور البائع الحالية غير صحيحة.',
            variant: 'destructive',
            className: 'bg-red-50 text-red-800 font-bold rtl border-2 border-red-500'
          });
        } else if (rpcError.message.includes('Phone with IMEI')) {
          toast({
            title: 'بيانات غير موجودة',
            description: 'لم يتم العثور على الهاتف في قاعدة البيانات.',
            variant: 'destructive',
            className: 'bg-red-50 text-red-800 font-bold rtl border-2 border-red-500'
          });
        } else {
          // للأخطاء الأخرى
          toast({
            title: 'خطأ غير متوقع',
            description: 'حدث خطأ أثناء محاولة نقل الملكية، يرجى المحاولة مرة أخرى.',
            variant: 'destructive',
            className: 'bg-red-50 text-red-800 font-bold rtl border-2 border-red-500'
          });
          console.debug(rpcError);
        }
        return; // إيقاف التنفيذ إذا كان هناك خطأ تم التعامل معه
      }

      // 4) عرض رسالة النجاح وإعادة التوجيه
      toast({
        title: 'تمت العملية بنجاح',
        description: 'تم تحديث كلمة المرور ونقل ملكية الهاتف بنجاح.',
        className: "bg-gradient-to-r from-green-500 to-green-600 text-white font-bold rtl"
      });

      setSuccess(true);
      setShowPasswordDialog(false);
      setTimeout(() => navigate('/dashboard'), 2000); // الانتقال إلى لوحة التحكم أو صفحة مناسبة
    } catch (error: any) {
      console.debug("Error during ownership transfer:", error);
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

  // يجب استدعاء setCurrentPhoneReport عند الحاجة، مثلاً عند اختيار بلاغ معين للتعامل معه
  // هذا الجزء من الكود غير مكتمل في الملف الأصلي لكيفية تعيين currentPhone

  useEffect(() => {
    let logoutTimer: NodeJS.Timeout;

    const resetTimer = () => {
      if (logoutTimer) clearTimeout(logoutTimer);
      logoutTimer = setTimeout(() => {
        navigate('/login'); // Redirect to login page instead of logout (to avoid 404)
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
      // Only populate buyer fields when the current session user is verified
      if (!buyerVerified) return;

      setIsLoading(true);
      try {
        let jwtToken = '';
        try { const { data: { session } } = await supabase.auth.getSession(); jwtToken = session?.access_token || ''; } catch(e) { jwtToken = ''; }

        const resp = await axiosInstance.get('/api/my-buyer-info',
          {
            headers: jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {},
            validateStatus: () => true
          }
        );
        const json = resp.data;
        if (resp.status !== 200) {
          throw new Error((json && json.error) || `Failed to fetch buyer info (${resp.status})`);
        }

        const data = json?.data || null;
        if (data) {
          // Additional safety: ensure the session/user is actually the owner/account before showing buyer data.
          // The API should ideally return an owner identifier (owner_id, user_id, ownerUserId, etc.).
          const ownerIdCandidates = [
            data?.owner_id,
            data?.user_id,
            data?.ownerId,
            data?.ownerUserId,
            data?.userId,
            json?.ownerId,
            json?.userId
          ].filter(Boolean).map(String);

          const isOwner = Boolean(user && ownerIdCandidates.length && ownerIdCandidates.some(id => id === String(user.id)));

          if (!isOwner) {
            // If we cannot confirm ownership, do not populate sensitive buyer fields.
            console.debug('fetchBusinessData: current session user is not the owner — not exposing buyer data');
            setBuyerName('');
            setBuyerPhone('');
            setBuyerEmail('');
            setBuyerVerified(false);
            return;
          }

          // Use masked fields only after ownership confirmed
          setBuyerName(data.name || '');
          setBuyerPhone(data.phone || '');
          // Do not store or expose raw email; keep masked email if needed
          setBuyerEmail(data.email || '');
        }
      } catch (error) {
        console.debug('Error fetching buyer info from server:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBusinessData();
  }, [user, t, toast, buyerVerified]);

  // Verify the active Supabase session user matches the `useAuth` user before showing buyer data
  useEffect(() => {
    const verifyUser = async () => {
      try {
        const { data: { user: sessionUser } } = await supabase.auth.getUser();
        setBuyerVerified(!!(user && sessionUser && user.id === sessionUser.id));
      } catch (e) {
        setBuyerVerified(false);
      }
    };
    verifyUser();
  }, [user]);

  // Fallback: if buyer fields are empty, populate from authenticated `user` metadata
  useEffect(() => {
    if (!user) return;
    try {
      const meta = (user as any).user_metadata || {};
      if (!buyerName || String(buyerName).trim() === '') {
        const fallbackName = meta.name || meta.full_name || user.email || '';
        if (fallbackName) setBuyerName(fallbackName);
      }
      if (!buyerPhone || String(buyerPhone).trim() === '') {
        const rawPhone = meta.phone || meta.phone_number || (user as any).phone || '';
        if (rawPhone) {
          const decrypted = decryptPhoneIfEncrypted(rawPhone);
          setBuyerPhone(decrypted.replace(/\D/g, ''));
        }
      }
      if (!buyerEmail || String(buyerEmail).trim() === '') {
        const fallbackEmail = meta.email || user.email || '';
        if (fallbackEmail) setBuyerEmail(fallbackEmail);
      }
    } catch (err) {
      console.debug('buyer fallback populate error:', err);
    }
  }, [user]);

  return (
    <PageContainer >
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
                      className="input-field w-full font-mono pr-10 bg-white text-gray-800"
                      dir="ltr"
                      maxLength={15}
                      placeholder="123456789012345"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  {isPhoneReported && imei.length === 15 && (
                    <div className="mt-2 text-red-500 text-sm">
                      {t('phone_reported')}
                    </div>
                  )}
                  {imeiMessage && imei.length === 15 && (
                    <div className="mt-2 text-yellow-400 text-sm font-semibold">
                      {imeiMessage}
                    </div>
                  )}
                  {isImeiRegisteredToOtherUser && imei.length === 15 && (
                    <Alert className="mt-3 border-2 border-orange-400 bg-orange-50 text-orange-900">
                      <AlertDescription className="text-sm">
                        <div className="font-bold mb-2">هذا الـ IMEI مسجل لمستخدم آخر</div>
                        <div className="space-y-1">
                          <div>الاسم: {otherOwnerInfo?.name || 'غير متوفر'}</div>
                          <div>الهاتف: {otherOwnerInfo?.phone || 'غير متوفر'}</div>
                          <div>رقم الهوية (آخر أرقام): {otherOwnerInfo?.idLast6 || 'غير متوفر'}</div>
                          <div>نوع الهاتف: {otherOwnerInfo?.phoneType || 'غير متوفر'}</div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                <div>
                  <label className="block text-black mb-1">{t('phone_type')}</label>
                  <input
                    type="text"
                    value={phoneType}
                    onChange={e => setPhoneType(e.target.value)}
                    className="input-field w-full bg-white text-gray-800"
                    required
                    disabled={!!phoneType || isLoading} // يبقى معطلاً إذا تم ملؤه تلقائياً
                    dir="ltr"
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
                    <div className="flex gap-2">
                        <input
                          type="text"
                          value={maskedSellerName}
                          className="input-field w-full bg-imei-darker border-imei-cyan/30 text-white"
                          readOnly
                          dir="ltr"
                        />
                      <input
                        type="hidden"
                        value={sellerName}
                        name="original_seller_name"
                      />
                    </div>
                    <p className="text-xs text-imei-cyan mt-1">{t('name_hidden_for_privacy')}</p>
                  </div>
                  <div>
                    <label className="block text-black mb-1">{t('seller_id_number')}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={maskedSellerId}
                        className="input-field w-full bg-imei-darker border-imei-cyan/30 text-white"
                        readOnly
                        dir="ltr"
                      />
                      <input
                        type="hidden"
                        value={sellerIdLast6}
                        name="original_seller_id"
                      />
                    </div>
                    <p className="text-xs text-imei-cyan mt-1">{t('last_4_digits_shown_only')}</p>
                  </div>
                  <div>
                    <label className="block text-black mb-1">{t('seller_phone')}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={maskedSellerPhone}
                        className="input-field w-full bg-imei-darker border-imei-cyan/30 text-white"
                        readOnly
                        dir="ltr"
                        inputMode="tel"
                      />
                      <input
                        type="hidden"
                        value={sellerPhone}
                        name="original_seller_phone"
                      />
                    </div>
                    <p className="text-xs text-imei-cyan mt-1">{t('last_2_digits_shown_only')}</p>
                  </div>
                  {phoneImage && (
                    <div className="space-y-2">
                      <label className="block text-black mb-1">{t('phone_image')}</label>
                      <img
                        src={phoneImage}
                        alt={t('phone_image')}
                        className="w-full h-48 object-contain rounded-lg shadow-lg bg-imei-dark p-2 border border-imei-cyan/30"
                      />
                    </div>
                  )}
                  {originalReceiptImage && (
                    <div className="space-y-2">
                      <label className="block text-black mb-1">{t('receipt_image')}</label>
                      <img
                        src={originalReceiptImage}
                        alt={t('receipt_image')}
                        className="w-full h-48 object-contain rounded-lg shadow-lg bg-imei-dark p-2 border border-imei-cyan/30"
                      />
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
                      disabled={isLoading || user?.role === 'business'}
                    />
                  </div>
                  <div>
                    <label className="block text-black mb-1">{t('buyer_phone')}</label>
                    <input
                      type="text"
                      value={buyerPhone}
                      onChange={e => setBuyerPhone(e.target.value.replace(/\D/g, ''))}
                      className="input-field w-full"
                      maxLength={15}
                      required
                      disabled={isLoading || user?.role === 'business' }
                    />
                  </div>
                  <div>
                    <label className="block text-black mb-1">{t('buyer_email') || 'إيميل المشتري'}</label>
                    <input
                      type="email"
                      value={buyerEmail}
                      onChange={e => setBuyerEmail(e.target.value)}
                      className="input-field w-full"
                      required
                      disabled={isLoading || user?.role === 'business'}
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
                      disabled={isLoading || user?.role === 'business'}
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
                    <label className="text-lg font-bold bg-gradient-to-r from-white to-imei-cyan bg-clip-text text-transparent">
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
                      </>
                    ) : (
                      <div className="h-40 border-2 border-dashed border-imei-cyan/20 rounded-lg flex flex-col items-center justify-center bg-gradient-to-b from-imei-dark/30 to-imei-darker/30 group hover:border-imei-cyan/40 transition-all duration-300">
                        <FileText className="w-16 h-16 text-imei-cyan/60 group-hover:text-imei-cyan/80 transition-colors duration-300" strokeWidth={1} />
                        <p className="text-center text-sm text-imei-cyan/60 mt-2">{t('no_receipt_preview')}</p>
                        <p className="text-xs mt-1 text-imei-cyan/40">{t('image_will_be_displayed_here')}</p>
                      </div>
                    )}

                    <div className="flex space-x-2 rtl:space-x-reverse">
                      <input type="file" id="receipt-upload" ref={receiptFileInputRef} accept="image/png,image/jpeg,image/webp" onChange={(e) => handleImageUpload(e, setReceiptImage, 'receipt')} className="hidden" />
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
                    disabled={isLoading || isPhoneReported === true || !!imeiMessage}
                  >
                    {isLoading ? t('processing') : t('transfer_ownership')}
                  </Button>
                </div>
              </div>
            </form>
          )}

          <Dialog open={showRegisterDialog} onOpenChange={setShowRegisterDialog}>
            <DialogContent className="bg-imei-darker text-white border-2 border-imei-cyan shadow-lg shadow-imei-cyan/20 sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-imei-cyan text-xl mb-4">
                  {t('unregistered_phone')}
                </DialogTitle>
                <DialogDescription className="text-white mb-6">
                  {t('unregistered_phone_prompt')}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:justify-start">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRegisterDialog(false);
                    setImei('');
                  }}
                  className="text-white border-gray-600 hover:bg-gray-700"
                >
                  {t('no')}
                </Button>
                <Button
                  onClick={() => {
                    navigate('/register-phone', {
                      state: {
                        fromPurchase: true,
                        imei: imei,
                        editMode: true,
                        initialData: {
                          ownerName: sellerName || undefined,
                          phoneNumber: sellerPhone || undefined,
                          phoneType: phoneType || undefined
                        }
                      }
                    });
                  }}
                  className="bg-imei-cyan hover:bg-imei-cyan-dark text-white"
                >
                  {t('yes')}
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
        </div>
      </div>
      
      <ImageViewer
        imageUrl={selectedImage || ''}
        isOpen={isImageViewerOpen}
        onClose={() => setIsImageViewerOpen(false)}
      />
    </PageContainer>
  );
};

export default BusinessTransferBuy;
