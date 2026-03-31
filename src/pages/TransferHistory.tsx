import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { format } from 'date-fns';
import { processArabicTextWithEncoding as processArabicText, loadArabicFontSafe as loadArabicFont } from '../utils/pdf/arabic-final-solution';
import ImageViewer from '@/components/ImageViewer';
import { jsPDF } from 'jspdf';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import autoTable from 'jspdf-autotable';
import bidiFactory from 'bidi-js';
import * as ArabicReshaper from 'arabic-persian-reshaper';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, ArrowLeft, Upload, AlertCircle, History, FileDown } from 'lucide-react';
import { mockPhoneReports } from '../services/mockData';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import BackButton from '../components/BackButton';
import AdsOfferSlider from '@/components/AdsOfferSlider';

interface TransferRecord {
  id: string;
  date: string;
  imei: string;
  phone_type: string;
  seller_name: string;
  seller_phone: string;
  seller_id_last6?: string;
  seller_type?: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_id_last6?: string;
  buyer_type?: string;
  seller_id_image?: string;
  seller_selfie?: string;
  buyer_id_image?: string;
  buyer_selfie?: string;
  receipt_image?: string;
  phone_image?: string;
  [key: string]: any;
}

const maskName = (name: string): string => {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  const maskedWords = words.map(word => {
    if (word.length <= 1) return word;
    return '******' + word.charAt(0);
  });
  return maskedWords.join(' ');
};

const maskPhone = (phone: string): string => {
  if (!phone) return '';
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length <= 2) return cleanPhone;
  const lastTwoDigits = cleanPhone.slice(-2);
  return lastTwoDigits + '*'.repeat(Math.min(cleanPhone.length - 2, 8));
};

const maskIdNumber = (idNumber: string): string => {
  if (!idNumber) return '';
  const cleanId = idNumber.replace(/\D/g, '');
  if (cleanId.length <= 4) return cleanId;
  const lastFourDigits = cleanId.slice(-4);
  return lastFourDigits + '*'.repeat(Math.min(cleanId.length - 4, 6));
};

const isSellerBusiness = (record: TransferRecord): boolean => {
  try {
    if (record.seller_type === 'business' || record.seller_type === 'store') return true;
    if (record.seller_id_last6 === null || record.seller_id_last6 === undefined ||
      record.seller_id_last6 === "" || record.seller_id_last6 === "متجر") return true;
    return false;
  } catch (error) {
    console.debug('خطأ في التحقق من نوع البائع:', error);
    return false;
  }
};

const isBuyerBusiness = (record: TransferRecord): boolean => {
  try {
    if (record.buyer_type === 'business' || record.buyer_type === 'store') return true;
    if (record.buyer_id_last6 === null || record.buyer_id_last6 === undefined ||
      record.buyer_id_last6 === "" || record.buyer_id_last6 === "متجر") return true;
    return false;
  } catch (error) {
    console.debug('خطأ في التحقق من نوع المشتري:', error);
    return false;
  }
};

const TransferHistory: React.FC = () => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [records, setRecords] = useState<TransferRecord[]>([]);
  const [phoneImage, setPhoneImage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPhoneReported, setIsPhoneReported] = useState<boolean | null>(null);
  const [existingPhoneImage, setExistingPhoneImage] = useState<string | null>(null);
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasReachedSearchLimit, setHasReachedSearchLimit] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [hasReachedPrintLimit, setHasReachedPrintLimit] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://imei-safe.me';

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    fetchUser();
  }, []);

  // تم إزالة هذا useEffect لأننا نتحقق من الحد مباشرة في الدوال

  const checkTransferLimit = async (userId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('https://imei-safe.me/api/check-limit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type: 'search_history' })
      });

      if (!response.ok) {
        throw new Error('Failed to check limit');
      }

      const result = await response.json();

      if (!result.allowed) {
        toast({
          title: t('alert'),
          description: t('search_limit_exceeded_plan'),
          variant: 'destructive'
        });
        setHasReachedSearchLimit(true);
        return false;
      }

      if (result.isLastUsage) {
        toast({
          title: t('alert'),
          description: t('last_transfer_allowed'),
          variant: 'default'
        });
      }

      setHasReachedSearchLimit(false);
      return true;
    } catch (error) {
      toast({
        title: 'خطأ',
        description: 'حدث خطأ في التحقق من حد البحث',
        variant: 'destructive'
      });
      return false;
    }
  };

  const checkPrintLimit = async (userId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('https://imei-safe.me/api/check-limit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type: 'print_history' })
      });

      if (!response.ok) {
        throw new Error('Failed to check limit');
      }

      const result = await response.json();

      if (!result.allowed) {
        toast({
          title: t('alert'),
          description: t('print_limit_exceeded'),
          variant: 'destructive'
        });
        setHasReachedPrintLimit(true);
        return false;
      }

      if (result.isLastUsage) {
        toast({
          title: t('alert'),
          description: t('last_print_allowed'),
          variant: 'default'
        });
      }

      setHasReachedPrintLimit(false);
      return true;
    } catch (error) {
      toast({
        title: 'خطأ',
        description: 'حدث خطأ في التحقق من حد الطباعة',
        variant: 'destructive'
      });
      return false;
    }
  };

  const updateSearchUsage = async (userId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      await fetch('https://imei-safe.me/api/increment-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type: 'search_history' })
      });
    } catch (error) {
      console.debug('خطأ في تحديث استخدام البحث:', error);
      throw error;
    }
  };

  const updatePrintUsage = async (userId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      await fetch('https://imei-safe.me/api/increment-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type: 'print_history' })
      });
    } catch (error) {
      console.debug('خطأ في تحديث استخدام الطباعة:', error);
      throw error;
    }
  };

  useEffect(() => {
    const fetchTransferRecords = async () => {
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const resp = await fetch(`${API_BASE_URL}/api/transfer-records`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({})
        });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) {
          throw new Error((json && (json.error || json.details)) || 'Failed to fetch transfer records');
        }
        setRecords((json?.data || []) as TransferRecord[]);
      } catch (error) {
        console.debug('Error fetching transfer records:', error);
      }
      setIsLoading(false);
    };

    fetchTransferRecords();
  }, []);

  const findPhoneImage = async (imei: string): Promise<string | null> => {
    const { data: transferData, error: transferError } = await supabase
      .from('transfer_records')
      .select('phone_image')
      .eq('imei', imei)
      .maybeSingle();

    if (transferError) console.debug('Error finding phone image in transfers:', transferError);
    if (transferData?.phone_image) {
      return transferData.phone_image;
    }

    const { data: reportData, error: reportError } = await supabase
      .from('phone_reports')
      .select('phone_image_url')
      .eq('imei', imei)
      .maybeSingle();

    if (reportError) console.debug('Error finding phone image in reports:', reportError);
    if (reportData?.phone_image_url) {
      return reportData.phone_image_url;
    }

    const mockReport = mockPhoneReports.find(report => report.imei === imei);
    if (mockReport?.phoneImage) {
      return mockReport.phoneImage;
    }

    return null;
  };

  const checkPhoneStatus = async (imei: string): Promise<boolean> => {
    const { data, error, count } = await supabase
      .from('phone_reports')
      .select('status', { count: 'exact' })
      .eq('imei', imei)
      .eq('status', 'active');

    if (error) {
      console.debug('Error checking phone status:', error);
      return false;
    }

    return (count ?? 0) > 0;
  };

  const fetchPhoneDetails = async (imei: string) => {
    setIsLoading(true);
    if (userId) {
  const canSearch = await checkTransferLimit(userId);
      if (!canSearch) {
        setIsLoading(false);
        return [];
      }
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const resp = await fetch(`${API_BASE_URL}/api/transfer-records`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ imei })
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error((json && (json.error || json.details)) || 'Failed to fetch transfer records');
      }

      const transferRecords = (json?.data || []) as TransferRecord[];
      if (transferRecords.length === 0) {
        toast({
          title: 'لا توجد سجلات',
          description: `لم يتم العثور على سجلات نقل ملكية للهاتف برقم IMEI: ${imei}`,
          variant: 'default'
        });
      }
      setRecords(transferRecords);
      if (transferRecords.length > 0) {
        setPhoneImage(transferRecords[0].phone_image || null);
      } else {
        setPhoneImage(null);
      }

      const isReported = await checkPhoneStatus(imei);
      setIsPhoneReported(isReported);
      if (userId) {
        await updateSearchUsage(userId);
      }
      setExistingPhoneImage(null);
      return transferRecords as TransferRecord[];
    } catch (error) {
      console.debug('Error fetching phone details:', error);
      setRecords([]);
      setPhoneImage(null);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 15) {
      setSearchTerm(value);
    }
    // عند تغيير الرقم فقط يتم تحديث searchTerm ولا يتم البحث أو عرض السجلات
    setExistingPhoneImage(null);
    setIsPhoneReported(null);
    setRecords([]);
  };

  const handleSearchButtonClick = async () => {
    if (searchTerm.length === 15 && userId) {
      // استخدم checkTransferLimit فقط، المنطق الموحد
      const canProceed = await checkTransferLimit(userId);
      if (!canProceed) {
        setShowUpgradeModal(true);
        return;
      }
      const results = await fetchPhoneDetails(searchTerm);
      if (results && results.length > 0) {
        await updateSearchUsage(userId);
      }
    } else {
      toast({ title: 'خطأ', description: 'يرجى تسجيل الدخول أولاً أو إدخال رقم IMEI صحيح', variant: 'destructive' });
    }
  };

  const handlePrintButtonClick = async () => {
    if (userId) {
      // استخدم checkPrintLimit فقط، المنطق الموحد
      const canProceed = await checkPrintLimit(userId);
      if (!canProceed) {
        setShowUpgradeModal(true);
        return;
      }
      await generatePdf(records, searchTerm, phoneImage);
      await updatePrintUsage(userId);
    } else {
      toast({ title: 'خطأ', description: 'يرجى تسجيل الدخول أولاً', variant: 'destructive' });
    }
  };

  const filteredRecords = records.filter(record => {
    // لا يتم تصفية السجلات أثناء الكتابة، بل فقط بعد الضغط على زر البحث
    return true;
  });

  const generatePdf = async (recordsToPrint: TransferRecord[], imei: string, imageUrl: string | null) => {
    if (!recordsToPrint || recordsToPrint.length === 0) {
      toast({
        title: t('error'),
        description: t('no_records_to_print'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const doc = new jsPDF();
      let fontForTable = 'helvetica';

      try {
        const fontLoaded = await loadArabicFont(doc);
        if (!fontLoaded) throw new Error("Font loading failed");
        fontForTable = 'Amiri';
      } catch (fontError: any) {
        console.debug("Could not load Arabic font. Arabic text might not render correctly.", fontError);
        doc.setFont('helvetica');
        toast({
          title: t('font_load_error_title'),
          description: t('font_load_error_desc'),
          variant: 'default',
        });
      }

      try {
        const logoUrl = '/logo.png';
        const logoResponse = await fetch(logoUrl);
        if (!logoResponse.ok) throw new Error('Logo file not found');
        const logoBlob = await logoResponse.blob();
        const logoDataUrl = await new Promise<string>(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(logoBlob);
        });
        doc.addImage(logoDataUrl, 'PNG', 14, 15, 40, 20);
      } catch (logoError) {
        console.debug("Could not load logo for PDF:", logoError);
      }

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      const xPosRight = pageWidth - margin;

      doc.setFontSize(20);
      doc.text(processArabicText(t('transfer_history')), xPosRight, 22, { align: 'right' });

      doc.setFontSize(16);
      doc.text(processArabicText(`${t('imei')}: ${imei}`), xPosRight, 32, { align: 'right' });

      if (imageUrl) {
        try {
          const imgResponse = await fetch(imageUrl);
          const blob = await imgResponse.blob();
          const dataUrl = await new Promise<string>(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const imageWidth = 80;
          const xOffset = (doc.internal.pageSize.getWidth() - imageWidth) / 2;
          doc.addImage(dataUrl, 'JPEG', xOffset, 45, imageWidth, 60);
        } catch (imgError) {
          console.debug("Error adding image to PDF:", imgError);
        }
      }

      const headers = [
        [
          processArabicText(t('date')),
          processArabicText(t('seller')),
          processArabicText(t('seller_id') || 'رقم بطاقة البائع'),
          processArabicText(t('buyer')),
          processArabicText(t('buyer_id') || 'رقم بطاقة المشتري')
        ]
      ];

      const body = recordsToPrint.map(record => {
        const dateObj = new Date(record.date);
        const formattedDate = record.date && !isNaN(dateObj.getTime())
          ? format(dateObj, 'dd/MM/yyyy HH:mm')
          : t('not_available');

        const formatNamePDF = (name: string): string => {
          if (!name) return '';
          const words = name.trim().split(/\s+/);
          const formattedWords = words.map(word => {
            if (word.length <= 1) return word;
            return word.charAt(0) + '*'.repeat(6);
          });
          return formattedWords.join(' ');
        };

        const sellerName = formatNamePDF(record.seller_name || t('unknown_seller'));
        const buyerName = record.buyer_name ? formatNamePDF(record.buyer_name) : '';

        const formatPhonePDF = (phone: string): string => {
          if (!phone) return '';
          const cleanPhone = phone.replace(/\D/g, '');
          if (cleanPhone.length <= 2) return cleanPhone;
          return '*'.repeat(cleanPhone.length - 2) + cleanPhone.slice(-2);
        };

        const formatIdPDF = (id: string): string => {
          if (!id) return 'غير متوفر';
          const cleanId = id.replace(/\D/g, '');
          if (cleanId.length <= 4) return cleanId;
          return '*'.repeat(cleanId.length - 4) + cleanId.slice(-4);
        };

        const sellerPhone = formatPhonePDF(record.seller_phone || t('no_phone'));
        const buyerPhone = formatPhonePDF(record.buyer_phone || t('no_phone'));

        const sellerIdInfo = isSellerBusiness(record) ? 'متجر' :
          (record.seller_id_last6 ? formatIdPDF(record.seller_id_last6) : 'غير متوفر');

        const buyerIdInfo = isBuyerBusiness(record) ? 'متجر' :
          (record.buyer_id_last6 ? formatIdPDF(record.buyer_id_last6) : 'غير متوفر');

        const sellerInfo = `${sellerName} (${sellerPhone})`;
        const buyerInfo = record.buyer_name ? `${buyerName} (${buyerPhone})` : t('no_buyer_data');

        return [
          formattedDate,
          processArabicText(sellerInfo),
          processArabicText(sellerIdInfo),
          processArabicText(buyerInfo),
          processArabicText(buyerIdInfo)
        ];
      });

      const tableStartY = 120;

      autoTable(doc, {
        head: headers,
        body,
        startY: tableStartY,
        styles: {
          font: fontForTable,
          halign: 'center',
          fontSize: 11,
          cellPadding: 6,
          lineWidth: 0.2,
          lineColor: [80, 80, 80]
        },
        headStyles: {
          font: fontForTable,
          halign: 'center',
          fontSize: 13,
          fontStyle: 'bold',
          fillColor: [25, 118, 210],
          textColor: [255, 255, 255],
          cellPadding: 8
        },
        alternateRowStyles: { fillColor: [240, 247, 255] },
        margin: { top: 5, right: margin, bottom: 5, left: margin },
        bodyStyles: { lineWidth: 0.2, lineColor: [150, 150, 150] },
        tableWidth: 'auto',
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 'auto' }
        }
      });

      const fileName = `transfer_history_${imei}.pdf`;
      if (Capacitor.isNativePlatform()) {
        try {
          const base64Data = doc.output('datauristring').split(',')[1];

          const result = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache,
            recursive: true
          });

          await Share.share({
            title: fileName,
            text: t('pdf_document_for_transfer_history'),
            url: result.uri,
            dialogTitle: t('share_or_save_pdf'),
          });
        } catch (e: any) {
          if (e.message && e.message.includes('Share canceled')) {
            // User cancelled share sheet
          } else {
            toast({ title: t('error'), description: t('error_sharing_pdf'), variant: 'destructive' });
          }
        }
      } else {
        try {
          const pdfBlob = doc.output('blob');
          const url = URL.createObjectURL(pdfBlob);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) {
          doc.save(fileName);
        }
      }

    } catch (error) {
      console.debug('Failed to generate PDF. Error details:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({ title: t('error_generating_pdf'), description: errorMessage, variant: 'destructive' });
    }
  };

  return (
    <PageContainer>
      <AppNavbar />
      <div className="container mx-auto p-4 pt-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-black">{t('transfer_history')}</h1>
          <BackButton />
        </div>
        <div className="mb-4 space-y-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <Input
              type="text"
              value={searchTerm}
              onChange={handleSearch}
              placeholder={t('search_by_imei_or_phone')}
              className="pl-10 w-full focus:ring-2 focus:ring-orange-500 bg-imei-dark/50 backdrop-blur-sm border border-orange-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSearchButtonClick}
              className="bg-orange-500 hover:bg-orange-600 text-white transition-colors flex-1"
              disabled={searchTerm.length !== 15 || isLoading}
            >
              <Search className="h-4 w-4 mr-2" />
              {t('search')}
            </Button>
            <Button
              onClick={handlePrintButtonClick}
              className="bg-blue-500 hover:bg-blue-600 text-white transition-colors flex-1"
              disabled={isLoading || records.length === 0}
            >
              <FileDown className="h-4 w-4 mr-2" />
              {t('print_pdf')}
            </Button>
          </div>
          {phoneImage && (
            <div className="mt-4">
              <h3 className="text-lg font-bold text-white mb-2">{t('latest_phone_image')}</h3>
              <button
                onClick={() => {
                  setSelectedImage(phoneImage);
                  setIsImageViewerOpen(true);
                }}
                className="cursor-pointer block"
              >
                <img
                  src={phoneImage}
                  alt="Phone"
                  className="w-full max-w-sm rounded-lg border border-gray-700 shadow-lg transition-transform hover:scale-[1.02]"
                />
              </button>
            </div>
          )}

          <ImageViewer
            imageUrl={selectedImage || ''}
            isOpen={isImageViewerOpen}
            onClose={() => setIsImageViewerOpen(false)}
          />
        </div>
        {searchTerm.length === 15 && (
          <>
            {isLoading && <p className="text-center text-white">{t('loading')}...</p>}
            {!isLoading && records.length === 0 && (
              <p className="text-center text-white">{t('no_records_found')}</p>
            )}
            {!isLoading && records.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse border border-gray-800">
                  <thead>
                    <tr className="bg-gray-900 text-white">
                      <th className="px-6 py-3 border border-gray-700 text-left text-sm font-medium uppercase tracking-wider">{t('date')}</th>
                      <th className="px-6 py-3 border border-gray-700 text-left text-sm font-medium uppercase tracking-wider">{t('seller')}</th>
                      <th className="px-6 py-3 border border-gray-700 text-left text-sm font-medium uppercase tracking-wider">{t('seller_id')}</th>
                      <th className="px-6 py-3 border border-gray-700 text-left text-sm font-medium uppercase tracking-wider">{t('buyer')}</th>
                      <th className="px-6 py-3 border border-gray-700 text-left text-sm font-medium uppercase tracking-wider">{t('buyer_id')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {records.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-700">
                        <td className="px-6 py-4 border border-gray-700 text-sm text-gray-300">{format(new Date(record.date), 'dd/MM/yyyy HH:mm')}</td>
                        <td className="px-6 py-4 border border-gray-700 text-sm text-gray-300">
                          {maskName(record.seller_name)} ({maskPhone(record.seller_phone)})
                        </td>
                        <td className="px-6 py-4 border border-gray-700 text-sm text-gray-300">
                          {isSellerBusiness(record) ? t('store') : (record.seller_id_last6 ? maskIdNumber(record.seller_id_last6) : t('not_available'))}
                        </td>
                        <td className="px-6 py-4 border border-gray-700 text-sm text-gray-300">
                          {record.buyer_name ? `${maskName(record.buyer_name)} (${maskPhone(record.buyer_phone || t('no_phone'))})` : t('no_buyer_data')}
                        </td>
                        <td className="px-6 py-4 border border-gray-700 text-sm text-gray-300">
                          {isBuyerBusiness(record) ? t('store') : (record.buyer_id_last6 ? maskIdNumber(record.buyer_id_last6) : t('not_available'))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      {showUpgradeModal && userId && (
        <AdsOfferSlider onClose={() => setShowUpgradeModal(false)} userId={userId} isUpgradePrompt={true} />
      )}
    </PageContainer>
  );
};

export default TransferHistory;

