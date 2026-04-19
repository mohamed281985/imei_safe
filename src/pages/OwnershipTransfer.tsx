import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, History, ArrowLeft, AlertCircle, CheckCircle, XCircle, Image as ImageIcon, ChevronDown, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { processArabicTextWithEncoding as processArabicText, loadArabicFontSafe as loadArabicFont } from '../utils/pdf/arabic-enhanced-date-fix';
import imageCompression from 'browser-image-compression';
import { Share } from '@capacitor/share';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Logo from '@/components/Logo';
import BackButton from '@/components/BackButton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '../contexts/AuthContext';
import ImageUploader from '@/components/ImageUploader';
import { storeSellerIdForTransfer } from '../utils/sellerIdHelper';
import ImageViewer from '@/components/ImageViewer';
import CountryCodeSelector from '../components/CountryCodeSelector';
import PageContainer from '@/components/PageContainer';

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

  // إظهار آخر رقمين أولاً ثم النجوم (بدون مسافات)
  return lastTwoDigits + '*'.repeat(Math.max(0, cleanPhone.length - 2));
};

// إخفاء رقم البطاقة: إظهار آخر 4 أرقام أولاً ثم النجوم
const maskIdNumber = (idNumber: string): string => {
  if (!idNumber) return '';

  // إزالة أي أحرف غير رقمية
  const cleanId = idNumber.replace(/\D/g, '');

  if (cleanId.length <= 2) return cleanId;

  // الحصول على آخر رقمين
  const lastTwoDigits = cleanId.slice(-2);

  // إظهار آخر رقمين أولاً ثم النجوم (بدون مسافات)
  return lastTwoDigits + '*'.repeat(Math.max(0, cleanId.length - 2));
};

const OwnershipTransfer: React.FC = () => {
  // تعريف جميع متغيرات الحالة في الأعلى
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [imei, setImei] = useState('');
  const [phoneType, setPhoneType] = useState('');
  const [phoneImage, setPhoneImage] = useState<string>('');
  
  // حالة عرض الصور المكبرة
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [sellerName, setSellerName] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [sellerPhoneIsMasked, setSellerPhoneIsMasked] = useState(false);
  const [sellerIdLast6, setSellerIdLast6] = useState('');
  const [sellerIdIsMasked, setSellerIdIsMasked] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerCountryCode, setBuyerCountryCode] = useState('+20');
  const [buyerIdLast6, setBuyerIdLast6] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [paid, setPaid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isPhoneReported, setIsPhoneReported] = useState<boolean | null>(null);
  const [isImeiRegistered, setIsImeiRegistered] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isBlockedForTransfer, setIsBlockedForTransfer] = useState(false);
  const [activeReportWarning, setActiveReportWarning] = useState<string | null>(null);
  const [receiptImage, setReceiptImage] = useState<string>('');
  const [originalReceiptImage, setOriginalReceiptImage] = useState<string>('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [sellerPassword, setSellerPassword] = useState('');
  const [pendingDownload, setPendingDownload] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTransferDetails, setShowTransferDetails] = useState(false);

  const [showSigningWarningDialog, setShowSigningWarningDialog] = useState(false);
  // مفتاح التخزين المحلي
  const LOCAL_STORAGE_KEY = 'ownershipTransferState';
  // دالة لحفظ الحالة في localStorage
  const saveStateToStorage = (state: any) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } catch {}
  };
  // دالة لاسترجاع الحالة من localStorage
  const loadStateFromStorage = () => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  };
  // عند تحميل الصفحة: استرجاع الحالة من التخزين المحلي
  useEffect(() => {
    const saved = loadStateFromStorage();
    if (saved) {
      setImei(saved.imei || '');
      setPhoneType(saved.phoneType || '');
      setPhoneImage(saved.phoneImage || '');
      setSellerName(saved.sellerName || '');
      setSellerPhone(saved.sellerPhone || '');
      setSellerPhoneIsMasked(!!saved.sellerPhoneIsMasked);
      setSellerIdLast6(saved.sellerIdLast6 || '');
      setSellerIdIsMasked(!!saved.sellerIdIsMasked);
      setBuyerName(saved.buyerName || '');
      setBuyerPhone(saved.buyerPhone || '');
      setBuyerCountryCode(saved.buyerCountryCode || '+20');
      setBuyerIdLast6(saved.buyerIdLast6 || '');
      setBuyerEmail(saved.buyerEmail || '');
      setPaid(!!saved.paid);
      setSuccess(!!saved.success);
      setIsPhoneReported(saved.isPhoneReported ?? null);
      setReceiptImage(saved.receiptImage || '');
      setOriginalReceiptImage(saved.originalReceiptImage || '');
      setShowPasswordDialog(!!saved.showPasswordDialog);
      setSellerPassword(saved.sellerPassword || '');
      setPendingDownload(!!saved.pendingDownload);
      setNewPassword(saved.newPassword || '');
      setConfirmNewPassword(saved.confirmNewPassword || '');
      setIsLoading(false);
      setShowTransferDetails(!!saved.showTransferDetails);
      setShowCancelDialog(!!saved.showCancelDialog);
    }
  }, []);
  // حفظ الحالة عند كل تغيير مهم
  useEffect(() => {
    saveStateToStorage({
      imei,
      phoneType,
      phoneImage,
      sellerName,
      sellerPhone,
      sellerPhoneIsMasked,
      sellerIdLast6,
      sellerIdIsMasked,
      buyerName,
      buyerPhone,
      buyerCountryCode,
      buyerIdLast6,
      buyerEmail,
      paid,
      success,
      isPhoneReported,
      receiptImage,
      originalReceiptImage,
      showPasswordDialog,
      sellerPassword,
      pendingDownload,
      newPassword,
      confirmNewPassword,
      isLoading,
      showTransferDetails,
      showCancelDialog
    });
  }, [imei, phoneType, phoneImage, sellerName, sellerPhone, sellerIdLast6, paid, success, isPhoneReported, receiptImage, originalReceiptImage, showPasswordDialog, sellerPassword, pendingDownload, newPassword, confirmNewPassword, isLoading, showTransferDetails, showCancelDialog]);
  const { t } = useLanguage();
  const { toast } = useToast();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://imei-safe.me';
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [currentSelfieType, setCurrentSelfieType] = useState<'seller' | 'buyer' | 'sellerId' | 'buyerId' | 'receipt' | null>(null);
  const { user } = useAuth(); // استخدام hook useAuth
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [debouncedImei, setDebouncedImei] = useState('');

  // الاسم المقنع للبائع للعرض
  const maskedSellerName = maskName(sellerName);
  // رقم الهاتف المقنع للبائع للعرض
  const maskedSellerPhone = sellerPhoneIsMasked ? sellerPhone : maskPhone(sellerPhone);
  // رقم البطاقة المقنع للبائع للعرض
  const maskedSellerId = sellerIdIsMasked ? sellerIdLast6 : maskIdNumber(sellerIdLast6);

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
  // دالة لتحميل ومشاركة ملف PDF فقط (بدون نقل ملكية)
  // عند الضغط على زر تحميل مستند الملكية، يظهر مربع كلمة مرور البائع
  const handleDownloadTransferPdf = () => {
    // First, show the warning dialog to the user.
    setShowSigningWarningDialog(true);
  };

  // عند إدخال كلمة مرور البائع بشكل صحيح، يتم تحميل المستند
  const handleSellerPasswordForDownload = async () => {
    setIsLoading(true);
    try {
      // تحقق من كلمة مرور البائع (نفس منطق التحقق المستخدم في النقل)
      if (!sellerPassword) {
        toast({
          title: t('password_required'),
          description: t('enter_seller_current_password'),
          variant: 'destructive'
        });
        setIsLoading(false);
        return;
      }
      // تحقق من كلمة المرور عبر نقطة نهاية السيرفر (لا تجلب الهاش إلى العميل)
      let jwtToken = '';
      try {
        const { data: { session } } = await supabase.auth.getSession();
        jwtToken = session?.access_token || '';
      } catch (e) {
        try { const { data: { session } } = await supabase.auth.getSession(); jwtToken = session?.access_token || ''; } catch(e) { jwtToken = ''; }
      }

      try {
        const resp = await fetch(`${API_BASE_URL}/api/verify-seller-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {})
          },
          body: JSON.stringify({ imei, password: sellerPassword })
        });
        const verifyText = await resp.text();
        if (!verifyText) {
          console.error('Empty response body from /api/verify-seller-password, status:', resp.status);
          toast({ title: t('error'), description: t('error_fetching_data'), variant: 'destructive' });
          setIsLoading(false);
          return;
        }
        let json: any = null;
        try {
          json = JSON.parse(verifyText);
        } catch (err) {
          console.error('Failed to parse JSON from /api/verify-seller-password:', err, 'responseText:', verifyText);
          toast({ title: t('error'), description: t('error_fetching_data'), variant: 'destructive' });
          setIsLoading(false);
          return;
        }
        if (!resp.ok) {
          toast({ title: t('error'), description: json.error || t('error_fetching_data'), variant: 'destructive' });
          setIsLoading(false);
          return;
        }
        if (!json.ok) {
          toast({ title: t('incorrect_password'), description: t('seller_password_incorrect'), variant: 'destructive' });
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.error('verify password error:', err);
        toast({ title: t('error'), description: t('error_fetching_data'), variant: 'destructive' });
        setIsLoading(false);
        return;
      }
      // كلمة المرور صحيحة، حمل المستند
      await generateTransferPdf();
      setShowTransferDetails(true);
      setPendingDownload(false);
      setShowPasswordDialog(false);
    } catch (error) {
      toast({
        title: t('error'),
        description: t('error_downloading_transfer_document'),
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // This function is called when the user confirms the warning dialog.
  const handleProceedToDownload = () => {
    setShowSigningWarningDialog(false); // Close the warning dialog
    setPendingDownload(true);
    setShowPasswordDialog(true); // Open the password dialog
  };

  const [currentPhoneReport, setCurrentPhoneReport] = useState<any>(null); // لتخزين بلاغ الهاتف الحالي

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, setImage: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation: allowed types and max size
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSizeBytes = 5 * 1024 * 1024; // 5 MB

    if (!allowedTypes.includes(file.type)) {
      toast({ title: t('invalid_file_type') || 'نوع الملف غير مدعوم', description: t('please_upload_images_only') || 'يرجى رفع صور فقط (jpg, png, webp)', variant: 'destructive' });
      e.currentTarget.value = '';
      return;
    }

    if (file.size > maxSizeBytes) {
      toast({ title: t('file_too_large') || 'حجم الملف كبير', description: `الحد الأقصى المسموح به هو 5 ميغابايت.`, variant: 'destructive' });
      e.currentTarget.value = '';
      return;
    }

    try {
      toast({ description: t('compressing_image') || 'جاري ضغط الصورة...' });
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, initialQuality: 0.8 } as any;
      const compressedFile = await imageCompression(file, options);
      const previewUrl = URL.createObjectURL(compressedFile as File);
      setImage(previewUrl);
    } catch (err) {
      // fallback to simple DataURL
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
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
      console.error("Camera error:", err);
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

          // تحويل الكانفاس إلى صورة بتنسيق JPEG عالي الجودة
          const imageData = canvas.toDataURL('image/jpeg', 0.9);

          // تعيين الصورة حسب النوع
          if (currentSelfieType === 'receipt') {
            setReceiptImage(imageData);
            toast({
              title: t('success'),
              description: t('receipt_captured'),
              variant: 'default'
            });
          }
          closeCamera();
        }
      } catch (error) {
        console.error(t('error_capturing_photo'), error);
        toast({
          title: t('error_capturing_photo'),
          description: t('try_again'),
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

  // دالة لإظهار التاريخ العربي بشكل صحيح ومتصل
  function formatArabicDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    const second = date.getSeconds().toString().padStart(2, '0');
    const ampm = date.getHours() < 12 ? 'ص' : 'م';
    return `${year}/${month}/${day} ${hour}:${minute}:${second} ${ampm}`;
  }

  const generateTransferPdf = async () => {
    console.log('Starting PDF generation...');
    const doc = new jsPDF();
    let fontForTable = 'helvetica'; // الخط الافتراضي للجدول

    // محتوى الـ PDF
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    const xPosRight = pageWidth - margin;

    // --- Font Loading for Arabic Support ---
    // jsPDF's default fonts do not support Arabic. We must load a custom font.
    // This example assumes you have 'Amiri-Regular.ttf' in your `public/fonts` directory.
    const fontLoaded = await loadArabicFont(doc);
    if (fontLoaded) {
      fontForTable = 'Amiri'; // استخدام الخط العربي للجدول إذا نجح التحميل
      console.log('Arabic font loaded successfully');
    } else {
      console.warn("Could not load Arabic font. Using fallback font.");
      doc.setFont('helvetica');
      toast({
        title: t('font_load_error_title') || 'خطأ في تحميل الخط',
        description: t('font_load_error_desc') || 'لم نتمكن من تحميل الخط العربي. قد لا يتم عرض النصوص العربية بشكل صحيح.',
        variant: 'default',
      });
    }

    // Set font before starting
    doc.setFont('Amiri');
    doc.setFontSize(22);
    doc.text(processArabicText("إيصال نقل ملكية هاتف"), xPosRight, 25, { align: 'right' });

    doc.setFont('Amiri');
    doc.setFontSize(12);
    const dateLine = `تاريخ العملية: ${formatArabicDate(new Date())}`;
    doc.text(processArabicText(dateLine), xPosRight, 35, { align: 'right' });

    doc.setLineWidth(0.5);
    doc.line(margin, 45, pageWidth - margin, 45);

    // Configure table with Arabic text support
    autoTable(doc, {
      startY: 55,
      head: [[processArabicText('البيان'), processArabicText('التفاصيل')]],
      body: [
        [processArabicText(phoneType), processArabicText('نوع الهاتف')],
        [imei, processArabicText('الرقم التسلسلي (IMEI)')],
      ],
      theme: 'grid',
      styles: {
        font: fontForTable,
        halign: 'right'
      },
      headStyles: { 
        fillColor: [41, 128, 185],
        textColor: 255,
        fontSize: 12,
        fontStyle: 'normal'
      },
      bodyStyles: {
        fontSize: 10,
        font: fontForTable
      },
      columnStyles: {
        0: { halign: 'right', font: fontForTable },
        1: { halign: 'right', font: fontForTable }
      },
      didParseCell: (data) => {
        // Ensure font is set for each cell
        data.cell.styles.font = fontForTable;
      },
      willDrawCell: () => {
        doc.setFont(fontForTable);
      },
      didDrawCell: () => {
        doc.setFont(fontForTable);
      },
      didDrawPage: () => { 
        doc.setFont(fontForTable);
      }
    });

    const finalYAfterFirstTable = (doc as any).lastAutoTable.finalY;

    doc.setFontSize(16);
    doc.text(processArabicText('تفاصيل الأطراف'), xPosRight, finalYAfterFirstTable + 15, { align: 'right' });

    autoTable(doc, {
      startY: finalYAfterFirstTable + 20,
      body: [
        [{ content: processArabicText('بيانات البائع (المالك السابق)'), colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [230, 230, 230], textColor: 0 } }],
        [processArabicText(sellerName), processArabicText('الاسم')],
        [processArabicText(sellerPhone), processArabicText('رقم الهاتف')],
        [processArabicText(sellerIdLast6), processArabicText('آخر 6 أرقام من البطاقة')],
        [{ content: processArabicText('بيانات المشتري (المالك الجديد)'), colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [230, 230, 230], textColor: 0 } }],
        [processArabicText(buyerName), processArabicText('الاسم')],
        [processArabicText(buyerPhone), processArabicText('رقم الهاتف')],
        [processArabicText(buyerIdLast6), processArabicText('آخر 6 أرقام من البطاقة')],
        [processArabicText(buyerEmail), processArabicText('البريد الإلكتروني')],
      ],
      theme: 'grid',
      styles: {
        font: fontForTable,
        halign: 'right',
        fontSize: 10
      },
      bodyStyles: {
        font: fontForTable
      },
      columnStyles: {
        0: { halign: 'right' },
        1: { halign: 'right', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        data.cell.styles.font = fontForTable;
      },
      willDrawCell: () => {
        doc.setFont(fontForTable);
      },
      didDrawCell: () => {
        doc.setFont(fontForTable);
      },
      didDrawPage: () => {
        doc.setFont(fontForTable);
      }
    });

    // إضافة إقرارات البيع
    const finalYAfterSecondTable = (doc as any).lastAutoTable.finalY + 15;
    
    doc.setFont(fontForTable);
    doc.setFontSize(10);

    // إضافة نص البيع
    autoTable(doc, {
      startY: finalYAfterSecondTable,
      body: [
        [processArabicText(`- باع الطرف الأول إلى الطرف الثاني ماهو عباره عن هاتف محمول ماركة ${phoneType} الرقم المتسلسل للهاتف "IMEI" هو ${imei}`)],
        [processArabicText(`- تم هذا البيع نظير ثمن إجمالي قدره (......................) جنيه مصري دفعها الطرف الثاني للطرف الأول في مجلس العقد وتسلمها بيده وأصبح الثمن خالص وأقر الطرف الأول أنه مالك هذا المحمول وفى حالة ظهور أى محضر سرقة خاص بهذا المحمول يكون هو وحده المسئول عن هذا البلاغ من الناحية الجنائية.`)],
      ],
      theme: 'plain',
      styles: {
        font: fontForTable,
        halign: 'right',
        fontSize: 10,
        cellPadding: 2,
        overflow: 'linebreak'
      },
      columnStyles: {
        0: { 
          halign: 'right',
          cellWidth: pageWidth - 28 // 14px margin on each side
        }
      },
      margin: { left: 14, right: 14 }
    });

    // إضافة مكان التوقيعات
    const finalYAfterText = (doc as any).lastAutoTable.finalY + 20;

    // جدول التوقيعات
    autoTable(doc, {
      startY: finalYAfterText,
      body: [
        [{ content: processArabicText('توقيع البائع'), styles: { fontStyle: 'bold' } }, processArabicText('رقمه القومي')],
        [{ content: '............................', styles: { halign: 'center' } }, { content: '............................', styles: { halign: 'center' } }],
        [{ content: processArabicText('توقيع المشتري'), styles: { fontStyle: 'bold' } }, processArabicText('رقمه القومي')],
        [{ content: '............................', styles: { halign: 'center' } }, { content: '............................', styles: { halign: 'center' } }],
      ],
      theme: 'plain',
      styles: {
        font: fontForTable,
        halign: 'right',
        fontSize: 10
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 'auto' }
      }
    });

    // حفظ ومشاركة الملف
    const fileName = `transfer_receipt_${imei}.pdf`;
    if (Capacitor.isNativePlatform()) {
      try {
        const base64Data = doc.output('datauristring').split(',')[1];
        const result = await Filesystem.writeFile({ path: fileName, data: base64Data, directory: Directory.Cache, recursive: true });
        await Share.share({ title: fileName, text: processArabicText('إيصال نقل ملكية هاتف'), url: result.uri, dialogTitle: processArabicText('مشاركة أو حفظ الإيصال') });
      } catch (e: any) {
        console.error('Unable to write or share PDF file', e);
        if (!e.message?.includes('Share canceled')) {
          toast({ title: t('error'), description: t('error_sharing_pdf'), variant: 'destructive' });
        }
      }
    } else {
      doc.save(fileName);
    }
  };

  // تحديث حالة IMEI فقط عند الإدخال
  const handleImeiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    setImei(value);
  };

  // تأثير لتأخير التحقق من IMEI (Debouncing)
  useEffect(() => {
    // مسح البيانات السابقة عند كل تغيير في IMEI
    setSellerName('');
    setSellerPhone('');
    setSellerPhoneIsMasked(false);
    setSellerIdLast6('');
    setSellerIdIsMasked(false);
    setPhoneType('');
    setPhoneImage('');
    setOriginalReceiptImage('');
    setIsPhoneReported(null);
    setShowRegisterDialog(false); // إخفاء الحوار عند الإدخال الجديد

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
      // reset per-IMEI blocking state before each fetch
      setIsBlockedForTransfer(false);
      setIsLoading(true);
      try {
        // Use server endpoint to get masked/registered info (server handles decryption & auth)
        let jwtToken = '';
        try { const { data: { session } } = await supabase.auth.getSession(); jwtToken = session?.access_token || ''; } catch(e) { jwtToken = ''; }

        const resp = await fetch(`${API_BASE_URL}/api/check-imei`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {}) },
          body: JSON.stringify({ imei: debouncedImei, userId: user?.id || null })
        });
        if (!resp.ok) {
          if (resp.status === 404) {
            setShowRegisterDialog(true);
            setIsPhoneReported(false);
            setIsLoading(false);
            return;
          }
          const txt = await resp.text().catch(() => null);
          throw new Error(txt || `Server responded with ${resp.status}`);
        }

        const registeredPhone = await resp.json().catch(() => null);

        if (!registeredPhone) {
          setShowRegisterDialog(true);
          setIsPhoneReported(false);
          setIsLoading(false);
          return;
        }

        // support multiple response shapes similar to BusinessTransferbuy
        const pick = (obj: any, keys: string[]) => {
          if (!obj) return '';
          for (const k of keys) {
            if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).toString().trim() !== '') return obj[k];
          }
          return '';
        };

        if (registeredPhone && registeredPhone.phoneDetails) {
          const details = registeredPhone.phoneDetails;
          const isOwnedByCurrentUser = (details.user_id && user && details.user_id === user.id) || registeredPhone.isOwnReport === true;
          if (isOwnedByCurrentUser) {
            setSellerName(details.maskedOwnerName || pick(details, ['owner_name', 'ownerName']) || '');
            if (details.maskedPhoneNumber) {
              setSellerPhone(details.maskedPhoneNumber);
              setSellerPhoneIsMasked(true);
            } else {
              setSellerPhone(pick(details, ['phone_number', 'owner_phone', 'ownerPhone']) || '');
              setSellerPhoneIsMasked(false);
            }
            if (details.maskedIdLast6) {
              setSellerIdLast6(details.maskedIdLast6);
              setSellerIdIsMasked(true);
            } else {
              setSellerIdLast6(pick(details, ['id_last6', 'owner_id_last6', 'ownerIdLast6']) || '');
              setSellerIdIsMasked(false);
            }
            setPhoneType(pick(details, ['phone_type', 'phoneType', 'model']) || '');
            setPhoneImage(pick(details, ['phone_image_url', 'phoneImageUrl', 'phone_image']) || '');
            setOriginalReceiptImage(pick(details, ['receipt_image_url', 'receiptImageUrl']) || '');
            setIsPhoneReported(false);
            setIsLoading(false);
            return;
          }

          // Registered to another user — block transfer and DO NOT display sensitive data
          setIsBlockedForTransfer(true);
          setIsImeiRegistered(true);
          setIsReadOnly(true);
          setSellerName('');
          setSellerPhone('');
          setSellerPhoneIsMasked(false);
          setSellerIdLast6('');
          setSellerIdIsMasked(false);
          setPhoneType('');
          setPhoneImage('');
          setOriginalReceiptImage('');
          setActiveReportWarning(t('this_phone_registered_to_another_account'));
          toast({ title: t('access_denied'), description: t('this_phone_registered_to_another_account'), variant: 'destructive' });
          setIsLoading(false);
          return;
        } else if (registeredPhone && registeredPhone.exists) {
          // exists but no details
          if (registeredPhone.hasActiveReport) {
            setIsPhoneReported(true);
            setCurrentPhoneReport(registeredPhone.report || { isStolen: registeredPhone.isStolen, isOwnReport: registeredPhone.isOwnReport });
            toast({ title: t('warning'), description: t('phone_has_active_report'), variant: 'destructive' });
            setIsLoading(false);
            return;
          }

          if (registeredPhone.isOtherUser || registeredPhone.isTransferred) {
            // Phone belongs to another user or already transferred — block transfer
            setIsBlockedForTransfer(true);
            setIsImeiRegistered(true);
            setIsReadOnly(true);
            setSellerName('');
            setSellerPhone('');
            setSellerPhoneIsMasked(false);
            setSellerIdLast6('');
            setSellerIdIsMasked(false);
            setPhoneType('');
            setPhoneImage('');
            setOriginalReceiptImage('');
            setActiveReportWarning(t('this_phone_registered_to_another_account'));
            toast({ title: t('access_denied'), description: t('this_phone_registered_to_another_account'), variant: 'destructive' });
            setIsLoading(false);
            return;
          }
        }

        // fallback handled above (registeredPhone shape); if we reach here show register dialog
        setShowRegisterDialog(true);
      } catch (error) {
        console.error('Error fetching masked IMEI info:', error);
        toast({ title: t('error'), description: t('error_fetching_data'), variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
        };
        fetchData();
      }, [debouncedImei, t, toast, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBlockedForTransfer) {
      toast({ title: t('access_denied'), description: t('this_phone_registered_to_another_account'), variant: 'destructive' });
      return;
    }
    setIsLoading(true);

    try {
      if (!imei || !buyerName || !buyerPhone || !sellerName) { // التأكد من وجود اسم البائع أيضاً
        toast({ title: 'خطأ', description: 'يرجى ملء جميع الحقول المطلوبة', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      // التحقق من وجود الهاتف عبر نقطة نهاية السيرفر (لا تعيد بيانات حساسة مفكوكة)
      try {
        let jwtToken = '';
        try { const { data: { session } } = await supabase.auth.getSession(); jwtToken = session?.access_token || ''; } catch(e) { jwtToken = ''; }
        const resp = await fetch(`${API_BASE_URL}/api/check-imei`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {}) },
          body: JSON.stringify({ imei })
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => null);
          if (resp.status === 404) {
            toast({ title: 'خطأ', description: 'الهاتف غير مسجل.', variant: 'destructive' });
          } else {
            toast({ title: 'خطأ', description: errText || `خطأ من السيرفر: ${resp.status}`, variant: 'destructive' });
          }
          setIsLoading(false);
          return;
        }

        const phone = await resp.json().catch(() => null);
        const isRegistered = (phone?.isRegistered ?? phone?.exists ?? !!phone?.phoneDetails) === true;
        if (!isRegistered) {
          toast({ title: 'خطأ', description: 'لم يتم العثور على الهاتف في قاعدة البيانات للتسجيل الأولي', variant: 'destructive' });
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.error('Error checking IMEI via server:', err);
        toast({ title: 'خطأ', description: 'لم يتم العثور على الهاتف في قاعدة البيانات للتسجيل الأولي', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      // تعديل هنا: استخدام Dialog بدلاً من prompt للتهنئة وطلب كلمة المرور
      // نقوم بإظهار Dialog مخصضص بدلاً من استخدام prompt
      setShowPasswordDialog(true);
      setIsLoading(false);
      return;
      
      // تم نقل الكود التالي إلى دالة handlePasswordSubmit
    } catch (error) {
      console.error("Error during ownership transfer:", error);
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

      // 3. طلب نقل الملكية للسيرفر ليعالج التحديثات الحساسة (التشفير، السجلات، إلخ)
      try {
        let jwtToken = '';
        try { const { data: { session } } = await supabase.auth.getSession(); jwtToken = session?.access_token || ''; } catch(e) { jwtToken = ''; }

        const transferPayload: any = {
          imei,
          sellerPassword,
          newOwner: {
            owner_name: buyerName,
            phone_number: `${buyerCountryCode}${buyerPhone}`,
            id_last6: buyerIdLast6 || null,
            email: user && user.role === 'business' ? user.email : (buyerEmail || null),
            phone_type: phoneType || null,
            password: newPassword,
            user_id: null // let server lookup buyer by email; do NOT send current seller id
          },
          new_receipt_image_url: newReceiptImageUrl || null
        };

        const resp = await fetch(`${API_BASE_URL}/api/transfer-ownership`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {}) },
          body: JSON.stringify(transferPayload)
        });

        const transferText = await resp.text();
        if (!transferText) {
          console.error('Empty response body from /api/transfer-ownership, status:', resp.status);
          toast({ title: 'خطأ', description: 'Transfer failed', variant: 'destructive' });
          setIsLoading(false);
          return;
        }
        let json: any = null;
        try {
          json = JSON.parse(transferText);
        } catch (err) {
          console.error('Failed to parse JSON from /api/transfer-ownership:', err, 'responseText:', transferText);
          toast({ title: 'خطأ', description: 'Transfer failed', variant: 'destructive' });
          setIsLoading(false);
          return;
        }
        if (!resp.ok) {
          console.error('transfer-ownership failed:', json);
          toast({ title: 'خطأ', description: json.error || 'Transfer failed', variant: 'destructive' });
          setIsLoading(false);
          return;
        }

        // نجاح النقل
        console.log('✅ transfer-ownership response:', json);
      } catch (err) {
        console.error('خطأ أثناء طلب نقل الملكية للسيرفر:', err);
        toast({ title: 'خطأ', description: 'حدث خطأ أثناء معالجة النقل', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      // 6) إنشاء ومشاركة ملف PDF
      // تم نقل تحميل ومشاركة ملف PDF إلى زر منفصل

      // 7) عرض رسالة النجاح وإعادة التوجيه
      toast({
        title: 'تمت العملية بنجاح',
        description: 'تم تحديث كلمة المرور ونقل ملكية الهاتف بنجاح.',
        className: "bg-gradient-to-r from-green-500 to-green-600 text-white font-bold rtl"
      });

      setShowPasswordDialog(false);
      // إعادة تعيين الحالة بالكامل ومسح التخزين المحلي ثم التوجيه
      setImei('');
      setIsBlockedForTransfer(false);
      setPhoneType('');
      setPhoneImage('');
      setSellerName('');
      setSellerPhone('');
      setSellerPhoneIsMasked(false);
      setSellerIdLast6('');
      setSellerIdIsMasked(false);
      setBuyerName('');
      setBuyerPhone('');
      setBuyerIdLast6('');
      setBuyerEmail('');
      setPaid(false);
      setSuccess(false); // التأكد من عدم عرض رسالة النجاح على الصفحة
      setIsPhoneReported(null);
      setReceiptImage('');
      setOriginalReceiptImage('');
      setSellerPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPendingDownload(false);
      setShowTransferDetails(false);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      navigate('/dashboard'); // التوجيه الفوري إلى الصفحة الرئيسية
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

  // يجب استدعاء setCurrentPhoneReport عند الحاجة، مثلاً عند اختيار بلاغ معين للتعامل معه
  // هذا الجزء من الكود غير مكتمل في الملف الأصلي لكيفية تعيين currentPhone

  useEffect(() => {
    // تم إزالة التوجيه التلقائي عند الخروج من الصفحة
  }, []);

  useEffect(() => {
    const fetchBusinessData = async () => {
      // Check if the user is a business user
      if (user && user.role === 'business') {
        setIsLoading(true);
        try {
          const { data, error } = await supabase
            .from('businesses')
            .select('store_name, phone')
            .eq('user_id', user.id)
            .single();

          if (error) {
            throw error;
          }

          if (data) {
            console.log('🏢 [Effect] Business data fetched:', data);
            // استخدام setTimeout لضمان تحديث الحالة بشكل صحيح
            setTimeout(() => {
              setBuyerName(data.store_name || '');
              setBuyerPhone(data.phone || '');
              setBuyerEmail(user.email || ''); // ملء البريد الإلكتروني من بيانات المستخدم
              console.log('🏢 [Effect] Buyer fields updated:', {
                buyerName: data.store_name || '',
                buyerPhone: data.phone || '',
                buyerEmail: user.email || ''
              });
            }, 100);

            toast({
              title: 'بيانات المتجر',
              description: 'تم ملء بيانات المشتري تلقائياً.',
            });
          }
        } catch (error) {
          console.error('Error fetching business data:', error);
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
      {isCameraOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-imei-darker rounded-xl p-4 w-full max-w-md">
            <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg mb-4" />
            <div className="flex justify-center gap-4">
              <Button onClick={captureSelfie} className="bg-imei-cyan hover:bg-cyan-700 text-white py-2 px-4 rounded-xl font-bold">
                {t('capture')}
              </Button>
              <Button onClick={closeCamera} className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-xl font-bold">
                {t('cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="rounded-xl shadow-lg p-2 sm:p-8 w-full my-8">

        <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <DialogContent className="bg-imei-darker text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-blue text-xl mb-2 text-center text-gray-800">
                {t('cancel_ownership_transfer')}
              </DialogTitle>
              <DialogDescription className="text-white mb-6 text-center">
                {t('cancel_transfer_confirmation')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-center">
              <Button
                variant="outline"
                onClick={() => setShowCancelDialog(false)}
                className="text-white border-gray-600 hover:bg-gray-700"
              >
                {t('no')}
              </Button>
              <Button
                onClick={() => {
                  setShowCancelDialog(false);
                  // إعادة تعيين كل الحقول المتعلقة بالعملية ومسح التخزين المحلي
                  setImei('');
                  setIsBlockedForTransfer(false);
                  setPhoneType('');
                  setPhoneImage('');
                  setSellerName('');
                    setSellerPhone('');
                    setSellerPhoneIsMasked(false);
                    setSellerIdLast6('');
                    setSellerIdIsMasked(false);
                  setBuyerName('');
                  setBuyerPhone('');
                  setBuyerIdLast6('');
                  setBuyerEmail('');
                  setPaid(false);
                  setSuccess(false);
                  setIsPhoneReported(null);
                  setReceiptImage('');
                  setOriginalReceiptImage('');
                  setShowPasswordDialog(false);
                  setSellerPassword('');
                  setNewPassword('');
                  setConfirmNewPassword('');
                  setPendingDownload(false);
                  setShowTransferDetails(false);
                  localStorage.removeItem(LOCAL_STORAGE_KEY);
                  toast({ title: 'تم الإلغاء', description: 'تم إلغاء عملية نقل الملكية بنجاح.', variant: 'default' });
                  navigate('/dashboard'); // التوجيه إلى الصفحة الرئيسية
                }}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                {t('yes')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showSigningWarningDialog} onOpenChange={setShowSigningWarningDialog}>
          <DialogContent className="bg-imei-darker text-white border-2 border-red-500 shadow-lg shadow-red-500/20 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-400 text-xl mb-2 text-center flex items-center justify-center gap-2">
                <AlertCircle className="w-6 h-6" />
                {t('important_warning_before_download')}
              </DialogTitle>
              <DialogDescription className="text-white mb-6 text-center">
                {t('after_signing_return_and_capture_receipt')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-center">
              <Button
                variant="outline"
                onClick={() => setShowSigningWarningDialog(false)}
                className="text-white border-gray-600 hover:bg-gray-700"
              >
                {t('cancel')}
              </Button>
              <Button onClick={handleProceedToDownload} className="bg-red-500 hover:bg-red-600 text-white">
                {t('proceed_and_download_document')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex justify-center mb-4">
          <Logo size="lg" />
        </div>

        <div className="flex items-center mb-6 pt-3" style={{ background: 'linear-gradient(to top, rgb(5, 48, 96) 0%, rgb(10, 77, 140) 100%)', padding: '0.3rem', borderRadius: '1rem', marginTop: '1rem' }}>
          <BackButton />
          <h1 className="flex-1 text-center text-2xl font-bold" style={{ color: '#ffffff' }}>{t('transfer_ownership')}</h1>
        </div>

        {isLoading && <p className="text-center text-white my-4">{t('loading')}...</p>}

        {success ? (
          <div className="text-green-500 text-center text-lg font-semibold py-8">
            {t('ownership_transferred')}
          </div>
        ) : (
          <div>
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-8">
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                <div className="flex-1">
                  <label className="block text-black mb-1 text-sm sm:text-base font-semibold">
                    {t('imei_number')}
                  </label>
                  <input
                    type="text"
                    value={imei}
                    onChange={handleImeiChange}
                    className="input-field w-full text-base sm:text-lg py-3 px-3"
                    maxLength={15}
                    required
                    disabled={isLoading}
                    placeholder={t('enter_imei')}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-gray-800 mb-1 text-sm sm:text-base font-semibold">
                    {t('phone_type')}
                  </label>
                  <input
                    type="text"
                    value={phoneType}
                    onChange={(e) => setPhoneType(e.target.value)}
                    className="input-field w-full text-base sm:text-lg py-3 px-3"
                    required
                    disabled={isLoading}
                    placeholder={t('phone_type')}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mt-2">
                <div className="flex-1 space-y-4 sm:space-y-6">
                  <h3 className="text-gray-800 font-semibold text-xl border-b border-imei-cyan pb-2">
                    {t('seller_info')}
                  </h3>
                  <div>
                    <label className="block text-gray-800 mb-1 font-semibold">{t('seller_name')}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={maskedSellerName}
                        className="input-field w-full bg-gray-200 border-imei-cyan/30 text-gray-800"
                        readOnly
                      />
                      <input type="hidden" value={sellerName} name="original_seller_name" />
                    </div>
                    <p className="text-xs text-blue-700 mt-1">
                      {t('seller_name_hidden_for_privacy')}
                    </p>
                  </div>
                  <div>
                    <label className="block text-gray-800 mb-1 font-semibold">
                      {t('id_number')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={maskedSellerId}
                        dir="rtl"
                        className="input-field w-full bg-gray-200 border-imei-cyan/30 text-gray-800 text-right"
                        readOnly
                      />
                      <input type="hidden" value={sellerIdLast6} name="original_seller_id" />
                    </div>
                    <p className="text-xs text-blue-700 mt-1">
                      {t('shows_last_4_digits_only')}
                    </p>
                  </div>
                  <div>
                    <label className="block text-gray-800 mb-1 font-semibold">
                      {t('seller_phone')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={maskedSellerPhone}
                        dir="rtl"
                        className="input-field w-full bg-gray-200 border-imei-cyan/30 text-gray-800 text-right"
                        readOnly
                      />
                      <input type="hidden" value={sellerPhone} name="original_seller_phone" />
                    </div>
                    <p className="text-xs text-blue-700 mt-1">
                      {t('shows_last_2_digits_only')}
                    </p>
                  </div>
                  {phoneImage && (
                    <div className="space-y-2">
                      <label className="block text-gray-800 mb-1 font-semibold">{t('phone_image')}</label>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedImage(phoneImage);
                          setIsImageViewerOpen(true);
                        }}
                        className="w-full cursor-pointer"
                      >
                        <img
                          src={phoneImage}
                          alt={t('phone_image')}
                          className="w-full h-48 object-contain rounded-lg shadow-lg bg-gray-200 p-2 border border-imei-cyan/30 transition-transform hover:scale-[1.02]"
                        />
                      </button>
                    </div>
                  )}
                  {originalReceiptImage && (
                    <div className="space-y-2">
                      <label className="block text-gray-800 mb-1 font-semibold">{t('receipt_image')}</label>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedImage(originalReceiptImage);
                          setIsImageViewerOpen(true);
                        }}
                        className="w-full cursor-pointer"
                      >
                        <img
                          src={originalReceiptImage}
                          alt={t('receipt_image')}
                          className="w-full h-48 object-contain rounded-lg shadow-lg bg-gray-200 p-2 border border-imei-cyan/30 transition-transform hover:scale-[1.02]"
                        />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-4 sm:space-y-6">
                  <h3 className="text-gray-800 font-semibold text-xl border-b border-imei-cyan pb-2">
                    {t('buyer_info')}
                  </h3>
                  <div>
                    <label className="block text-gray-800 mb-1 font-semibold">{t('buyer_name')}</label>
                    <input
                      type="text"
                      value={buyerName}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        console.log('👤 [Input] Buyer name changed:', newValue);
                        setBuyerName(newValue);
                        // فرض تحديث الحالة فورًا
                        setTimeout(() => {
                          console.log('👤 [Input] Buyer name after timeout:', newValue);
                        }, 0);
                      }}
                      className="input-field w-full"
                      required
                      disabled={isLoading || user?.role === 'business'}
                      dir="rtl"
                      style={{ textAlign: 'right' }}
                      inputMode="text"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck="false"
                      onInput={(e) => {
                        console.log('👤 [Input] Input event:', e.currentTarget.value);
                      }}
                      onFocus={(e) => {
                        console.log('👤 [Input] Focus event');
                        e.currentTarget.select();
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-800 mb-1 font-semibold">{t('buyer_phone')}</label>
                    <div className="flex gap-2 items-center">
                      <CountryCodeSelector
                        value={buyerCountryCode}
                        onChange={setBuyerCountryCode}
                        disabled={isLoading || user?.role === 'business'}
                      />
                      <input
                        type="text"
                        value={buyerPhone}
                        onChange={(e) => {
                          const normalizeDigits = (s: string) =>
                            s
                              .replace(/[\u0660-\u0669]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660))
                              .replace(/[\u06F0-\u06F9]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06F0));
                          let raw = normalizeDigits(e.target.value).replace(/\D/g, '');
                          if (raw.startsWith('0')) raw = raw.replace(/^0+/, '');
                          setBuyerPhone(raw);
                        }}
                        dir="rtl"
                        className="input-field w-full text-right"
                        maxLength={15}
                        required
                        disabled={isLoading || user?.role === 'business'}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-800 mb-1 font-semibold">{t('id_number')}</label>
                    <input
                      type="text"
                      value={buyerIdLast6}
                      onChange={(e) => {
                        const normalizeDigits = (s: string) =>
                          s
                            .replace(/[\u0660-\u0669]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660))
                            .replace(/[\u06F0-\u06F9]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06F0));
                        const raw = normalizeDigits(e.target.value);
                        setBuyerIdLast6(raw.replace(/\D/g, ''));
                      }}
                      dir="rtl"
                      className="input-field w-full text-right"
                      maxLength={6}
                      placeholder={t('last_6_digits_of_id')}
                      disabled={isLoading || user?.role === 'business'}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-800 mb-1 font-semibold">{t('email')}</label>
                    <input
                      type="email"
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      className="input-field w-full"
                      placeholder="example@email.com"
                      disabled={isLoading || user?.role === 'business'}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 sm:space-y-6">
                {showTransferDetails && (
                  <div className="mb-4 bg-gray-800 p-4 rounded-xl border border-imei-cyan/30 hover:border-imei-cyan/60 transition-all duration-300 shadow-lg hover:shadow-xl w-full">
                    <div className="flex items-center mb-2">
                      <FileText className="w-6 h-6 mr-2 text-imei-cyan" />
                      <label className="text-lg font-bold text-imei-cyan">
                        {t('receipt_image')}
                      </label>
                    </div>
                    <div className="flex flex-col space-y-2">
                      {receiptImage ? (
                        <div className="relative group overflow-hidden rounded-lg">
                          <button
                            type="button"
                            className="w-full cursor-pointer"
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
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-sm"></div>
                          </button>
                        </div>
                      ) : (
                        <div className="h-40 border-2 border-dashed border-imei-cyan/20 rounded-lg flex flex-col items-center justify-center bg-gray-50 group hover:border-imei-cyan/40 transition-all duration-300">
                          <FileText className="w-16 h-16 text-imei-cyan/60 group-hover:text-imei-cyan/80 transition-colors duration-300" strokeWidth={1} />
                        </div>
                      )}
                      <div className="flex space-x-2 rtl:space-x-reverse">
                        <input
                          type="file"
                          id="receipt-upload"
                          ref={receiptFileInputRef}
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => handleImageUpload(e, setReceiptImage)}
                          className="hidden"
                          disabled={isBlockedForTransfer}
                        />
                        <label
                          htmlFor={isBlockedForTransfer ? undefined : 'receipt-upload'}
                          aria-disabled={isBlockedForTransfer}
                          className={`${isBlockedForTransfer ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''} flex-1 bg-gradient-to-r from-blue-800 via-blue-700 to-blue-800 hover:from-blue-700 hover:via-blue-600 hover:to-blue-700 text-white py-2 px-2 rounded-lg text-center transition-all duration-300 shadow hover:shadow-md flex items-center justify-center text-sm`}
                        >
                          <Upload className="w-4 h-4 ml-1 rtl:mr-1" />
                          {t('upload')}
                        </label>
                        <Button
                          type="button"
                          onClick={() => openCamera('receipt')}
                          disabled={isBlockedForTransfer}
                          className={`flex-1 bg-gradient-to-r from-cyan-800 via-cyan-700 to-cyan-800 hover:from-cyan-700 hover:via-cyan-600 hover:to-cyan-700 text-white py-2 px-2 rounded-lg transition-all duration-300 shadow hover:shadow-md flex items-center justify-center text-sm ${isBlockedForTransfer ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <Camera className="w-4 h-4 ml-1 rtl:mr-1" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="w-full flex justify-center mt-2 sm:mt-4">
                  {!showTransferDetails && (
                    <Button
                      type="button"
                      className={`bg-gradient-to-r from-blue-700 via-cyan-600 to-blue-700 text-white py-3 px-6 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all duration-300 ${isBlockedForTransfer ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => { if (isBlockedForTransfer) return; handleDownloadTransferPdf(); }}
                      disabled={isLoading || isBlockedForTransfer}
                      aria-disabled={isBlockedForTransfer}
                      title={isBlockedForTransfer ? t('this_phone_registered_to_another_account') : undefined}
                    >
                      {t('download_transfer_document')}
                    </Button>
                  )}
                </div>
              </div>

              {showTransferDetails && (
                <div className="text-center">
                  <div className="flex gap-4">
                    <Button
                      type="submit"
                      className="flex-1 bg-imei-cyan hover:bg-imei-cyan-dark text-white py-3 px-4 rounded-xl font-bold transition-all duration-300 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30"
                      disabled={isLoading || isPhoneReported === true || isBlockedForTransfer}
                    >
                      {isLoading ? t('processing') : t('transfer_ownership')}
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </div>
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
                  setIsBlockedForTransfer(false);
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
          <DialogContent className="bg-imei-darker text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-imei-cyan text-xl mb-2 text-center">
                {pendingDownload
                  ? t('download_transfer_document')
                  : t('transfer_ownership')}
              </DialogTitle>
              <DialogDescription className="text-gray-300 mb-6 text-center">
                {pendingDownload
                  ? t('enter_seller_password_to_download_document')
                  : t('enter_passwords_to_complete_transfer')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-gray-800 text-sm font-semibold mb-1">
                  {t('seller_current_password')}
                </label>
                <Input
                  type="password"
                  value={sellerPassword}
                  onChange={(e) => setSellerPassword(e.target.value)}
                  className="bg-white border-imei-cyan text-gray-800"
                  placeholder={t('enter_seller_current_password')}
                  disabled={isLoading}
                  required
                />
                {!sellerPassword && (
                  <p className="text-xs text-red-400 mt-1">{t('password_required')}</p>
                )}
              </div>

              {!pendingDownload && (
                <div className="space-y-2">
                  <label className="block text-gray-800 text-sm font-semibold mb-1">
                    {t('buyer_new_password')}
                  </label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-white border-imei-cyan text-gray-800"
                    placeholder={t('min_6_characters')}
                    disabled={isLoading}
                    required
                  />
                  {!newPassword && (
                    <p className="text-xs text-red-400 mt-1">
                      {t('password_required')}
                    </p>
                  )}
                  {newPassword && newPassword.length < 6 && (
                    <p className="text-xs text-red-400 mt-1">
                      {t('password_min_6_chars')}
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowPasswordDialog(false);
                  setPendingDownload(false);
                }}
                className="text-white border-gray-600 hover:bg-gray-700"
                disabled={isLoading}
              >
                {t('cancel')}
              </Button>
              {pendingDownload ? (
                <Button
                  onClick={handleSellerPasswordForDownload}
                  className="bg-imei-cyan hover:bg-imei-cyan-dark text-white"
                  disabled={isLoading}
                >
                  {isLoading ? t('processing') : t('download_document')}
                </Button>
              ) : (
                <Button
                  onClick={handlePasswordSubmit}
                  className="bg-imei-cyan hover:bg-imei-cyan-dark text-white"
                  disabled={isLoading}
                >
                  {isLoading ? t('processing') : t('confirm')}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ImageViewer
          imageUrl={selectedImage || ''}
          isOpen={isImageViewerOpen}
          onClose={() => setIsImageViewerOpen(false)}
        />
      </div>
    </PageContainer>
  );
};

export default OwnershipTransfer;
