import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import imageCompression from 'browser-image-compression';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import BackButton from '../components/BackButton';
import { Camera, FileText, CreditCard, User, Upload, AlertTriangle, CheckCircle, Smartphone, Phone, Hash, MapPin, Clock, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Button } from "@/components/ui/button";
import ImageViewer from '@/components/ImageViewer';
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import PageAdvertisement from '@/components/advertisements/PageAdvertisement';
import AdsOfferSlider from '@/components/advertisements/AdsOfferSlider';
import { useScrollToTop } from '../hooks/useScrollToTop';
import { supabase } from '@/lib/supabase';

import { useAuth } from '../contexts/AuthContext';
import CountryCodeSelector from '../components/CountryCodeSelector';
import axiosInstance from '@/services/axiosInterceptor';

// تعريف واجهة بيانات المستخدم الموسعة
interface ExtendedUser {
  id: string;
  email?: string;
  user_metadata?: {
    role?: string;
    name?: string;
    phone?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// تعريف واجهة البيانات للنموذج
interface FormData {
  ownerName: string;
  phoneNumber: string;
  imei: string;
  phone_type: string;
  lossLocation: string;
  lossTime: string;
  receiptImage: string | File | null;
  reportImage: string | File | null;
  password: string;
  confirmPassword: string;
  idLast6: string;
}

type ImageType = 'receiptImage' | 'reportImage';

// دوال مساعدة لتنسيق عرض البيانات
const maskName = (name: string): string => {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  const maskedWords = words.map(word => {
    if (word.length <= 1) return word;
    return '******' + word.charAt(0);
  });
  return maskedWords.join(' ');
};

const maskPhoneNumber = (phone: string): string => {
  if (!phone) return '';
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length <= 2) return cleanPhone;
  const lastTwoDigits = cleanPhone.slice(-2);
  return lastTwoDigits + '*'.repeat(Math.min(cleanPhone.length - 2, 8));
};

const maskIdNumber = (id: string): string => {
  if (!id) return '';
  const cleanId = id.replace(/\D/g, '');
  if (cleanId.length <= 4) return cleanId;
  const lastFourDigits = cleanId.slice(-4);
  const starsCount = Math.min(cleanId.length - 4, 6);
  return '*'.repeat(starsCount) + lastFourDigits;
};

const maskEmail = (email: string | null): string => {
  if (!email) return '';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
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
        let isValid = false;
        if (header.startsWith('ffd8')) isValid = true; // JPEG
        else if (header === '89504e47') isValid = true; // PNG
        else if (header === '47494638') isValid = true; // GIF
        else if (header === '52494646') isValid = true; // WebP
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
  const resultRef = useRef<any>(null);
  
  // حالة لتخزين القيم الأصلية
  const [originalData, setOriginalData] = useState({
    ownerName: '',
    phoneNumber: '',
    idLast6: '',
    countryCode: '' // إضافة رمز الدولة للبيانات الأصلية
  });
  
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  
  const cleanupImageUrls = useCallback(() => {
    imageUrls.forEach(url => URL.revokeObjectURL(url));
    setImageUrls([]);
  }, []);
  
  useEffect(() => {
    return cleanupImageUrls;
  }, []);
  
  const { t } = useLanguage();
  const REGISTERED_IN_SYSTEM = '__REGISTERED_IN_SYSTEM__';
  const registeredInSystemLabel = t('registered_in_system');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [countryCode, setCountryCode] = useState('+20');
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

  const [reportImagePreview, setReportImagePreview] = useState<string | null>(null);
  const [receiptImagePreview, setReceiptImagePreview] = useState<string | null>(null);

  const [isReadOnly, setIsReadOnly] = useState(false);
  const [fieldReadOnlyState, setFieldReadOnlyState] = useState({
    ownerName: false,
    phoneNumber: false,
    lossLocation: false,
    lossTime: false,
    receiptImage: false,
    reportImage: false,
    idLast6: false,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImeiRegistered, setIsImeiRegistered] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const stepItems = [
    { title: t('step_device_info_title'), description: t('step_device_info_desc') },
    { title: t('step_personal_info_title'), description: t('step_personal_info_desc') },
    { title: t('step_loss_details_title'), description: t('step_loss_details_desc') },
    { title: t('step_attachments_title'), description: t('step_attachments_desc') },
  ];

  const [dbPassword, setDbPassword] = useState<string | null>(null);
  const [registeredPhoneEmail, setRegisteredPhoneEmail] = useState<string | null>(null);
  const [modalPassword, setModalPassword] = useState('');
  const [modalConfirmPassword, setModalConfirmPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isImeiValid, setIsImeiValid] = useState(false);

  const [isImageViewerOpen, setImageViewerOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [showFullImage, setShowFullImage] = useState(false);
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);

  const [activeReportWarning, setActiveReportWarning] = useState<string | null>(null);

  const reportImageInputRef = React.useRef<HTMLInputElement>(null);
  const receiptImageInputRef = React.useRef<HTMLInputElement>(null);

  const [shareWhatsApp, setShareWhatsApp] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isCheckingRole, setIsCheckingRole] = useState(false);

  const checkUserRole = async () => {
    if (!user || !user.email) {
      setUserRole(null);
      return;
    }
    setIsCheckingRole(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .ilike('email', user.email)
        .single();

      if (error) {
        console.error('خطأ في جلب دور المستخدم:', error);
        const extendedUser = user as ExtendedUser;
        const fallbackRole = extendedUser.user_metadata?.role;
        if (fallbackRole) {
          setUserRole(fallbackRole.toLowerCase());
        } else {
          setUserRole(null);
        }
        return;
      }

      if (data && data.role) {
        setUserRole(data.role.toLowerCase());
      } else {
        const extendedUser = user as ExtendedUser;
        const fallbackRole = extendedUser.user_metadata?.role;
        if (fallbackRole) {
          setUserRole(fallbackRole.toLowerCase());
        } else {
          setUserRole(null);
        }
      }
    } catch (error) {
      console.error('خطأ في جلب دور المستخدم:', error);
      const extendedUser = user as ExtendedUser;
      const fallbackRole = extendedUser.user_metadata?.role;
      if (fallbackRole) {
        setUserRole(fallbackRole.toLowerCase());
      } else {
        setUserRole(null);
      }
    } finally {
      setIsCheckingRole(false);
    }
  };

  useEffect(() => {
    checkUserRole();
  }, [user]);

  const handleWhatsAppCheckboxChange = async () => {
    if (!user) {
      toast({
        title: t('error'),
        description: t('must_be_logged_in'),
        variant: 'destructive',
      });
      return;
    }

    if (isCheckingRole) {
      toast({
        title: t('info'),
        description: t('checking_user_role'),
        variant: 'default',
      });
      return;
    }
    
    const cleanedRole = userRole ? userRole.trim() : '';
    const isGoldUser = cleanedRole === 'gold_user' || cleanedRole === 'gold_business';
    
    if (isGoldUser) {
      setShareWhatsApp(!shareWhatsApp);
    } else {
      setShowUpgradeDialog(true);
    }
  };

  const validateForm = (data: FormData, isImeiRegisteredStatus: boolean, actualDbPassword: string | null, currentFieldReadOnlyState: typeof fieldReadOnlyState): boolean => {
    if (!data.ownerName || !data.phoneNumber || !data.imei || !data.phone_type || !data.lossLocation || !data.lossTime || !data.idLast6) {
      toast({ title: t('error'), description: t('please_fill_all_fields'), variant: 'destructive' });
      return false;
    }
    
    if (!isImeiRegisteredStatus && data.idLast6 !== REGISTERED_IN_SYSTEM) {
      const val = String(data.idLast6 || '');
      const isMasked = /\*/.test(val);
      const isNumeric6 = /^\d{6}$/.test(val);
      if (!isMasked && !isNumeric6) {
        toast({ title: t('error'), description: t('id_last6_invalid'), variant: 'destructive' });
        return false;
      }
    }

    if (isImeiRegisteredStatus) {
      if (!data.password) {
        toast({ title: t('error'), description: t('please_enter_password_to_confirm'), variant: 'destructive' });
        return false;
      }
    }
    
    if (!currentFieldReadOnlyState.receiptImage) {
      if (!data.receiptImage && data.ownerName !== REGISTERED_IN_SYSTEM) {
        toast({ title: t('error'), description: t('receipt_image_required'), variant: 'destructive' });
        return false;
      }
      if (
        data.ownerName === REGISTERED_IN_SYSTEM && (
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
    
    if (!currentFieldReadOnlyState.reportImage && !data.reportImage) {
      toast({ title: t('error'), description: t('report_image_required'), variant: 'destructive' });
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
    if (name === 'phoneNumber' && updatedValue.startsWith('0')) {
      updatedValue = updatedValue.replace(/^0+/, '');
    }
    setFormData(prev => (({
      ...prev,
      [name]: updatedValue
    })));
  };

  const updateImage = useCallback(async (file: File, fileType: ImageType, setPreview: React.Dispatch<React.SetStateAction<string | null>>) => {
    const imageUrl = URL.createObjectURL(file);
    setPreview(imageUrl);
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
      setFormData(prev => ({ ...prev, [fileType]: file }));
    }
  }, [t, toast, imageUrls]);

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

  const handleImageFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>, fileType: ImageType, setPreview: React.Dispatch<React.SetStateAction<string | null>>) => {
    if (fieldReadOnlyState[fileType] || isReadOnly) return;

    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({ title: t('error'), description: t('invalid_file_type'), variant: 'destructive' });
        return;
      }

      const isValidImage = await validateImageFile(file);
      if (!isValidImage) {
        toast({ title: t('error'), description: t('invalid_image_file'), variant: 'destructive' });
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast({ title: t('error'), description: t('file_too_large_10mb'), variant: 'destructive' });
        return;
      }
      await updateImage(file, fileType, setPreview);
    } else {
      setFormData(prev => ({ ...prev, [fileType]: null }));
      setPreview(null);
    }
  }, [fieldReadOnlyState, isReadOnly, toast, t, updateImage]);

  const renderImageUpload = (
    label: string,
    fileType: ImageType,
    preview: string | null,
    setPreview: React.Dispatch<React.SetStateAction<string | null>>,
    Icon: React.ElementType,
    UploadIcon: React.ElementType,
    config: { showCaptureButton: boolean; showUploadButton: boolean },
    inputRef: React.RefObject<HTMLInputElement>
  ) => {
    let isFieldReadOnly = fieldReadOnlyState[fileType] || isReadOnly;
    if (fileType === 'receiptImage') {
      isFieldReadOnly = (
        formData.ownerName === REGISTERED_IN_SYSTEM ||
        formData.phone_type === REGISTERED_IN_SYSTEM ||
        formData.phoneNumber === REGISTERED_IN_SYSTEM ||
        formData.idLast6 === REGISTERED_IN_SYSTEM
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
                  <label onClick={() => inputRef.current?.click()} className="flex-1 bg-gradient-to-r from-blue-800 via-blue-700 to-blue-800 hover:from-blue-700 hover:via-blue-600 hover:to-blue-700 text-white py-2 px-2 rounded-lg text-center cursor-pointer transition-all duration-300 shadow hover:shadow-md flex items-center justify-center text-sm">
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
        receiptImage: false,
        reportImage: false,
        idLast6: false,
      });
      setIsImeiRegistered(false);
      setDbPassword(null);
      setRegisteredPhoneEmail(null);
      setFormData(prev => (({
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
      })));
      setIsReadOnly(false);
      setActiveReportWarning(null);
      setIsImeiValid(false);
      setShareWhatsApp(false);
      // إعادة تعيين رمز الدولة عند إعادة تعيين النموذج
      setCountryCode('+20');
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

        let checkResult: any = null;
        try {
          const resp2 = await axiosInstance.post('/api/check-imei', { imei: imeiValue, userId: user?.id });
          if (resp2 && resp2.data) checkResult = resp2.data;
        } catch (e) {
          // endpoint may not exist or be unreachable; ignore
        }

        if (checkResult) {
          result.hasActiveReport = result.hasActiveReport ?? (checkResult.hasActiveReport ?? checkResult.active ?? false);
          const checkIndicatesFound = Boolean(
            checkResult.found || checkResult.exists || (checkResult.phoneDetails && Object.keys(checkResult.phoneDetails).length > 0)
          );
          result.found = result.found ?? checkIndicatesFound;
          result.isRegistered = result.isRegistered ?? (checkResult.isRegistered ?? checkResult.exists ?? (checkResult.phoneDetails ? true : false));

          if (!result.phoneDetails && checkResult.phoneDetails) {
            result.phoneDetails = checkResult.phoneDetails;
          }

          const inferredIsOwnReport = typeof (checkResult?.isOwnReport) === 'boolean'
            ? checkResult.isOwnReport
            : ((checkResult?.reporter_user_id === user?.id) || (checkResult?.userId === user?.id));
          result.isOwnReport = result.isOwnReport ?? inferredIsOwnReport;
          result.reporter_user_id = result.reporter_user_id ?? (checkResult.reporter_user_id ?? checkResult.userId ?? checkResult.reporterId);

          result.isOtherUser = result.isOtherUser ?? (checkResult.isOtherUser ?? false);
        }

        // حالة 1: هاتف جديد (غير مسجل)
        if (!result.found) {
          resetFormForNewReport();
          setIsImeiRegistered(false);
          setIsImeiValid(true);
          setActiveReportWarning('phone_not_registered_can_report');
          
          // ⭐ التعديل الجديد: التعامل مع البيانات المقنعة من الخادم
          if (result.autoFillData) {
            const {
              ownerName,
              phoneNumber,
              idLast6,
              isReadOnly,
              // support multiple possible server field names
              countryKey,
              country_key,
              country_code
            } = result.autoFillData;

            // فصل رمز الدولة عن الرقم إذا كانا مدمجين
            const providedCountry = countryKey || country_code || country_key || '';
            let extractedCountryCode = providedCountry || '+20';
            let extractedPhoneNumber = phoneNumber || '';

            // إذا لم يكن هناك رمز دولة صريح، حاول فصله من الرقم
            if (!providedCountry && phoneNumber && phoneNumber.startsWith('+')) {
              const match = phoneNumber.match(/^\+(\d{1,3})(.*)$/);
              if (match) {
                extractedCountryCode = `+${match[1]}`;
                extractedPhoneNumber = match[2];
              }
            }

            // تحديث الحالة
            setCountryCode(extractedCountryCode);

            setFormData(prev => ({
              ...prev,
              ownerName: ownerName || '',
              phoneNumber: extractedPhoneNumber.replace(/\D/g, ''), // حفظ الرقم فقط بدون رمز
              idLast6: idLast6 ? (/\*/.test(String(idLast6)) ? String(idLast6) : maskIdNumber(String(idLast6))) : '',
            }));

            setOriginalData({
              ownerName: ownerName || '',
              phoneNumber: extractedPhoneNumber.replace(/\D/g, ''),
              idLast6: idLast6 || '',
              countryCode: extractedCountryCode
            });

            if (isReadOnly) {
              setFieldReadOnlyState({
                ownerName: true,
                phoneNumber: true,
                idLast6: true,
                lossLocation: false,
                lossTime: false,
                receiptImage: false,
                reportImage: false,
              });
            }
          }
          
          return;
        }

        // حالة 2: الهاتف مسجل للمالك الحالي
        const serverIsOwner = Boolean(result.isOwner === true);
        let inferredIsOwner = serverIsOwner;
        try {
          if (!inferredIsOwner && result.isTransferred && user) {
            const extendedUser = user as ExtendedUser;
            const userMeta = extendedUser.user_metadata || {};
            const currentMaskedName = maskName(userMeta.name || user.email || '');
            const currentMaskedPhone = maskPhoneNumber(userMeta.phone || '');
            if ((result.maskedOwnerName && String(result.maskedOwnerName).trim() === currentMaskedName)
              || (result.maskedPhoneNumber && String(result.maskedPhoneNumber).trim() === currentMaskedPhone)) {
              inferredIsOwner = true;
            }
          }
          if (!inferredIsOwner && result.phoneDetails && user && result.phoneDetails.user_id && String(result.phoneDetails.user_id) === String(user.id)) {
            inferredIsOwner = true;
          }
        } catch (e) {
          console.debug('Error inferring owner from masked values:', e);
        }

        if (result.found && (
          result.isOwnReport === true ||
          result.reporter_user_id === user?.id ||
          result.user_id === user?.id ||
          result.reporterId === user?.id
        )) {
          setIsReadOnly(true);
          setFieldReadOnlyState({
            ownerName: true, phoneNumber: true, lossLocation: true, lossTime: true,
            receiptImage: true, reportImage: true,
            idLast6: true,
          });
          setActiveReportWarning('imei_already_reported_by_your_account');
          setIsImeiValid(false);
          toast({ title: t('info'), description: t('imei_already_reported_by_your_account') });
          return;
        }

        if (result.found && result.isRegistered && inferredIsOwner) {
          // ⭐ التعديل الجديد: التعامل مع البيانات المسجلة للمالك الحالي
          // فصل رمز الدولة عن الرقم
          let registeredCountryCode =
            result.phoneDetails?.country_code ||
            result.phoneDetails?.countryKey ||
            result.phoneDetails?.country_key ||
            result.country_code ||
            result.countryKey ||
            result.country_key ||
            '+20';

          let registeredPhoneNumber = result.phoneDetails?.phone_number || result.phone_number || '';

          // إذا لم يكن هناك رمز دولة صريح، حاول فصله من الرقم
          if ((!registeredCountryCode || registeredCountryCode === '+') && registeredPhoneNumber && registeredPhoneNumber.startsWith('+')) {
            const match = registeredPhoneNumber.match(/^\+(\d{1,3})(.*)$/);
            if (match) {
              registeredCountryCode = `+${match[1]}`;
              registeredPhoneNumber = match[2];
            }
          }

          setCountryCode(registeredCountryCode);
          
          setFormData(prev => (({
            ...prev,
            ownerName: REGISTERED_IN_SYSTEM,
            phoneNumber: REGISTERED_IN_SYSTEM,
            phone_type: REGISTERED_IN_SYSTEM,
            idLast6: REGISTERED_IN_SYSTEM,
            lossLocation: '',
            lossTime: '',
            receiptImage: null,
            reportImage: null,
            password: '',
            confirmPassword: '',
          })));
          setReceiptImagePreview(null);
          setReportImagePreview(null);
          setFieldReadOnlyState({
            ownerName: true,
            phoneNumber: true,
            lossLocation: false,
            lossTime: false,
            receiptImage: true,
            reportImage: false,
            idLast6: true,
          });
          setIsImeiRegistered(false);
          setIsReadOnly(false);
          setActiveReportWarning(null);
          setIsImeiValid(true);
          return;
        }

        // حالة 3: الهاتف مسجل لغير المالك
        if (result.found && result.isRegistered && !inferredIsOwner) {
          setFormData(prev => (({
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
          })));
          setReceiptImagePreview(null);
          setReportImagePreview(null);
          setRegisteredPhoneEmail(null);
          setOriginalData({ ownerName: '', phoneNumber: '', idLast6: '', countryCode: '' });
          setFieldReadOnlyState({
            ownerName: true,
            phoneNumber: true,
            lossLocation: true,
            lossTime: true,
            receiptImage: true,
            reportImage: true,
            idLast6: true,
          });
          setIsImeiRegistered(true);
          setIsImeiValid(false);
          setIsReadOnly(true);
          setActiveReportWarning('this_phone_registered_to_another_account_cannot_report');
          toast({
            title: t('access_denied'),
            description: t('this_phone_registered_to_another_account_cannot_report'),
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
            idLast6: true,
          });
          setActiveReportWarning('imei_already_reported_as_lost_detail');
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

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentStep < 4) {
      setCurrentStep((prev) => Math.min(prev + 1, 4));
      return;
    }

    if (!validateForm(formData, isImeiRegistered, dbPassword, fieldReadOnlyState)) {
      return;
    }

    if (isImeiRegistered) {
      toast({
        title: t('access_denied'),
        description: t('this_phone_registered_to_another_account'),
        variant: 'destructive',
      });
      return;
    }

    setShowPasswordModal(true);
  };

  const handleModalSubmit = async () => {
    if (!modalPassword || !modalConfirmPassword || modalPassword !== modalConfirmPassword) {
      toast({ title: t('error'), description: t('passwords_do_not_match'), variant: 'destructive' });
      return;
    }

    await saveReport(modalPassword);
    setShowPasswordModal(false);
  };

  const saveReport = async (password: string) => {
    setIsSubmitting(true);
    try {
      const getBase64 = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const generateRandomId = (): string => {
        try {
          if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
            return (crypto as any).randomUUID();
          }
        } catch (e) {}
        return `${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
      };

      const uploadToSupabase = async (file: File | Blob, type: 'receipt' | 'report') => {
        let fileExt = 'jpg';
        if (file instanceof File && file.name && file.name.endsWith('.webp')) fileExt = 'webp';
        else if ((file as any).type === 'image/webp') fileExt = 'webp';
        else if ((file as any).type === 'image/png') fileExt = 'png';
        else if ((file as any).type === 'image/jpeg' || (file as any).type === 'image/jpg') fileExt = 'jpg';
        else if ((file as any).type) fileExt = (file as any).type.split('/').pop() || 'jpg';

        const base64 = await getBase64(file as File);

        try {
          const resp = await axiosInstance.post('/api/upload-report-image', {
            fileBase64: base64,
            fileExt,
            type,
          });
          if (resp && resp.data && resp.data.success) {
            return resp.data.publicUrl || resp.data.path || null;
          }
          throw new Error('Upload failed');
        } catch (e) {
          console.error('Server upload failed', e);
          throw new Error(t('failed_to_upload_image'));
        }
      };

      let receiptImageToSend: string | null = null;
      if (formData.ownerName === REGISTERED_IN_SYSTEM) {
        let url = resultRef.current && resultRef.current.receipt_image_url;
        if (!url) {
          try {
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
          } catch (e) {
            console.error('فشل جلب receipt_image_url عبر /api/imei-masked-info:');
          }
        }
        if (typeof url === 'string' && (!url.startsWith('https://') || !url.includes('/storage/v1/object/public/'))) {
          try {
            const resp = await axiosInstance.post('/api/get-public-url', { url });
            if (resp && resp.data && resp.data.success && resp.data.publicUrl) {
              url = resp.data.publicUrl;
            }
          } catch (e) {
            console.warn('Failed to convert receipt image to public URL via server, falling back to original URL', e);
          }
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

      if (reportImageToSend && (reportImageToSend.startsWith('blob:') || reportImageToSend.startsWith('data:'))) {
        toast({ title: t('error'), description: t('failed_to_upload_image'), variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }
      
      if (!reportImageToSend) {
        toast({ title: t('error'), description: t('report_image_required'), variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }

      let fcmToken = '';

      // ⭐ التعديل الجديد: التعامل مع البيانات المقنعة عند الإرسال
      let effectiveOwnerName = isImeiRegistered ? originalData.ownerName : formData.ownerName;
      let effectivePhoneNumber = isImeiRegistered ? originalData.phoneNumber : formData.phoneNumber;
      let effectiveIdLast6 = isImeiRegistered ? originalData.idLast6 : formData.idLast6;
      let effectiveCountryCode = isImeiRegistered ? originalData.countryCode : countryCode;

      // إذا كانت البيانات مقنعة (تحتوي على نجوم)، نستخدم القيم من resultRef.current
      if (effectiveOwnerName && effectiveOwnerName.includes('*')) {
        const r = resultRef.current;
        if (r && r.autoFillData) {
          effectiveOwnerName = r.autoFillData.ownerNameRaw || r.autoFillData.ownerName || effectiveOwnerName;
        }
      }

      if (effectivePhoneNumber && effectivePhoneNumber.includes('*')) {
        const r = resultRef.current;
        if (r && r.autoFillData) {
          effectivePhoneNumber = r.autoFillData.phoneNumberRaw || r.autoFillData.phoneNumber || effectivePhoneNumber;
          // تحديث رمز الدولة إذا كان متوفراً في البيانات الأصلية
          const afCountry = r.autoFillData.countryKey || r.autoFillData.country_code || r.autoFillData.country_key;
          if (afCountry) {
            effectiveCountryCode = afCountry;
          }
        }
      }

      if (effectiveIdLast6 && effectiveIdLast6.includes('*')) {
        const r = resultRef.current;
        if (r && r.autoFillData) {
          effectiveIdLast6 = r.autoFillData.idLast6Raw || r.autoFillData.idLast6 || effectiveIdLast6;
        }
      }

      if (effectiveOwnerName === REGISTERED_IN_SYSTEM || effectivePhoneNumber === REGISTERED_IN_SYSTEM || effectiveIdLast6 === REGISTERED_IN_SYSTEM) {
        const r = resultRef.current;
        if (r) {
          const maybeOwner = r.owner_name || r.ownerName || r.owner || r.name || null;
          const maybePhone = r.phone_number || r.phoneNumber || r.phone || r.owner_phone || null;
          const maybeId6 = r.id_last6 || r.idLast6 || r.id_last_6 || null;
          const maybeCountryCode =
            r.countryKey || r.country_key || r.country_code ||
            r.phoneDetails?.countryKey || r.phoneDetails?.country_key || r.phoneDetails?.country_code ||
            '+20';

          if (maybeOwner) effectiveOwnerName = maybeOwner;
          if (maybePhone) {
            // إذا كان الرقم يبدأ بـ +، نفصله
            if (maybePhone.startsWith('+')) {
              const match = maybePhone.match(/^\+(\d{1,3})(.*)$/);
              if (match) {
                effectiveCountryCode = `+${match[1]}`;
                effectivePhoneNumber = match[2];
              }
            } else {
              effectivePhoneNumber = maybePhone;
            }
          }
          if (maybeId6) effectiveIdLast6 = maybeId6;
          if (maybeCountryCode) effectiveCountryCode = maybeCountryCode;
        } else {
          try {
            const sessionResp = await supabase.auth.getSession();
            const jwt = (sessionResp?.data as any)?.session?.access_token || '';
            const resp = await axiosInstance.post('/api/imei-masked-info', { imei: formData.imei }, { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} });
            const json = resp?.data;
            const maybeOwner = json?.owner_name || json?.ownerName || null;
            const maybePhone = json?.phone_number || json?.phoneNumber || null;
            const maybeId6 = json?.id_last6 || json?.idLast6 || null;
            const maybeCountryCode =
              json?.countryKey || json?.country_key || json?.country_code ||
              json?.phoneDetails?.countryKey || json?.phoneDetails?.country_key || json?.phoneDetails?.country_code ||
              '+20';

            if (maybeOwner) effectiveOwnerName = maybeOwner;
            if (maybePhone) {
              if (maybePhone.startsWith('+')) {
                const match = maybePhone.match(/^\+(\d{1,3})(.*)$/);
                if (match) {
                  effectiveCountryCode = `+${match[1]}`;
                  effectivePhoneNumber = match[2];
                }
              } else {
                effectivePhoneNumber = maybePhone;
              }
            }
            if (maybeId6) effectiveIdLast6 = maybeId6;
            if (maybeCountryCode) effectiveCountryCode = maybeCountryCode;
          } catch (e) {
            console.error('Failed to fetch real owner data for REGISTERED_IN_SYSTEM fallback:', e);
          }
        }
      }

      // ⭐ التعديل الجديد: إرسال البيانات منفصلة
      const payload = {
        ownerName: effectiveOwnerName,
        phoneNumber: effectivePhoneNumber.replace(/\D/g, ''), // إرسال الرقم فقط
        country_code: effectiveCountryCode, // إرسال رمز الدولة منفصلاً
        imei: formData.imei,
        phone_type: formData.phone_type === REGISTERED_IN_SYSTEM ? (resultRef.current?.phone_type || '') : formData.phone_type,
        loss_location: formData.lossLocation,
        loss_time: formData.lossTime,
        receipt_image_url: receiptImageToSend,
        report_image_url: reportImageToSend,
        password: password,
        id_last6: effectiveIdLast6,
        user_id: user?.id || null,
        email: user?.email || '',
        fcm_token: fcmToken,
        whatsapp: shareWhatsApp,
      };

      let jwtToken = '';
      try {
        const sessionResp = await supabase.auth.getSession();
        jwtToken = (sessionResp?.data as any)?.session?.access_token || '';
      } catch (e) {
        jwtToken = '';
      }

      const resp = await axiosInstance.post('/api/report-lost-phone', payload);
      const result = resp?.data;
      if (!result.success) {
        throw new Error(result.error || t('failed_to_submit_report'));
      }

      toast({ title: t('success'), description: t('report_submitted_successfully') });
      setIsReadOnly(true);
      setFieldReadOnlyState({
        ownerName: true, phoneNumber: true, lossLocation: true, lossTime: true,
        receiptImage: true, reportImage: true,
        idLast6: true,
      });
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (error: any) {
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

        <form onSubmit={handleSubmit} className="space-y-6 px-1 pb-10 pt-0">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="mb-8 px-2 sticky top-0 z-0 bg-white/95 backdrop-blur-sm py-2 rounded-xl">
              <div className="flex items-center justify-between relative">
                {[1, 2, 3, 4].map((step) => (
                  <React.Fragment key={step}>
                    <div className="flex flex-col items-center z-10">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white transition-all duration-500 ${
                          currentStep === step
                            ? 'bg-gradient-to-r from-blue-600 to-cyan-600 shadow-lg ring-4 ring-blue-100 scale-110'
                            : currentStep > step
                            ? 'bg-green-500'
                            : 'bg-gray-300'
                        }`}
                      >
                        {currentStep > step ? <CheckCircle className="w-6 h-6" /> : step}
                      </div>
                    </div>
                    {step < 4 && (
                      <div className="flex-1 h-1 mx-[-10px] -mt-0">
                        <div 
                          className={`h-full transition-all duration-500 ${
                            currentStep > step ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                        />
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[9px] md:text-[11px] font-bold text-gray-600 gap-1">
                <span className={`w-1/4 text-center leading-tight break-words ${currentStep === 1 ? 'text-blue-600' : ''}`}>{t('step_device_info_title')}</span>
                <span className={`w-1/4 text-center leading-tight break-words ${currentStep === 2 ? 'text-blue-600' : ''}`}>{t('step_personal_info_title')}</span>
                <span className={`w-1/4 text-center leading-tight break-words ${currentStep === 3 ? 'text-blue-600' : ''}`}>{t('step_loss_details_title')}</span>
                <span className={`w-1/4 text-center leading-tight break-words ${currentStep === 4 ? 'text-blue-600' : ''}`}>{t('step_attachments_title')}</span>
              </div>
            </div>

            {currentStep === 1 && activeReportWarning && activeReportWarning !== 'this_phone_registered_to_another_account' && activeReportWarning !== 'this_phone_registered_to_another_account_cannot_report' && activeReportWarning !== 'phone_not_registered_can_report' && (
              <div
                className="my-2 rounded-[28px] border border-red-200 bg-red-50/90 p-4 text-center shadow-sm"
              >
                <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-red-500" />
                <p className="text-red-700 font-semibold text-base">
                  {t(activeReportWarning)}
                </p>
              </div>
            )}
            {currentStep === 1 && (activeReportWarning === 'this_phone_registered_to_another_account' || activeReportWarning === 'this_phone_registered_to_another_account_cannot_report') && (
              <div
                className="my-2 rounded-[28px] border border-red-200 bg-red-50/90 p-4 text-center shadow-sm"
              >
                <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-red-500" />
                <p className="text-red-700 font-semibold text-base">
                  {t(activeReportWarning)}
                </p>
              </div>
            )}
            {currentStep === 1 && activeReportWarning === 'phone_not_registered_can_report' && (
              <div
                className="my-2 rounded-[28px] border border-green-200 bg-green-50/90 p-4 text-center shadow-sm"
              >
                <CheckCircle className="mx-auto mb-3 h-12 w-12 text-green-500" />
                <p className="text-green-700 font-semibold text-base">
                  {t(activeReportWarning)}
                </p>
              </div>
            )}

            <div className="rounded-[28px] border border-slate-200 bg-white/95 px-2 py-6 shadow-sm">
              {currentStep === 1 && (
                <div className="space-y-5">
                  <div className="flex items-center mb-6 px-2">
                    <span className="w-8 h-8 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full flex items-center justify-center text-white text-sm ml-2">1</span>
                    <h3 className="text-xl font-bold text-blue-900">
                      {t('step_device_info_title')}
                    </h3>
                  </div>
                  <div className="space-y-3">
                    <label htmlFor="imei" className="flex items-center gap-2 text-slate-800 font-medium">
                      <Hash className="h-4 w-4 text-[#0a4d8c]" />
                      {t('imei_number')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Smartphone className="h-4 w-4 text-gray-500" />
                      </div>
                      <Input
                        type="text"
                        id="imei"
                        name="imei"
                        value={formData.imei}
                        onChange={handleChange}
                        placeholder={t('enter_imei')}
                        disabled={isReadOnly || isSubmitting}
                        className={`input-field w-full bg-[#c0dee5] text-gray-800 !pl-12 ${isImeiValid ? '!pr-12 border-green-500' : ''}`}
                        maxLength={15}
                        pattern="[0-9]*"
                        inputMode="numeric"
                        required
                      />
                      {isImeiValid && (
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-slate-600">{t('imei_hint')}</p>
                  </div>

                  <div className="space-y-3">
                    <label htmlFor="phone_type" className="flex items-center gap-2 text-slate-800 font-medium">
                      <Smartphone className="h-4 w-4 text-[#0a4d8c]" />
                      {t('phone_type')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <FileText className="h-4 w-4 text-gray-500" />
                      </div>
                      <Input
                        type="text"
                        id="phone_type"
                        name="phone_type"
                        value={formData.phone_type === REGISTERED_IN_SYSTEM ? registeredInSystemLabel : formData.phone_type}
                        onChange={handleChange}
                        placeholder={formData.phone_type === REGISTERED_IN_SYSTEM ? registeredInSystemLabel : t('phone_type_placeholder')}
                        disabled={isReadOnly || isSubmitting || formData.phone_type === REGISTERED_IN_SYSTEM}
                        className="input-field w-full bg-[#c0dee5] text-gray-800 !pl-12"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-5">
                  <div className="flex items-center mb-6 px-2">
                    <span className="w-8 h-8 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full flex items-center justify-center text-white text-sm ml-2">2</span>
                    <h3 className="text-xl font-bold text-blue-900">
                      {t('step_personal_info_title')}
                    </h3>
                  </div>
                  <div className="space-y-3">
                    <label htmlFor="ownerName" className="flex items-center gap-2 text-slate-800 font-medium">
                      <User className="h-4 w-4 text-[#0a4d8c]" />
                      {t('owner_name')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-4 w-4 text-gray-500" />
                      </div>
                      <Input
                        type="text"
                        id="ownerName"
                        name="ownerName"
                        value={formData.ownerName === REGISTERED_IN_SYSTEM ? registeredInSystemLabel : formData.ownerName}
                        onChange={handleChange}
                        placeholder={
                          formData.ownerName === REGISTERED_IN_SYSTEM
                            ? registeredInSystemLabel
                            : (formData.ownerName && /^[*]+$/.test(formData.ownerName) ? registeredInSystemLabel : t('owner_name'))
                        }
                        disabled={isReadOnly || fieldReadOnlyState.ownerName || isSubmitting || formData.ownerName === REGISTERED_IN_SYSTEM}
                        className={`input-field w-full bg-[#c0dee5] text-gray-800 !pl-12 ${/^[*]+$/.test(formData.ownerName) || formData.ownerName.length < 2 ? 'text-gray-400 italic' : ''}`}
                        style={(() => {
                          if (/^[*]+$/.test(formData.ownerName) || formData.ownerName.length < 2) {
                            return { letterSpacing: '0.2em' };
                          }
                          return /[a-zA-Z0-9]/.test(formData.ownerName) ? { direction: 'ltr', textAlign: 'left' } : { direction: 'rtl', textAlign: 'right' };
                        })()}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label htmlFor="idLast6" className="flex items-center gap-2 text-slate-800 font-medium">
                      <CreditCard className="h-4 w-4 text-[#0a4d8c]" />
                      {t('id_last_6_digits')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <CreditCard className="h-4 w-4 text-gray-500" />
                      </div>
                      <Input
                        type="text"
                        id="idLast6"
                        name="idLast6"
                        value={formData.idLast6 === REGISTERED_IN_SYSTEM ? registeredInSystemLabel : formData.idLast6}
                        onChange={handleChange}
                        className={`input-field w-full bg-[#c0dee5] text-gray-800 !pl-12 ${/^[*]+$/.test(formData.idLast6) || formData.idLast6.length < 2 ? 'text-gray-400 italic' : ''}`}
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
                          formData.idLast6 === REGISTERED_IN_SYSTEM
                            ? registeredInSystemLabel
                            : (formData.idLast6 && /^[*]+$/.test(formData.idLast6) ? registeredInSystemLabel : t('id_last_6_digits_placeholder'))
                        }
                        disabled={fieldReadOnlyState.idLast6 || isReadOnly || isSubmitting || formData.idLast6 === REGISTERED_IN_SYSTEM}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label htmlFor="phoneNumber" className="flex items-center gap-2 text-slate-800 font-medium">
                      <Phone className="h-4 w-4 text-[#0a4d8c]" />
                      {t('phone_number')}
                    </label>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <CountryCodeSelector
                        value={countryCode}
                        onChange={setCountryCode}
                        disabled={fieldReadOnlyState.phoneNumber || isReadOnly || isSubmitting || formData.phoneNumber === REGISTERED_IN_SYSTEM}
                      />
                      <div className="relative w-full">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Phone className="h-4 w-4 text-gray-500" />
                        </div>
                        <Input
                          id="phoneNumber"
                          name="phoneNumber"
                          type="tel"
                          value={formData.phoneNumber === REGISTERED_IN_SYSTEM ? registeredInSystemLabel : formData.phoneNumber}
                          onChange={handleChange}
                          disabled={fieldReadOnlyState.phoneNumber || isReadOnly || isSubmitting || formData.phoneNumber === REGISTERED_IN_SYSTEM}
                          className={`input-field w-full bg-[#c0dee5] text-gray-800 !pl-12 ${/^[*]+$/.test(formData.phoneNumber) || formData.phoneNumber.length < 2 ? 'text-gray-400 italic' : ''}`}
                          style={(() => {
                            if (/^[*]+$/.test(formData.phoneNumber) || formData.phoneNumber.length < 2) {
                              return { letterSpacing: '0.2em' };
                            }
                            return /[a-zA-Z0-9]/.test(formData.phoneNumber) ? { direction: 'ltr', textAlign: 'left' } : { direction: 'rtl', textAlign: 'right' };
                          })()}
                          placeholder={
                            formData.phoneNumber === REGISTERED_IN_SYSTEM
                              ? registeredInSystemLabel
                              : (formData.phoneNumber && /^[*]+$/.test(formData.phoneNumber) ? registeredInSystemLabel : t('phone_placeholder'))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-5">
                  <div className="flex items-center mb-6 px-2">
                    <span className="w-8 h-8 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full flex items-center justify-center text-white text-sm ml-2">3</span>
                    <h3 className="text-xl font-bold text-blue-900">
                      {t('step_loss_details_title')}
                    </h3>
                  </div>
                  <div className="space-y-3">
                    <label htmlFor="lossLocation" className="flex items-center gap-2 text-slate-800 font-medium">
                      <MapPin className="h-4 w-4 text-[#0a4d8c]" />
                      {t('loss_location')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <MapPin className="h-4 w-4 text-gray-500" />
                      </div>
                      <Input
                        id="lossLocation"
                        name="lossLocation"
                        type="text"
                        value={formData.lossLocation}
                        onChange={handleChange}
                        disabled={fieldReadOnlyState.lossLocation || isReadOnly || isSubmitting}
                        className="input-field w-full bg-[#c0dee5] text-gray-800 !pl-12"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label htmlFor="lossTime" className="flex items-center gap-2 text-slate-800 font-medium">
                      <Clock className="h-4 w-4 text-[#0a4d8c]" />
                      {t('loss_time')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Clock className="h-4 w-4 text-gray-500" />
                      </div>
                      <Input
                        id="lossTime"
                        name="lossTime"
                        type="datetime-local"
                        value={formData.lossTime}
                        onChange={handleChange}
                        disabled={fieldReadOnlyState.lossTime || isReadOnly || isSubmitting}
                        className="input-field w-full bg-[#c0dee5] text-gray-800 !pl-12"
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-5">
                  <div className="flex items-center mb-6 px-2">
                    <span className="w-8 h-8 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full flex items-center justify-center text-white text-sm ml-2">4</span>
                    <h3 className="text-xl font-bold text-blue-900">
                      {t('step_attachments_title')}
                    </h3>
                  </div>
                  {isImeiRegistered && (
                    <div className="space-y-3">
                      <label htmlFor="password" className="flex items-center gap-2 text-slate-800 font-medium">
                        <KeyRound className="h-4 w-4 text-[#0a4d8c]" />
                        {t('password')}
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <KeyRound className="h-4 w-4 text-gray-500" />
                        </div>
                        <Input
                          id="password"
                          name="password"
                          type="password"
                          value={formData.password}
                          onChange={handleChange}
                          disabled={isReadOnly || isSubmitting}
                          className="input-field w-full bg-[#c0dee5] text-gray-800 !pl-12"
                        />
                      </div>
                      <Button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
                        onClick={handleForgotPassword}
                        disabled={isReadOnly || isSubmitting}
                      >
                        {t('forgot_password')}
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center space-x-2 space-x-reverse mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <input
                      type="checkbox"
                      id="shareWhatsApp"
                      checked={shareWhatsApp}
                      onChange={handleWhatsAppCheckboxChange}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                      disabled={isReadOnly || isSubmitting || isCheckingRole}
                    />
                    <label htmlFor="shareWhatsApp" className="text-sm font-medium text-gray-700 cursor-pointer">
                      {t('share_whatsapp_number')}
                    </label>
                    <Smartphone className="w-4 h-4 text-blue-600 ml-2" />
                    {isCheckingRole && (
                      <span className="text-xs text-blue-600 mr-2">
                        {t('checking_user_role')}
                      </span>
                    )}
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-slate-800 text-lg font-semibold">{t('upload_images')}</h3>
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
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              {currentStep > 1 && (
                <Button
                  type="button"
                  onClick={handlePrevStep}
                  disabled={isLoading || isSubmitting}
                  className="flex-1 rounded-xl border border-slate-300 bg-slate-100 px-2 py-4 text-slate-700 font-bold transition hover:bg-slate-200 shadow-md"
                >
                  {t('previous')}
                </Button>
              )}
              <Button
                type="submit"
                disabled={isLoading || isSubmitting || isReadOnly}
                className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-2 py-4 text-white font-bold shadow-lg transition hover:from-blue-700 hover:to-cyan-600"
              >
                {currentStep < 4 ? t('next') : t('submit_report')}
              </Button>
            </div>
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
                <label htmlFor="modalPassword" className="flex items-center gap-2 text-right text-gray-800 font-medium">
                  <KeyRound className="h-4 w-4 text-[#0a4d8c]" />
                  {t('password')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound className="h-4 w-4 text-gray-500" />
                  </div>
                  <Input
                    id="modalPassword"
                    type="password"
                    value={modalPassword}
                    onChange={(e) => setModalPassword(e.target.value)}
                    className="input-field w-full bg-[#c0dee5] text-gray-800 border-imei-cyan focus:border-blue-500 !pl-12"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="modalConfirmPassword" className="flex items-center gap-2 text-right text-gray-800 font-medium">
                  <KeyRound className="h-4 w-4 text-[#0a4d8c]" />
                  {t('confirm_password')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound className="h-4 w-4 text-gray-500" />
                  </div>
                  <Input
                    id="modalConfirmPassword"
                    type="password"
                    value={modalConfirmPassword}
                    onChange={(e) => setModalConfirmPassword(e.target.value)}
                    className="input-field w-full bg-[#c0dee5] text-gray-800 border-imei-cyan focus:border-blue-500 !pl-12"
                  />
                </div>
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

        {showUpgradeDialog && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => setShowUpgradeDialog(false)} />
            <div className="relative z-10 w-full max-w-lg mx-auto">
              <div className="bg-green-100/30 backdrop-blur-2xl rounded-2xl shadow-2xl w-[95%] h-[95vh] max-w-lg mx-auto border border-white/0 relative overflow-hidden pt-[50px] bg-clip-padding">
                <button onClick={() => setShowUpgradeDialog(false)} className="absolute top-3 right-3 bg-red-600 text-white rounded-full p-1.5 shadow-lg hover:bg-red-700 transition-colors z-10" aria-label="إغلاق">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>

                <div className="flex flex-col items-center justify-center h-full pt-10 pb-16 px-6">
                  <div className="mb-12 animate-pulse">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-gem w-28 h-28 text-cyan-200 drop-shadow-[0_2px_5px_rgba(0,255,255,0.5)]">
                      <path d="M6 3h12l4 6-10 13L2 9Z" />
                      <path d="M11 3 8 9l4 13 4-13-3-6" />
                      <path d="M2 9h20" />
                    </svg>
                  </div>

                  <h2 className="text-4xl md:text-5xl font-extrabold text-center select-none mb-4 text-white font-sans [text-shadow:_0_4px_6px_rgba(0,0,0,0.6)] transform -skew-y-6 tracking-wider">UPGRADE NOW</h2>

                  <h2 className="text-2xl md:text-3xl font-extrabold text-center select-none mb-8 text-white font-sans [text-shadow:_0_4px_6px_rgba(0,0,0,0.6)] transform -skew-y-5 tracking-wider">{t('upgrade_now')}</h2>

                  <div className="w-full max-w-2xl px-4">
                    <AdsOfferSlider isUpgradePrompt={false} showHeader={false} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        , document.getElementById('modal-root') || document.body)}
      </div>
    </PageContainer>
  );
};

export default ReportPhone;
