// ...existing code...

import React, { useState, useEffect, useCallback, useRef } from 'react';
// متغير مرجعي للاحتفاظ بنتيجة الاستعلام الأخيرة
const resultRef = { current: null };
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import imageCompression from 'browser-image-compression';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import BackButton from '../components/BackButton';
import { Camera, FileText, CreditCard, User, Upload, AlertTriangle, CheckCircle } from 'lucide-react'; // إضافة AlertTriangle
import { useToast } from '@/hooks/use-toast';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Button } from "@/components/ui/button";
import ImageViewer from '@/components/ImageViewer';
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import PageAdvertisement from '@/components/advertisements/PageAdvertisement';
import { useScrollToTop } from '../hooks/useScrollToTop';
import { supabase } from '@/lib/supabase'; // استيراد Supabase

import { useAuth } from '../contexts/AuthContext';
import CountryCodeSelector from '../components/CountryCodeSelector';
import axiosInstance from '@/services/axiosInterceptor';

// تعريف واجهة البيانات للنموذجا
interface FormData {
  ownerName: string;
  phoneNumber: string;
  imei: string;
  phone_type: string; // نوع الهاتف
  lossLocation: string;
  lossTime: string;
  receiptImage: string | File | null;
  reportImage: string | File | null;
  password: string;
  confirmPassword: string;
  idLast6: string;
}

type ImageType = 'receiptImage' | 'reportImage'; // تم التغيير من phoneImage


// دوال مساعدة لتنسيق عرض البيانات
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

  // إعادة تجميع الكلمات بالترتيب الأصلي مع فاصل واحد بين الأسماء
  return maskedWords.join(' ');  // مسافة واحدة بين كل اسم
};

const maskPhoneNumber = (phone: string): string => {
  if (!phone) return '';

  // إزالة أي أحرف غير رقمية
  const cleanPhone = phone.replace(/\D/g, '');

  if (cleanPhone.length <= 2) return cleanPhone;

  // الحصول على آخر رقمين
  const lastTwoDigits = cleanPhone.slice(-2);

  // إظهار الرقمين أولاً ثم النجوم (بدون مسافات)
  return lastTwoDigits + '*'.repeat(Math.min(cleanPhone.length - 2, 8));
};

const maskIdNumber = (id: string): string => {
  if (!id) return '';

  // إزالة أي أحرف غير رقمية
  const cleanId = id.replace(/\D/g, '');

  if (cleanId.length <= 4) return cleanId;

  // الحصول على آخر 4 أرقام
  const lastFourDigits = cleanId.slice(-4);

  // إظهار الأرقام أولاً ثم النجوم (بدون مسافات) - مثل صفحة الشراء
  return lastFourDigits + '*'.repeat(Math.min(cleanId.length - 4, 6));
};

const maskEmail = (email: string | null): string => {
  if (!email) return '';
  const parts = email.split('@');
  if (parts.length !== 2) return '***'; // صيغة بريد إلكتروني غير صالحة

  const [localPart, domain] = parts;

  if (localPart.length <= 3) {
    return `${localPart.charAt(0)}**@${domain}`;
  }
  return `${localPart.substring(0, 3)}***@${domain}`;
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

const ReportPhone: React.FC = () => {
  useScrollToTop();
  // حالة لتخزين القيم الأصلية
  const [originalData, setOriginalData] = useState({
    ownerName: '',
    phoneNumber: '',
    idLast6: ''
  });
  
  // تخزين الروابط المؤقتة للصور لتنظيفها عند إلغاء المكون
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  
  // دالة لتنظيف الروابط المؤقتة
  const cleanupImageUrls = useCallback(() => {
    imageUrls.forEach(url => URL.revokeObjectURL(url));
    setImageUrls([]);
  }, []);
  
  // تنظيف الروابط عند إلغاء المكون
  useEffect(() => {
    return cleanupImageUrls;
  }, []);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth(); // جلب المستخدم الحالي

  const [countryCode, setCountryCode] = useState('+20'); // Default to Egypt for the country code
  const [formData, setFormData] = useState<FormData>({
    ownerName: '',
    phoneNumber: '',
    imei: '',
    phone_type: '',
    lossLocation: '',
    lossTime: '',
    receiptImage: null,
    reportImage: null,
    password: '',
    confirmPassword: '',
    idLast6: '',
  });

  // حالة المعاينة للصور (Data URL أو مسار ملف)
  const [reportImagePreview, setReportImagePreview] = useState<string | null>(null);
  const [receiptImagePreview, setReceiptImagePreview] = useState<string | null>(null); // تم التغيير من phoneImagePreview

  // حالة لتتبع ما إذا كان النموذج للقراءة فقط بشكل كامل
  const [isReadOnly, setIsReadOnly] = useState(false);
  // حالة لتتبع الحقول التي يجب أن تكون للقراءة فقط بشكل انتقائي
  const [fieldReadOnlyState, setFieldReadOnlyState] = useState({
    ownerName: false,
    phoneNumber: false,
    lossLocation: false,
    lossTime: false,
    receiptImage: false, // تم التغيير من phoneImage
    reportImage: false,
  });

  // حالة التحميل والإرسال
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // حالة لتتبع ما إذا كان IMEI مسجلاً مسبقاً
  const [isImeiRegistered, setIsImeiRegistered] = useState(false);

  const [dbPassword, setDbPassword] = useState<string | null>(null); // لتخزين كلمة المرور من قاعدة البيانات للتحقق
  const [registeredPhoneEmail, setRegisteredPhoneEmail] = useState<string | null>(null); // لتخزين إيميل الهاتف المسجل
  // حالة نافذة كلمة المرور المنبثقة
  const [modalPassword, setModalPassword] = useState('');
  const [modalConfirmPassword, setModalConfirmPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isImeiValid, setIsImeiValid] = useState(false);

  // حالة الإعلان المتحرك
  const [currentAdIndex, setCurrentAdIndex] = useState(0);

  const [isImageViewerOpen, setImageViewerOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // حالة لعرض الصورة الكاملة
  const [showFullImage, setShowFullImage] = useState(false);
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);

  // حالة لعرض رسالة تحذير إذا كان هناك بلاغ فعال موجود
  const [activeReportWarning, setActiveReportWarning] = useState<string | null>(null);

  // Refs لعناصر إدخال الملفات
  const reportImageInputRef = React.useRef<HTMLInputElement>(null);
  const receiptImageInputRef = React.useRef<HTMLInputElement>(null); // تم التغيير من phoneImageInputRef

  // دالة موحدة للتحقق من صحة الحقول
  const validateForm = (data: FormData, isImeiRegisteredStatus: boolean, actualDbPassword: string | null, currentFieldReadOnlyState: typeof fieldReadOnlyState): boolean => {
    // التحقق من الحقول المطلوبة
    if (!data.ownerName || !data.phoneNumber || !data.imei || !data.phone_type || !data.lossLocation || !data.lossTime || !data.idLast6) {
      toast({ title: t('error'), description: t('please_fill_all_fields'), variant: 'destructive' });
      return false;
    }
    // تحقق من صحة آخر 6 أرقام
    // إذا كان الهاتف مسجل مسبقاً، نتخطى التحقق لأن البيانات موجودة في originalData
    if (!isImeiRegisteredStatus && data.idLast6 !== 'مسجل بالنظام') {
      if (!data.idLast6 || data.idLast6.length !== 6 || !/^\d{6}$/.test(data.idLast6)) {
        toast({ title: t('error'), description: t('id_last6_invalid'), variant: 'destructive' });
        return false;
      }
    }

    // التحقق من كلمة المرور للهواتف المسجلة
    if (isImeiRegisteredStatus) {
      // إذا كان IMEI مسجلاً، يجب إدخال كلمة المرور في الحقل الرئيسي للتحقق
      if (!data.password) {
        toast({ title: t('error'), description: t('please_enter_password_to_confirm'), variant: 'destructive' });
        return false;
      }
    }
    // التحقق من الصور المطلوبة
    // صورة الفاتورة مطلوبة فقط إذا كان الحقل قابلاً للتعديل ولم تكن بيانات النظام
    if (!currentFieldReadOnlyState.receiptImage) {
      // إذا لم تكن بيانات النظام، يجب رفع صورة
      if (!data.receiptImage && data.ownerName !== 'مسجل بالنظام') {
        toast({ title: t('error'), description: t('receipt_image_required'), variant: 'destructive' });
        return false;
      }
      // إذا كانت بيانات النظام، يجب التأكد من وجود رابط صورة الفاتورة في بيانات التسجيل
      if (
        data.ownerName === 'مسجل بالنظام' && (
          !resultRef.current ||
          !resultRef.current.receipt_image_url ||
          typeof resultRef.current.receipt_image_url !== 'string' ||
          resultRef.current.receipt_image_url.trim() === '' ||
          (!resultRef.current.receipt_image_url.startsWith('http') && !resultRef.current.receipt_image_url.startsWith('https'))
        )
      ) {
        toast({ title: t('error'), description: t('receipt_image_required'), variant: 'destructive' });
        return false;
      }
    }
    // صورة المحضر مطلوبة إذا كان الحقل قابلاً للتعديل
    if (!currentFieldReadOnlyState.reportImage && !data.reportImage) {
      toast({ title: t('error'), description: t('report_image_required'), variant: 'destructive' }); // قد تحتاج لإضافة مفتاح الترجمة هذا
      return false;
    }

    return true;
  };


  const handleForgotPassword = async () => {
    if (!isImeiRegistered) {
      toast({ title: t('error'), description: t('enter_imei_first'), variant: 'destructive' });
      return;
    }
    if (!user) {
      toast({ title: t('error'), description: t('must_be_logged_in'), variant: 'destructive' });
      return;
    }

    if (registeredPhoneEmail === user.email) {
      navigate('/reset-register', { state: { imei: formData.imei } });
    } else {
      toast({
        title: t('access_denied'),
        description: `${t('this_phone_not_registered_to_this_account')} ${maskEmail(registeredPhoneEmail)}`,
        variant: 'destructive',
      });
    }
  };


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    let updatedValue = value;
    if (name === 'phoneNumber' || name === 'idLast6') {
      updatedValue = value.replace(/\D/g, '');
    }
    // منع الصفر الأول في رقم الهاتف عند اختيار مصر
    if (name === 'phoneNumber' && updatedValue.startsWith('0')) {
      updatedValue = updatedValue.replace(/^0+/, '');
    }
    setFormData(prev => ({
      ...prev,
      [name]: updatedValue
    }));
  };

  const updateImage = useCallback(async (file: File, fileType: ImageType, setPreview: React.Dispatch<React.SetStateAction<string | null>>) => {
    // Show preview immediately
    const imageUrl = URL.createObjectURL(file);
    setPreview(imageUrl);
    // تخزين الرابط المؤقت لتنظيفه لاحقاً
    setImageUrls(prev => [...prev, imageUrl]);

    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: 'image/webp',
    };

    try {
      toast({ description: t('compressing_image') });
      const compressedFile = await imageCompression(file, options);

      setFormData(prev => ({ ...prev, [fileType]: compressedFile }));
      toast({ title: t('success'), description: t('image_compressed_successfully') });
    } catch (error) {
      toast({ title: t('error'), description: t('image_compression_failed'), variant: 'destructive' });
      setFormData(prev => ({ ...prev, [fileType]: file })); // Fallback to original file
    }
  }, [t, toast, imageUrls]);

  // دالة لالتقاط الصورة باستخدام الكاميرا
  const startCamera = useCallback(async (fileType: ImageType, setPreview: React.Dispatch<React.SetStateAction<string | null>>) => {
    if (fieldReadOnlyState[fileType] || isReadOnly) return;

    try {
      const photo = await CapacitorCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        saveToGallery: false,
      });

      if (photo.webPath) {
        const response = await fetch(photo.webPath);
        const blob = await response.blob();
        const fileName = `captured_${fileType}_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
        await updateImage(file, fileType, setPreview);
      } else {
        setFormData(prev => ({ ...prev, [fileType]: null }));
        setPreview(null);
      }
    } catch (error) {
      toast({ title: t('error'), description: t('failed_to_take_photo'), variant: 'destructive' });
    }
  }, [fieldReadOnlyState, isReadOnly, toast, t, updateImage, imageUrls]);

  // دالة لاختيار صورة من المعرض/الملفات
  const handleImageFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>, fileType: ImageType, setPreview: React.Dispatch<React.SetStateAction<string | null>>) => {
    if (fieldReadOnlyState[fileType] || isReadOnly) return;

    const file = event.target.files?.[0];
    if (file) {
      // التحقق من نوع الملف (MIME Type)
      if (!file.type.startsWith('image/')) {
        toast({ title: t('error'), description: 'نوع الملف غير صالح. يرجى رفع صورة.', variant: 'destructive' });
        return;
      }

      // التحقق من التوقيع السحري (Magic Bytes)
      const isValidImage = await validateImageFile(file);
      if (!isValidImage) {
        toast({ title: t('error'), description: 'الملف المختار ليس صورة صالحة.', variant: 'destructive' });
        return;
      }

      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({ title: t('error'), description: t('file_too_large_10mb'), variant: 'destructive' });
        return;
      }
      await updateImage(file, fileType, setPreview);
    } else {
      setFormData(prev => ({ ...prev, [fileType]: null }));
      setPreview(null);
    }
  }, [fieldReadOnlyState, isReadOnly, toast, t, updateImage]);

  // دالة مساعدة لعرض حقول تحميل الصور
  const renderImageUpload = (
    label: string,
    fileType: ImageType,
    preview: string | null,
    setPreview: React.Dispatch<React.SetStateAction<string | null>>,
    Icon: React.ElementType,
    UploadIcon: React.ElementType,
    config: { showCaptureButton: boolean; showUploadButton: boolean },
    inputRef: React.RefObject<HTMLInputElement> // إضافة Ref كمعامل
  ) => {
    // منطق واضح: حقل صورة الفاتورة قابل للرفع دائماً بغض النظر عن حالة القراءة فقط
    let isFieldReadOnly = fieldReadOnlyState[fileType] || isReadOnly;
    if (fileType === 'receiptImage') {
      // إذا كانت بيانات المستخدم مسجل بالنظام، اجعل صورة الفاتورة للقراءة فقط
      isFieldReadOnly = (
        formData.ownerName === 'مسجل بالنظام' ||
        formData.phone_type === 'مسجل بالنظام' ||
        formData.phoneNumber === 'مسجل بالنظام' ||
        formData.idLast6 === 'مسجل بالنظام'
      );
    }

    return (
      <div key={fileType} className="mb-4 bg-gradient-to-r from-blue-100 to-cyan-100 p-4 rounded-xl border-2 border-imei-cyan hover:border-imei-cyan transition-all duration-300 shadow-lg hover:shadow-xl w-full">
        <div className="flex items-center mb-2">
          <Icon className="w-6 h-6 mr-2 text-imei-cyan" />
          <label className="text-lg font-bold bg-gradient-to-r from-blue-900 to-cyan-700 bg-clip-text text-transparent">
            {label}
          </label>
        </div>

        <div className="flex flex-col space-y-2">
          {preview ? (
            <div className="relative group overflow-hidden rounded-lg">
              <img
                src={preview}
                alt={`${label} Preview`}
                className="w-full h-64 object-contain rounded-lg border border-imei-cyan/30 filter blur-[0.3px] opacity-95"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/10 backdrop-blur-sm p-4">
                <p className="text-black text-center text-sm font-bold">
                  {t('privacy_notice_search')}
                </p>
              </div>
            </div>
          ) : (
            <div className="h-64 border-2 border-dashed border-imei-cyan/20 rounded-lg flex flex-col items-center justify-center bg-gradient-to-b from-imei-dark/30 to-imei-darker/30 group hover:border-imei-cyan/40 transition-all duration-300">
              <Icon className="w-16 h-16 text-imei-cyan/60 group-hover:text-imei-cyan/80 transition-colors duration-300" strokeWidth={1} />
              <p className="text-center text-sm text-gray-800 mt-2">{t(`no_${fileType.replace('_image', '')}_preview`)}</p>
              <p className="text-xs mt-1 text-gray-600">{t('image_will_be_displayed_here')}</p>
            </div>
          )}

          {!isFieldReadOnly && (
            <div className="flex space-x-2 rtl:space-x-reverse">
              {config.showUploadButton && (
                <>
                  <input type="file" ref={inputRef} accept="image/*" onChange={(e) => handleImageFileChange(e, fileType, setPreview)} className="hidden" disabled={isLoading || isSubmitting} />
                  <label htmlFor={inputRef.current?.id} onClick={() => inputRef.current?.click()} className="flex-1 bg-gradient-to-r from-blue-800 via-blue-700 to-blue-800 hover:from-blue-700 hover:via-blue-600 hover:to-blue-700 text-white py-2 px-2 rounded-lg text-center cursor-pointer transition-all duration-300 shadow hover:shadow-md flex items-center justify-center text-sm">
                    <UploadIcon className="w-4 h-4 ml-1 rtl:mr-1" />
                    {t('upload')}
                  </label>
                </>
              )}
              {config.showCaptureButton && (
                <Button type="button" onClick={() => startCamera(fileType, setPreview)} disabled={isLoading || isSubmitting} className="flex-1 bg-gradient-to-r from-cyan-800 via-cyan-700 to-cyan-800 hover:from-cyan-700 hover:via-cyan-600 hover:to-cyan-700 text-white py-2 px-2 rounded-lg transition-all duration-300 shadow hover:shadow-md flex items-center justify-center text-sm">
                  <Camera className="w-4 h-4 ml-1 rtl:mr-1" />
                  {t('capture')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };


  // تأثير لتحميل البيانات عند تغيير IMEI
  // تعديل دالة التحقق من IMEI
  const initialFormDataRef = React.useRef({
    ownerName: '',
    phoneNumber: '',
    imei: '',
    lossLocation: '',
    lossTime: '',
    receiptImage: null,
    reportImage: null,
    password: '',
    confirmPassword: ''
  });


  useEffect(() => {
    const imeiValue = formData.imei.trim();

    const resetFormForNewReport = () => {
      setReceiptImagePreview(null);
      setReportImagePreview(null);
      setFieldReadOnlyState({
        ownerName: false,
        phoneNumber: false,
        lossLocation: false,
        lossTime: false,
        receiptImage: false, // اجعل صورة الفاتورة قابلة للرفع عند IMEI جديد أو عليه بلاغ
        reportImage: false,
      });
      setIsImeiRegistered(false);
      setDbPassword(null);
      setRegisteredPhoneEmail(null);
      setFormData(prev => ({
        ...initialFormDataRef.current,
        imei: prev.imei,
        phone_type: '',
        password: '',
        confirmPassword: '',
        idLast6: '',
        ownerName: '',
        phoneNumber: '',
        lossLocation: '',
        lossTime: '',
        receiptImage: null,
        reportImage: null,
      }));
      setIsReadOnly(false);
      setActiveReportWarning(null);
      setIsImeiValid(false);
    };

    const fetchMaskedImeiInfo = async () => {
      if (imeiValue.length !== 15) {
        resetFormForNewReport();
        return;
      }
      setIsLoading(true);
      try {
        let jwtToken = '';
        try {
          const sessionResp = await supabase.auth.getSession();
          jwtToken = (sessionResp?.data as any)?.session?.access_token || '';
        } catch (e) {
          jwtToken = '';
        }
        const resp = await axiosInstance.post('/api/imei-masked-info', { imei: imeiValue, userId: user?.id });
        const result = resp?.data;
        resultRef.current = result;

        // Try to get explicit report flags from the server if available
        let checkResult: any = null;
        try {
          const resp2 = await axiosInstance.post('/api/check-imei', { imei: imeiValue, userId: user?.id });
          if (resp2 && resp2.data) checkResult = resp2.data;
        } catch (e) {
          // endpoint may not exist or be unreachable; ignore
        }

        // If checkResult provides active-report flags, prefer them for UI decisions
        if (checkResult) {
          // normalize flags onto result for downstream logic
          result.hasActiveReport = result.hasActiveReport ?? (checkResult.hasActiveReport ?? checkResult.active ?? false);
          const inferredIsOwnReport = typeof (checkResult?.isOwnReport) === 'boolean'
            ? checkResult.isOwnReport
            : ((checkResult?.reporter_user_id === user?.id) || (checkResult?.userId === user?.id));
          result.isOwnReport = result.isOwnReport ?? inferredIsOwnReport;
          result.reporter_user_id = result.reporter_user_id ?? (checkResult.reporter_user_id ?? checkResult.userId ?? checkResult.reporterId);
        }

        // حالة 1: هاتف جديد (غير مسجل)
        if (!result.found) {
          resetFormForNewReport();
          setIsImeiRegistered(false);
          setIsImeiValid(true);
          return;
        }

        // حالة 2: الهاتف مسجل للمالك الحالي
        // Consider server `isOwner`, but also treat transferred phones as owned by current session
        // if the masked owner name/phone matches the current user's metadata (fallback when API
        // doesn't mark `isOwner` correctly after a transfer).
        const serverIsOwner = Boolean(result.isOwner === true);
        let inferredIsOwner = serverIsOwner;
        try {
          if (!inferredIsOwner && result.isTransferred && user) {
            const userMeta: any = (user as any).user_metadata || {};
            const currentMaskedName = maskName(userMeta.name || user.email || '');
            const currentMaskedPhone = maskPhoneNumber(userMeta.phone || (user as any).phone || '');
            if ((result.maskedOwnerName && String(result.maskedOwnerName).trim() === currentMaskedName)
              || (result.maskedPhoneNumber && String(result.maskedPhoneNumber).trim() === currentMaskedPhone)) {
              inferredIsOwner = true;
            }
          }
        } catch (e) {
          console.debug('Error inferring owner from masked values:', e);
        }

        // New case: active report exists and belongs to current user
        if (result.found && (
          result.isOwnReport === true ||
          result.hasActiveReport === true ||
          result.reporter_user_id === user?.id ||
          result.user_id === user?.id ||
          result.reporterId === user?.id
        )) {
          setIsReadOnly(true);
          setFieldReadOnlyState({
            ownerName: true, phoneNumber: true, lossLocation: true, lossTime: true,
            receiptImage: true, reportImage: true,
          });
          setActiveReportWarning('هذا الهاتف تم الإبلاغ عنه بالفعل من حسابك ولا يمكنك الإبلاغ مرة أخرى.');
          setIsImeiValid(false);
          toast({ title: t('info'), description: 'هذا الهاتف تم الإبلاغ عنه بالفعل من حسابك ولا يمكنك الإبلاغ مرة أخرى.' });
          return;
        }

        if (result.found && result.isRegistered && inferredIsOwner) {
          setFormData(prev => ({
            ...prev,
            ownerName: 'مسجل بالنظام',
            phoneNumber: 'مسجل بالنظام',
            phone_type: 'مسجل بالنظام',
            idLast6: 'مسجل بالنظام',
            lossLocation: '',
            lossTime: '',
            receiptImage: null,
            reportImage: null,
            password: '',
            confirmPassword: '',
          }));
          setReceiptImagePreview(null);
          setReportImagePreview(null);
          setFieldReadOnlyState({
            ownerName: true,
            phoneNumber: true,
            lossLocation: false,
            lossTime: false,
            receiptImage: true,
            reportImage: false,
          });
          setIsImeiRegistered(false);
          setIsReadOnly(false);
          setActiveReportWarning(null);
          setIsImeiValid(true);
          return;
        }

        // حالة 3: الهاتف مسجل لغير المالك
        if (result.found && result.isRegistered && !inferredIsOwner) {
          setFormData(prev => ({
            ...initialFormDataRef.current,
            imei: prev.imei,
            ownerName: '',
            phoneNumber: '',
            phone_type: '',
            idLast6: '',
            password: '',
            confirmPassword: '',
            lossLocation: '',
            lossTime: '',
            receiptImage: null,
            reportImage: null,
          }));
          setReceiptImagePreview(null);
          setReportImagePreview(null);
          setRegisteredPhoneEmail(null);
          setOriginalData({ ownerName: '', phoneNumber: '', idLast6: '' });
          setFieldReadOnlyState({
            ownerName: true,
            phoneNumber: true,
            lossLocation: true,
            lossTime: true,
            receiptImage: true,
            reportImage: true,
          });
          setIsImeiRegistered(true);
          setIsImeiValid(false);
          setIsReadOnly(true);
          setActiveReportWarning('هذا الهاتف مسجل لحساب آخر ولا يمكنك الإبلاغ عنه من هذا الحساب.');
          toast({
            title: t('access_denied'),
            description: 'هذا الهاتف مسجل لحساب آخر ولا يمكنك الإبلاغ عنه من هذا الحساب.',
            variant: 'destructive',
          });
          return;
        }

        // حالة بلاغ فعال فقط (غير مسجل)
        if (result.found && !result.isRegistered) {
          setIsReadOnly(true);
          setFieldReadOnlyState({
            ownerName: true, phoneNumber: true, lossLocation: true, lossTime: true,
            receiptImage: true, reportImage: true,
          });
          setActiveReportWarning(t('imei_already_reported_as_lost_detail'));
          setIsImeiValid(false);
          toast({ title: t('error'), description: t('imei_already_reported_as_lost'), variant: 'destructive' });
          return;
        }
      } catch (error) {
        toast({ title: t('error'), description: t('error_fetching_data'), variant: 'destructive' });
        setIsImeiValid(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMaskedImeiInfo();
  }, [formData.imei, t, toast, user]);

  // تعديل دالة معالجة الإرسال
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // التحقق من صحة النموذج مع تمرير حالة القراءة فقط للحقول
    if (!validateForm(formData, isImeiRegistered, dbPassword, fieldReadOnlyState)) {
      return;
    }

    // إذا كان الهاتف مسجلاً لحساب آخر، لا تسمح بتقديم البلاغ
    if (isImeiRegistered) {
      toast({
        title: t('access_denied'),
        description: t('this_phone_registered_to_another_account'),
        variant: 'destructive',
      });
      return;
    }

    // إذا كان IMEI غير مسجل، اعرض نافذة كلمة المرور المنبثقة
    setShowPasswordModal(true);
  };

  // دالة معالجة إرسال النافذة المنبثقة لكلمة المرور
  const handleModalSubmit = async () => {
    // التحقق من تطابق كلمات المرور في النافذة المنبثقة
    if (!modalPassword || !modalConfirmPassword || modalPassword !== modalConfirmPassword) {
      toast({ title: t('error'), description: t('passwords_do_not_match'), variant: 'destructive' });
      return;
    }

    // استدعاء دالة حفظ البلاغ مع كلمة المرور من النافذة المنبثقة
    await saveReport(modalPassword);

    // إغلاق النافذة المنبثقة (سيتم إغلاقها أيضاً في saveReport عند النجاح، ولكن هذا يضمن الإغلاق حتى لو لم يتم الانتقال للصفحة)
    setShowPasswordModal(false);
  };


  // دالة لحفظ البلاغ عبر API السيرفر
  const saveReport = async (password: string) => {
    setIsSubmitting(true);
    try {
      // تجهيز الصور Base64 إذا كانت من نوع File
      const getBase64 = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // دالة رفع صورة إلى Supabase Storage
      const uploadToSupabase = async (file: File | Blob, type: 'receipt' | 'report') => {
        // تحديد الامتداد بناءً على نوع الملف أو إجباره على webp
        let fileExt = 'jpg';
        if (file.type === 'image/webp') {
          fileExt = 'webp';
        } else if (file.type === 'image/png') {
          fileExt = 'png';
        } else if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
          fileExt = 'jpg';
        } else if (file.type) {
          // fallback لأي نوع صورة آخر
          fileExt = file.type.split('/').pop() || 'jpg';
        }
        // إذا كان الملف مضغوط (عادةً من imageCompression)، اجبر الامتداد على webp
        if (file instanceof File && file.name && file.name.endsWith('.webp')) {
          fileExt = 'webp';
        }
        const fileName = `${formData.imei}_${type}_${Date.now()}.${fileExt}`;
        const filePath = `reports/${fileName}`;
        const { data, error } = await supabase.storage.from('phoneimages').upload(filePath, file, { upsert: true });
        if (error) {
          console.error('❌ خطأ supabase عند رفع الصورة:', error);
          throw new Error(t('failed_to_upload_image'));
        }
        // حاول تحويل المسار إلى رابط عام مناسب لـ Supabase
        try {
          const { data: publicUrlData } = supabase.storage.from('phoneimages').getPublicUrl(filePath);
          if (publicUrlData && publicUrlData.publicUrl) {
            return publicUrlData.publicUrl;
          }
        } catch (e) {
          console.warn('Could not derive public URL for uploaded file, returning path as fallback', e);
        }
        // افتح العودة للمسار إذا فشل توليد رابط عام
        return filePath;
      };

      let receiptImageToSend: string | null = null;
      if (formData.ownerName === 'مسجل بالنظام') {
        // إذا كان الهاتف مسجل بالنظام، جلب صورة الفاتورة من نتيجة الاستعلام أو من جدول registered_phones
        let url = resultRef.current && resultRef.current.receipt_image_url;
        if (!url) {
          try {
            // طلب للسيرفر للحصول على بيانات الصورة (السيرفر يتكفل بفك التشفير والتأكد من الملكية)
            let jwtToken = '';
            try { const sessionResp = await supabase.auth.getSession(); jwtToken = (sessionResp?.data as any)?.session?.access_token || ''; } catch(e) { jwtToken = ''; }

            try {
              const resp = await axiosInstance.post('/api/imei-masked-info', { imei: formData.imei });
              const json = resp?.data;
              if (json && json.receipt_image_url) {
                url = json.receipt_image_url;
              }
            } catch (e) {
              console.error('فشل جلب receipt_image_url عبر /api/imei-masked-info:');
            }
            // result logged removed to avoid leaking data
          } catch (e) {
            console.error('فشل جلب receipt_image_url عبر /api/imei-masked-info:');
          }
        }
        // إذا لم يكن الرابط عامًا، حوله إلى رابط عام
        if (typeof url === 'string' && (!url.startsWith('https://') || !url.includes('/storage/v1/object/public/'))) {
          let path = url;
          const idx = url.indexOf('/object/public/');
          if (idx !== -1) {
            path = url.substring(idx + '/object/public/'.length);
          }
          const { data: publicUrlData } = supabase.storage.from('phoneimages').getPublicUrl(path);
          url = publicUrlData?.publicUrl || url;
        }
        receiptImageToSend = url;
      } else if (formData.receiptImage && ((typeof File !== 'undefined' && formData.receiptImage instanceof File) || (typeof Blob !== 'undefined' && formData.receiptImage instanceof Blob))) {
        receiptImageToSend = await uploadToSupabase(formData.receiptImage, 'receipt');
      } else if (typeof formData.receiptImage === 'string') {
        receiptImageToSend = formData.receiptImage;
      }

      let reportImageToSend: string | null = null;
      try {
        if (formData.reportImage && ((typeof File !== 'undefined' && formData.reportImage instanceof File) || (typeof Blob !== 'undefined' && formData.reportImage instanceof Blob))) {
          reportImageToSend = await uploadToSupabase(formData.reportImage, 'report');
        } else if (typeof formData.reportImage === 'string') {
          reportImageToSend = formData.reportImage;
        }
      } catch (err) {
        console.error('فشل رفع صورة المحضر:');
        toast({ title: t('error'), description: t('failed_to_upload_image'), variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }

      // لا ترسل blob: أو base64 كرابط نهائي
      if (reportImageToSend && (reportImageToSend.startsWith('blob:') || reportImageToSend.startsWith('data:'))) {
        toast({ title: t('error'), description: t('failed_to_upload_image'), variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }
      // إذا بقيت الصورة فارغة، أظهر رسالة خطأ واضحة
      if (!reportImageToSend) {
        toast({ title: t('error'), description: t('report_image_required'), variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }

      // لا نعتمد على localStorage لتوكن FCM.
      // يتم تحديث fcm_token عبر registerFCMToken في قاعدة البيانات من جهة العميل،
      // والسيرفر يستخدم القيمة المخزنة للمستخدم/البلاغ.
      let fcmToken = '';

      // تشفير كلمة المرور قبل الإرسال
      // تجهيز البيانات للإرسال
      // Avoid logging large data URLs or sensitive image contents
      const payload = {
        ownerName: isImeiRegistered ? originalData.ownerName : formData.ownerName,
        phoneNumber: isImeiRegistered ? originalData.phoneNumber : `${countryCode}${formData.phoneNumber}`,
        imei: formData.imei,
        phone_type: formData.phone_type,
        loss_location: formData.lossLocation,
        loss_time: formData.lossTime,
        receipt_image_url: receiptImageToSend,
        report_image_url: reportImageToSend,
        password: password, // أرسل كلمة المرور نصية خام
        id_last6: isImeiRegistered ? originalData.idLast6 : formData.idLast6,
        user_id: user?.id || null,
        email: user?.email || '',
        fcm_token: fcmToken,
      };

      // جلب التوكن من localStorage (Supabase)
      let jwtToken = '';
      try {
        const sessionResp = await supabase.auth.getSession();
        jwtToken = (sessionResp?.data as any)?.session?.access_token || '';
      } catch (e) {
        jwtToken = '';
      }

      // إرسال الطلب إلى السيرفر مع التوكن
      const resp = await axiosInstance.post('/api/report-lost-phone', payload);
      const result = resp?.data;
      if (!result.success) {
        throw new Error(result.error || 'فشل إرسال البلاغ');
      }

      toast({ title: t('success'), description: t('report_submitted_successfully') });
      setIsReadOnly(true);
      setFieldReadOnlyState({
        ownerName: true, phoneNumber: true, lossLocation: true, lossTime: true,
        receiptImage: true, reportImage: true
      });
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (error: any) {
      // مسح حقول كلمة المرور في حالة الخطأ لتسهيل إعادة المحاولة
      if (error.message && (error.message.includes('كلمة المرور') || error.message.toLowerCase().includes('password'))) {
        setFormData(prev => ({ ...prev, password: '' }));
        setModalPassword('');
        setModalConfirmPassword('');
      }

      toast({ title: t('error'), description: error.message || t('failed_to_submit_report'), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
      setShowPasswordModal(false);
    }
  };


  return (
    <PageContainer>
      <div className="pb-3">
        <AppNavbar />
        <PageAdvertisement pageName="reportphone" />
        
        <div className="flex items-center mb-6 pt-3" style={{ background: 'linear-gradient(to top, #053060 0%, #0a4d8c 100%)', padding: '0.3rem', borderRadius: '1rem', marginTop: '1rem' }}>
          <BackButton className="mr-4" />
          <h1
            className="flex-1 text-center text-2xl font-bold"
            style={{ color: '#ffffff' }}
          >
            {t('report_lost_phone')}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-4 pb-10 pt-0">
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="imei" className="block text-gray-800 font-medium mb-1">
                {t('imei_number')}
              </label>
              <div className="relative">
                <Input
                  type="text"
                  id="imei"
                  name="imei"
                  value={formData.imei}
                  onChange={handleChange}
                  placeholder={t('enter_imei')}
                  disabled={isReadOnly || isLoading || isSubmitting}
                  className={`input-field w-full bg-[#c0dee5] text-gray-800 ${isImeiValid ? '!pl-12 border-green-500' : ''}`}
                  maxLength={15}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  required
                />
                {isImeiValid && (
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600">{t('imei_hint')}</p>

              <label htmlFor="phone_type" className="block text-gray-800 font-medium mb-1 mt-2">
                {t('phone_type')}
              </label>
              <Input
                type="text"
                id="phone_type"
                name="phone_type"
                value={formData.phone_type}
                onChange={handleChange}
                placeholder={formData.phone_type === 'مسجل بالنظام' ? 'مسجل بالنظام' : t('phone_type_placeholder')}
                disabled={isReadOnly || isLoading || isSubmitting || formData.phone_type === 'مسجل بالنظام'}
                className="input-field w-full bg-[#c0dee5] text-gray-800"
                required
              />
            </div>

            {/* إظهار تحذير فقط إذا لم يكن الهاتف مسجل لحساب آخر */}
            {activeReportWarning && activeReportWarning !== 'هذا الهاتف مسجل لحساب آخر ولا يمكنك الإبلاغ عنه من هذا الحساب.' && (
              <div
                className="my-4 p-4 rounded-lg text-center flex flex-col items-center space-y-3 shadow-lg border"
                style={{
                  background:
                    'linear-gradient(90deg, #fff0f0 0%, #ffeaea 100%)',
                  borderColor: '#ff4d4f',
                }}
              >
                <AlertTriangle className="w-12 h-12 text-red-500" />
                <p className="text-red-700 font-semibold text-lg">
                  {t('imei_already_reported_as_lost_detail') || activeReportWarning}
                </p>
              </div>
            )}
            {/* رسالة خاصة للهاتف المسجل لحساب آخر */}
            {activeReportWarning === 'هذا الهاتف مسجل لحساب آخر ولا يمكنك الإبلاغ عنه من هذا الحساب.' && (
              <div
                className="my-4 p-4 rounded-lg text-center flex flex-col items-center space-y-3 shadow-lg border"
                style={{
                  background:
                    'linear-gradient(90deg, #f0f7ff 0%, #eaf4ff 100%)',
                  borderColor: '#2196f3',
                }}
              >
                <AlertTriangle className="w-12 h-12 text-blue-500" />
                <p className="text-blue-700 font-semibold text-lg">
                  هذا الهاتف مسجل لحساب آخر ولا يمكنك الإبلاغ عنه من هذا الحساب.
                </p>
              </div>
            )}

            {/* Own-account info box removed per request */}

            <div className="space-y-2">
              <label htmlFor="ownerName" className="block text-gray-800 font-medium mb-1">
                {t('owner_name')}
              </label>
              <Input
                type="text"
                id="ownerName"
                name="ownerName"
                value={formData.ownerName}
                onChange={handleChange}
                placeholder={
                  formData.ownerName && /^[*]+$/.test(formData.ownerName)
                    ? 'مسجل بالنظام'
                    : t('owner_name')
                }
                disabled={isReadOnly || fieldReadOnlyState.ownerName || isLoading || isSubmitting || formData.ownerName === 'مسجل بالنظام'}
                className={`input-field w-full bg-[#c0dee5] text-gray-800 ${/^[*]+$/.test(formData.ownerName) || formData.ownerName.length < 2 ? 'text-gray-400 italic' : ''}`}
                style={(() => {
                  if (/^[*]+$/.test(formData.ownerName) || formData.ownerName.length < 2) {
                    return { letterSpacing: '0.2em' };
                  }
                  return /[a-zA-Z0-9]/.test(formData.ownerName) ? { direction: 'ltr', textAlign: 'left' } : { direction: 'rtl', textAlign: 'right' };
                })()}
              />
              
              <div>
                <label htmlFor="idLast6" className="block text-gray-800 font-medium mb-1">
                  {t('id_last_6_digits')}
                </label>
                <Input
                  type="text"
                  id="idLast6"
                  name="idLast6"
                  value={formData.idLast6}
                  onChange={handleChange}
                  className={`input-field w-full bg-[#c0dee5] text-gray-800 ${/^[*]+$/.test(formData.idLast6) || formData.idLast6.length < 2 ? 'text-gray-400 italic' : ''}`}
                  style={(() => {
                    if (/^[*]+$/.test(formData.idLast6) || formData.idLast6.length < 2) {
                      return { letterSpacing: '0.2em' };
                    }
                    return /[a-zA-Z0-9]/.test(formData.idLast6) ? { direction: 'ltr', textAlign: 'left' } : { direction: 'rtl', textAlign: 'right' };
                  })()}
                  maxLength={6}
                  pattern="[0-9]{6}"
                  inputMode="numeric"
                  required
                  placeholder={
                    formData.idLast6 && /^[*]+$/.test(formData.idLast6)
                      ? 'مسجل بالنظام'
                      : t('id_last_6_digits_placeholder')
                  }
                  disabled={isImeiRegistered || isReadOnly || isLoading || isSubmitting || formData.idLast6 === 'مسجل بالنظام'}
                />
              </div>
            </div>

            <div>
              <label htmlFor="phoneNumber" className="block text-gray-800 font-medium mb-1">
                {t('phone_number')}
              </label>
              <div className="flex gap-2 items-center">
                <CountryCodeSelector
                  value={countryCode}
                  onChange={setCountryCode}
                  disabled={fieldReadOnlyState.phoneNumber || isReadOnly || isLoading || isSubmitting || formData.phoneNumber === 'مسجل بالنظام'}
                />
                <Input
                  id="phoneNumber"
                  name="phoneNumber"
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  disabled={fieldReadOnlyState.phoneNumber || isReadOnly || isLoading || isSubmitting}
                  className={`input-field w-full bg-[#c0dee5] text-gray-800 ${/^[*]+$/.test(formData.phoneNumber) || formData.phoneNumber.length < 2 ? 'text-gray-400 italic' : ''}`}
                  style={(() => {
                    if (/^[*]+$/.test(formData.phoneNumber) || formData.phoneNumber.length < 2) {
                      return { letterSpacing: '0.2em' };
                    }
                    return /[a-zA-Z0-9]/.test(formData.phoneNumber) ? { direction: 'ltr', textAlign: 'left' } : { direction: 'rtl', textAlign: 'right' };
                  })()}
                  placeholder={
                    formData.phoneNumber && /^[*]+$/.test(formData.phoneNumber)
                      ? 'مسجل بالنظام'
                      : t('phone_placeholder')
                  }
                />
              </div>
            </div>

            <div>
              <label htmlFor="lossLocation" className="block text-gray-800 font-medium mb-1">
                {t('loss_location')}
              </label>
              <Input
                id="lossLocation"
                name="lossLocation"
                type="text"
                value={formData.lossLocation}
                onChange={handleChange}
                disabled={fieldReadOnlyState.lossLocation || isReadOnly || isLoading || isSubmitting}
                className="input-field w-full bg-[#c0dee5] text-gray-800"
              />
            </div>

            <div>
              <label htmlFor="lossTime" className="block text-gray-800 font-medium mb-1">
                {t('loss_time')}
              </label>
              <Input
                id="lossTime"
                name="lossTime"
                type="datetime-local"
                value={formData.lossTime}
                onChange={handleChange}
                disabled={fieldReadOnlyState.lossTime || isReadOnly || isLoading || isSubmitting}
                className="input-field w-full bg-[#c0dee5] text-gray-800"
              />
            </div>

            {isImeiRegistered && (
              <div>
                <label htmlFor="password" className="block text-gray-800 font-medium mb-1">
                  {t('password')}
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={isReadOnly || isLoading || isSubmitting}
                  className="input-field w-full bg-[#c0dee5] text-gray-800"
                />
                <Button
                  type="button"
                  variant="link"
                  className="p-0 h-auto text-cyan-400 hover:text-cyan-300 mt-1 text-sm"
                  onClick={handleForgotPassword}
                  disabled={isReadOnly || isLoading || isSubmitting}
                >
                  {t('forgot_password')}
                </Button>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-gray-800 text-lg font-semibold">{t('upload_images')}</h3>
              {renderImageUpload(
                t('receipt_image'),
                'receiptImage',
                receiptImagePreview,
                setReceiptImagePreview,
                CreditCard,
                Upload,
                { showCaptureButton: true, showUploadButton: true },
                receiptImageInputRef
              )}
              {renderImageUpload(
                t('report_and_box_image'),
                'reportImage',
                reportImagePreview,
                setReportImagePreview,
                FileText,
                Upload,
                { showCaptureButton: !fieldReadOnlyState.reportImage && !isReadOnly, showUploadButton: !fieldReadOnlyState.reportImage && !isReadOnly },
                reportImageInputRef
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading || isSubmitting || isReadOnly}
              className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-2 px-4 rounded-lg border-2 border-orange-600 hover:border-orange-500 shadow-lg"
            >
              {t('submit_report')}
            </Button>
          </div>
        </form>

        <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
          <DialogContent className="sm:max-w-[300px] mx-auto px-4 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-imei-cyan">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-blue-900">{t('set_password_for_report')}</DialogTitle>
              <DialogDescription className="text-gray-700">
                {t('set_password_for_report_description')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 px-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="modalPassword" className="text-right text-gray-800 font-medium">
                  {t('password')}
                </label>
                <Input
                  id="modalPassword"
                  type="password"
                  value={modalPassword}
                  onChange={(e) => setModalPassword(e.target.value)}
                  className="input-field w-full bg-[#c0dee5] text-gray-800 border-imei-cyan focus:border-blue-500"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="modalConfirmPassword" className="text-right text-gray-800 font-medium">
                  {t('confirm_password')}
                </label>
                <Input
                  id="modalConfirmPassword"
                  type="password"
                  value={modalConfirmPassword}
                  onChange={(e) => setModalConfirmPassword(e.target.value)}
                  className="input-field w-full bg-[#c0dee5] text-gray-800 border-imei-cyan focus:border-blue-500"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                onClick={handleModalSubmit} 
                disabled={isLoading || isSubmitting}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold"
              >
                {isLoading || isSubmitting ? t('submitting') : t('submit_report')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  );
};

export default ReportPhone;
