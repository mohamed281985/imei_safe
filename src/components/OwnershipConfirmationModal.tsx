import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Smartphone, ShieldCheck, ShieldAlert, HelpCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
 
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

  // IMEI يأتي من السيرفر كمخفى في الحقل `imei_masked`، ولا نقوم بفك التشفير في الواجهة

  const handleConfirm = async () => {
    if (selectedPhones.length === 0) return;

    const phonesToConfirmDirectly: string[] = [];
    let reportFound = false;

    for (const phoneId of selectedPhones) {
      const phone = phones.find(p => p.id === phoneId);
      if (!phone) continue;

      // التحقق باستخدام العلامة القادمة من API
      if (phone.hasActiveReport) {
        // إذا وجد بلاغ، اظهر مربع الحوار وتوقف
        setPhoneWithReport(phone);
        setShowFoundPhoneDialog(true);
        reportFound = true;
        return; 
      } else {
        phonesToConfirmDirectly.push(phoneId);
      }
    }

    // إذا لم يتم العثور على أي بلاغات، قم بالتأكيد مباشرة
    if (!reportFound && phonesToConfirmDirectly.length > 0) {
      onConfirm(phonesToConfirmDirectly);
      setSelectedPhones([]);
    }
  };

  const handleFoundPhoneConfirmation = async (found: boolean) => {
    if (!phoneWithReport) return;

    if (found) {
      // إذا تم العثور على الهاتف، قم بتحديث حالة البلاغ إلى "resolved"
      // استخدام API لحل البلاغ لأن IMEI مشفر في قاعدة البيانات
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch('https://imei-safe.me/api/resolve-report', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          // نرسل IMEI مشفّر كما أتى من السيرفر
          body: JSON.stringify({ imei_encrypted: phoneWithReport.imei_encrypted })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        
        toast({ title: t('success_title'), description: t('report_status_updated_successfully') });
      } catch (error) {
        console.error('Error resolving report:', error);
        toast({ title: t('alert_title'), description: t('report_status_update_failed'), variant: 'destructive' });
      }
      // استمر في عملية التأكيد الأصلية لهذا الهاتف
      onConfirm([phoneWithReport.id]);
    } else {
      // إذا لم يتم العثور عليه، لا تغير حالة البلاغ، قم بتحديث الحالة عبر السيرفر إلى 'transferred'
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const resp = await fetch('/api/update-phone-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
          body: JSON.stringify({ ids: [phoneWithReport.id], status: 'transferred' })
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || 'Failed to update status');
        toast({ title: t('note_title'), description: t('phone_status_transferred_note'), variant: 'default' });
      } catch (e) {
        console.error('Failed to mark phone transferred:', e);
        toast({ title: t('alert_title'), description: t('phone_status_update_failed'), variant: 'destructive' });
      }
      // onDeny([phoneWithReport.id]); // لم نعد نستدعي onDeny هنا
    }

    // أغلق مربع الحوار وأعد التعيين
    setShowFoundPhoneDialog(false);
    setPhoneWithReport(null);

    // قم بإزالة الهاتف المعالج من التحديد واستمر إذا كان هناك المزيد
    const remainingPhones = selectedPhones.filter(id => id !== phoneWithReport.id);
    setSelectedPhones(remainingPhones);

    if (remainingPhones.length > 0) {
      // استدعاء مرة أخرى لمعالجة الهواتف المتبقية
      // نضعها في setTimeout لتجنب التحديث المتزامن للحالة
      setTimeout(() => handleConfirm(), 0);
    } else {
      setSelectedPhones([]);
    }
  };

  const handleDeny = async () => {
    if (selectedPhones.length === 0) return;

    // تحديث الحالة إلى 'transferred' عبر السيرفر
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const resp = await fetch('/api/update-phone-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ids: selectedPhones, status: 'transferred' })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Failed to update status');
    } catch (e) {
      console.error('Failed to mark phones transferred:', e);
      toast({ title: t('alert_title'), description: t('phone_status_update_failed'), variant: 'destructive' });
      return;
    }

    // حل أي بلاغات مرتبطة بالهواتف التي تم إنكارها
    for (const phoneId of selectedPhones) {
      const phone = phones.find(p => p.id === phoneId);
      if (!phone) continue;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        await fetch('https://imei-safe.me/api/resolve-report', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ imei_encrypted: phone.imei_encrypted })
        });
      } catch (e) {
        console.error('Failed to resolve report for phone', phoneId, e);
      }
    }

    toast({ title: t('success_title'), description: t('phones_status_updated') });
    setSelectedPhones([]);
    onClose(); // إغلاق النافذة بعد إتمام العملية
  };

  const handleTogglePhone = (phoneId: string) => {
    setSelectedPhones(prev =>
      prev.includes(phoneId) ? prev.filter(id => id !== phoneId) : [...prev, phoneId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPhones.length === phones.length) {
      setSelectedPhones([]); // إلغاء تحديد الكل
    } else {
      setSelectedPhones(phones.map(p => p.id)); // تحديد الكل
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
              <label
                key={phone.id}
                htmlFor={`phone-${phone.id}`}
                className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-orange-50 transition-colors"
              >
                <Checkbox
                  id={`phone-${phone.id}`}
                  checked={selectedPhones.includes(phone.id)}
                  onCheckedChange={() => handleTogglePhone(phone.id)}
                />
                <Smartphone className="w-6 h-6 text-gray-500 flex-shrink-0" />
                <div className="flex-grow">
                  <p className="font-semibold text-gray-800">{phone.phone_type || t('unspecified_phone')}</p>
                  <p className="text-sm text-gray-500 font-mono" dir="ltr">{phone.imei_masked}</p>
                </div>
              </label>
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

      {/* Dialog for found phone confirmation */}
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