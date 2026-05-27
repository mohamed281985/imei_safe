import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Smartphone, ShieldCheck, ShieldAlert, HelpCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase'; // تأكد من صحة مسار الاستيراد، يبدو أنه كان خطأ مطبعي في السابق (sabase -> supabase)
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import axiosInstance from '@/services/axiosInterceptor';
 
interface PhoneForConfirmation {
  id: string;
  imei_encrypted?: { encryptedData: string; iv: string } | null;
  imei_masked: string;
  phone_type: string;
  hasActiveReport?: boolean;
}

interface OwnershipConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  phones: PhoneForConfirmation[];
  onConfirm: (phoneIds: string[]) => void;
  onDeny: (phoneIds: string[]) => void;
}

const OwnershipConfirmationModal: React.FC<OwnershipConfirmationModalProps> = ({
  isOpen,
  onClose,
  phones,
  onConfirm,
  onDeny,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [selectedPhones, setSelectedPhones] = React.useState<string[]>([]);
  const [phoneWithReport, setPhoneWithReport] = React.useState<PhoneForConfirmation | null>(null);
  const [showFoundPhoneDialog, setShowFoundPhoneDialog] = React.useState(false);
  const [localPhones, setLocalPhones] = React.useState<PhoneForConfirmation[]>(phones);

  React.useEffect(() => {
    setLocalPhones(phones || []);
  }, [phones]);

  const handleConfirm = async () => {
    if (selectedPhones.length === 0) return;

    const phonesToConfirmDirectly: string[] = [];
    let reportFound = false;

    for (const phoneId of selectedPhones) {
      const phone = phones.find(p => p.id === phoneId);
      if (!phone) continue;

      if (phone.hasActiveReport) {
        // تحقق سريع في الخادم لإتاحة حالة البلاغ الحقيقية
        try {
          const resp = await axiosInstance.post('/api/check-report-active', { imei_encrypted: phone.imei_encrypted });
          const active = resp?.data?.active;
          if (active) {
            setPhoneWithReport(phone);
            setShowFoundPhoneDialog(true);
            reportFound = true;
            return;
          } else {
            // بلاغ سبق حله — حدّث الحالة محلياً و اعتبره قابل للتأكيد مباشرة
            setLocalPhones(prev => prev.map(p => p.id === phone.id ? { ...p, hasActiveReport: false } : p));
            phonesToConfirmDirectly.push(phoneId);
          }
        } catch (e) {
          console.error('Failed to verify active report status:', e);
          // إذا فشل التحقق، نُسقِط هذا الهاتف من العملية حفاظاً على استمرارية تجربة المستخدم
          phonesToConfirmDirectly.push(phoneId);
        }
      } else {
        phonesToConfirmDirectly.push(phoneId);
      }
    }

    // تأكيد الهواتف التي ليس عليها بلاغات نشطة
    if (!reportFound && phonesToConfirmDirectly.length > 0) {
      onConfirm(phonesToConfirmDirectly);
      setSelectedPhones([]);
      // إغلاق النافذة الرئيسية إذا تم تأكيد كل الهواتف
      if (phonesToConfirmDirectly.length === selectedPhones.length) {
        onClose();
      }
    }
  };

  const handleFoundPhoneConfirmation = async (found: boolean) => {
    if (!phoneWithReport) return;

    let errorOccurred = false;

    if (found) {
      // الحالة: المستخدم يقول "وجدت الهاتف"
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const resultResp = await axiosInstance.post('/api/resolve-report', { imei_encrypted: phoneWithReport.imei_encrypted });
        const result = resultResp.data;
        
        // التعديل هنا: نقبل النجاح حتى لو كان "already_resolved"
        if (!result || (!result.success && result.message !== 'already_resolved')) {
          throw new Error(result?.error || 'Failed to resolve report');
        }
        
        toast({ title: t('success_title'), description: t('report_status_updated_successfully') });
        onConfirm([phoneWithReport.id]);
      } catch (error) {
        console.error('Error resolving report:', error);
        toast({ title: t('alert_title'), description: t('report_status_update_failed'), variant: 'destructive' });
        errorOccurred = true;
      }
    } else {
      // الحالة: المستخدم يقول "لم أجد الهاتف"
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        await axiosInstance.post('/api/update-phone-status', { ids: [phoneWithReport.id], status: 'transferred' });
        toast({ title: t('note_title'), description: t('phone_status_transferred_note'), variant: 'default' });
      } catch (e) {
        console.error('Failed to mark phone transferred:', e);
        toast({ title: t('alert_title'), description: t('phone_status_update_failed'), variant: 'destructive' });
        errorOccurred = true;
      }
    }

    // إغلاق النافذة الفرعية دائماً
    setShowFoundPhoneDialog(false);
    setPhoneWithReport(null);

    // إزالة الهاتف الحالي من القائمة المحددة
    const remainingPhones = selectedPhones.filter(id => id !== phoneWithReport.id);
    setSelectedPhones(remainingPhones);

    // التعامل مع الهواتف المتبقية أو إغلاق النافذة الرئيسية
    if (!errorOccurred) {
      if (remainingPhones.length > 0) {
        // معالجة الهاتف التالي بشكل غير متزامن
        setTimeout(() => handleConfirm(), 0);
      } else {
        // لا توجد هواتف متبقية، أغلق النافذة الرئيسية
        onClose();
      }
    }
  };

  const handleDeny = async () => {
    if (selectedPhones.length === 0) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      await axiosInstance.post('/api/update-phone-status', { ids: selectedPhones, status: 'transferred' });
    } catch (e) {
      console.error('Failed to mark phones transferred:', e);
      toast({ title: t('alert_title'), description: t('phone_status_update_failed'), variant: 'destructive' });
      return;
    }

    for (const phoneId of selectedPhones) {
      const phone = phones.find(p => p.id === phoneId);
      if (!phone) continue;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        await axiosInstance.post('/api/resolve-report', { imei_encrypted: phone.imei_encrypted });
      } catch (e) {
        console.error('Failed to resolve report for phone', phoneId, e);
      }
    }

    toast({ title: t('success_title'), description: t('phones_status_updated') });
    setSelectedPhones([]);
    onClose();
  };

  const handleTogglePhone = (phoneId: string) => {
    setSelectedPhones(prev =>
      prev.includes(phoneId) ? prev.filter(id => id !== phoneId) : [...prev, phoneId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPhones.length === phones.length) {
      setSelectedPhones([]);
    } else {
      setSelectedPhones(phones.map(p => p.id));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white/90 backdrop-blur-lg text-gray-800 w-[90%] sm:max-w-md border-2 border-orange-400 shadow-2xl rounded-2xl">
        <DialogHeader className="text-center">
          <div className="mx-auto bg-orange-100 p-3 rounded-full mb-4 border-2 border-orange-300">
            <ShieldCheck className="w-10 h-10 text-orange-500" />
          </div>
          <DialogTitle className="text-2xl font-bold text-gray-900">
            {t('confirm_phone_ownership')}
          </DialogTitle>
          <DialogDescription className="text-gray-600 mt-2">
            {t('confirm_ownership_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="my-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <label htmlFor="select-all" className="text-sm font-medium text-gray-600">
              {selectedPhones.length} {t('phones_selected_custom')} {phones.length} {t('phones_selected_label')}
            </label>
            <Button variant="link" id="select-all" onClick={handleSelectAll} className="p-0 h-auto text-orange-600">
              {selectedPhones.length === phones.length ? t('unselect_all') : t('select_all')}
            </Button>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-3 pr-2 border-t pt-3">
          {phones.map(phone => (
              <div
                key={phone.id}
                className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-orange-50 transition-colors"
                role="button"
                tabIndex={0}
                onClick={() => handleTogglePhone(phone.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTogglePhone(phone.id);
                  }
                }}
              >
                <Checkbox
                  id={`phone-${phone.id}`}
                  checked={selectedPhones.includes(phone.id)}
                  onCheckedChange={(checked) => {
                    // تم التصحيح هنا: استخدام phone.id بدلاً من phoneId
                    if (typeof checked === 'boolean') {
                      if (checked && !selectedPhones.includes(phone.id)) {
                        setSelectedPhones(prev => [...prev, phone.id]);
                      } else if (!checked) {
                        setSelectedPhones(prev => prev.filter(id => id !== phone.id));
                      }
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <Smartphone className="w-6 h-6 text-gray-500 flex-shrink-0" />
                <div className="flex-grow">
                  <p className="font-semibold text-gray-800">{phone.phone_type || t('unspecified_phone')}</p>
                  <p className="text-sm text-gray-500 font-mono" dir="ltr">{phone.imei_masked}</p>
                </div>
              </div>
          ))}
          </div>
        </div>

        <DialogFooter className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            onClick={handleDeny}
            variant="destructive"
            className="flex items-center gap-2"
            disabled={selectedPhones.length === 0}
          >
            <ShieldAlert className="w-4 h-4" />
            {t('this_is_not_my_phone')}
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
            disabled={selectedPhones.length === 0}
          >
            <ShieldCheck className="w-4 h-4" />
            {t('confirm_ownership')}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={showFoundPhoneDialog} onOpenChange={setShowFoundPhoneDialog}>
        <DialogContent className="bg-white/90 backdrop-blur-lg text-gray-800 w-[90%] sm:max-w-md border-2 border-blue-400 shadow-2xl rounded-2xl">
          <DialogHeader className="text-center">
            <div className="mx-auto bg-blue-100 p-3 rounded-full mb-4 border-2 border-blue-300">
              <HelpCircle className="w-10 h-10 text-blue-500" />
            </div>
            <DialogTitle className="text-2xl font-bold text-gray-900">
              {t('report_inquiry')}
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              {t('active_report_message')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button onClick={() => handleFoundPhoneConfirmation(false)} variant="destructive">
              {t('phone_not_found')}
            </Button>
            <Button onClick={() => handleFoundPhoneConfirmation(true)} className="bg-green-600 hover:bg-green-700 text-white">
              {t('phone_found')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default OwnershipConfirmationModal;
