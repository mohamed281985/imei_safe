import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import PageContainer from '../components/PageContainer';
import AppNavbar from '../components/AppNavbar';
import BackButton from '../components/BackButton';

const Report: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    ownerName: '',
    phoneNumber: '',
    imei: '',
    lossLocation: '',
    lossTime: '',
    password: '',
    phoneImage: null as File | null,
    reportImage: null as File | null,
    idImage: null as File | null,
    selfieImage: null as File | null
  });

  const [storedData, setStoredData] = useState<any>(null);
  const [isDataMatching, setIsDataMatching] = useState<boolean | null>(null);

  const checkStoredData = (imei: string) => {
    try {
      // البحث في الهواتف المسجلة
      const registeredPhones = JSON.parse(localStorage.getItem('registeredPhones') || '[]');
      const registeredPhone = registeredPhones.find((phone: any) => phone.imei === imei);
      
      if (registeredPhone) {
        const data = {
          ownerName: registeredPhone.ownerName,
          phoneNumber: registeredPhone.phoneNumber,
          imei: registeredPhone.imei,
          phoneType: registeredPhone.phoneType,
          registrationDate: registeredPhone.registrationDate
        };
        setStoredData(data);
        // تعبئة البيانات تلقائياً
        setFormData(prev => ({
          ...prev,
          ownerName: data.ownerName,
          phoneNumber: data.phoneNumber
        }));
        return true;
      }

      // البحث في سجلات نقل الملكية
      const transferRecords = JSON.parse(localStorage.getItem('transferRecords') || '[]');
      const transferRecord = transferRecords.find((record: any) => record.imei === imei);
      
      if (transferRecord) {
        const data = {
          ownerName: transferRecord.buyer.name,
          phoneNumber: transferRecord.buyer.phone,
          imei: transferRecord.imei,
          phoneType: transferRecord.phoneType,
          registrationDate: transferRecord.transferDate
        };
        setStoredData(data);
        // تعبئة البيانات تلقائياً
        setFormData(prev => ({
          ...prev,
          ownerName: data.ownerName,
          phoneNumber: data.phoneNumber
        }));
        return true;
      }

      // البحث في تقارير الهواتف المفقودة
      const phoneReports = JSON.parse(localStorage.getItem('phoneReports') || '[]');
      const phoneReport = phoneReports.find((report: any) => report.imei === imei);
      
      if (phoneReport) {
        const data = {
          ownerName: phoneReport.ownerName,
          phoneNumber: phoneReport.phoneNumber,
          imei: phoneReport.imei,
          phoneType: phoneReport.phoneType,
          registrationDate: phoneReport.reportDate
        };
        setStoredData(data);
        // تعبئة البيانات تلقائياً
        setFormData(prev => ({
          ...prev,
          ownerName: data.ownerName,
          phoneNumber: data.phoneNumber
        }));
        return true;
      }

      setStoredData(null);
      return false;
    } catch (error) {
      console.error('Error checking stored data:', error);
      setStoredData(null);
      return false;
    }
  };

  const handleImeiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    setFormData(prev => ({ ...prev, imei: value }));
    
    if (value.length === 15) {
      const found = checkStoredData(value);
      if (found) {
        setIsDataMatching(true);
        toast({
          title: t('data_found'),
          description: t('data_auto_filled'),
        });
      } else {
        setIsDataMatching(false);
        toast({
          title: t('error'),
          description: t('no_registered_data_found'),
          variant: 'destructive'
        });
      }
    } else {
      setStoredData(null);
      setIsDataMatching(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // التحقق من صحة البيانات
      if (!formData.ownerName || !formData.phoneNumber || !formData.imei || !formData.lossLocation || !formData.lossTime || !formData.password) {
        toast({
          title: t('error'),
          description: t('required_fields'),
          variant: 'destructive'
        });
        return;
      }

      // التحقق من تطابق البيانات مع البيانات المسجلة
      const registeredPhones = JSON.parse(localStorage.getItem('registeredPhones') || '[]');
      const registeredPhone = registeredPhones.find((phone: any) => phone.imei === formData.imei);

      if (!registeredPhone) {
        toast({
          title: t('error'),
          description: t('no_registered_data_found'),
          variant: 'destructive'
        });
        return;
      }

      // التحقق من كلمة المرور أولاً
      if (formData.password !== registeredPhone.password) {
        toast({
          title: t('error'),
          description: t('incorrect_password'),
          variant: 'destructive'
        });
        return;
      }

      // التحقق من تطابق البيانات الأخرى
      const isOwnerNameMatching = formData.ownerName === registeredPhone.ownerName;
      const isPhoneNumberMatching = formData.phoneNumber === registeredPhone.phoneNumber;

      if (!isOwnerNameMatching || !isPhoneNumberMatching) {
        let errorMessage = t('mismatched_data') + ':';
        if (!isOwnerNameMatching) {
          errorMessage += '\n- ' + t('incorrect_owner_name');
        }
        if (!isPhoneNumberMatching) {
          errorMessage += '\n- ' + t('incorrect_phone_number');
        }

        toast({
          title: t('error'),
          description: errorMessage,
          variant: 'destructive'
        });
        return;
      }

      // التحقق من عدم وجود بلاغ سابق
      const existingReports = JSON.parse(localStorage.getItem('phoneReports') || '[]');
      const existingReport = existingReports.find((report: any) => 
        report.imei === formData.imei && report.status === 'pending'
      );

      if (existingReport) {
        toast({
          title: t('error'),
          description: t('pending_report_exists'),
          variant: 'destructive'
        });
        return;
      }

      // حفظ التقرير
      const report = {
        ...formData,
        id: Date.now().toString(),
        reportDate: new Date().toISOString(),
        status: 'pending',
        storedData: registeredPhone
      };

      localStorage.setItem('phoneReports', JSON.stringify([...existingReports, report]));

      toast({
        title: t('success'),
        description: t('report_submitted_success'),
      });

      // إعادة تعيين النموذج
      setFormData({
        ownerName: '',
        phoneNumber: '',
        imei: '',
        lossLocation: '',
        lossTime: '',
        password: '',
        phoneImage: null,
        reportImage: null,
        idImage: null,
        selfieImage: null
      });
      setStoredData(null);
      setIsDataMatching(null);

      // الانتقال إلى لوحة التحكم
      navigate('/dashboard');

    } catch (error) {
      console.error('Error submitting report:', error);
      toast({
        title: t('error'),
        description: t('error_saving_report'),
        variant: 'destructive'
      });
    }
  };

  return (
    <PageContainer>
      <AppNavbar />
      
      <div className="my-6">
        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute right-0">
            <BackButton to="/dashboard" />
          </div>
          <h1 className="text-white text-2xl font-bold text-center">
            {t('report_lost_phone')}
          </h1>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="imei" className="block text-white text-sm font-medium mb-1">
              {t('imei')}
            </label>
            <input
              type="text"
              id="imei"
              name="imei"
              value={formData.imei}
              onChange={handleImeiChange}
              className="input-field w-full"
              placeholder={t('imei_placeholder_15_digits')}
              maxLength={15}
              required
            />
            {storedData && (
              <div className="mt-2 p-4 bg-imei-darker rounded-lg border border-imei-primary">
                <h3 className="text-lg font-semibold text-white mb-2">
                  {t('stored_data')}
                </h3>
                <div className="space-y-2">
                  <p className="text-sm text-white">
                    <span className="font-medium">{t('owner_name')}:</span> {storedData.ownerName}
                  </p>
                  <p className="text-sm text-white">
                    <span className="font-medium">{t('phone_number')}:</span> {storedData.phoneNumber}
                  </p>
                  <p className="text-sm text-white">
                    <span className="font-medium">{t('phone_type')}:</span> {storedData.phoneType}
                  </p>
                  <p className="text-sm text-white">
                    <span className="font-medium">{t('registration_date')}:</span> {new Date(storedData.registrationDate).toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : 'en-US')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="ownerName" className="block text-white text-sm font-medium mb-1">
              {t('owner_name')}
            </label>
            <input
              type="text"
              id="ownerName"
              name="ownerName"
              value={formData.ownerName}
              onChange={handleInputChange}
              className="input-field w-full"
              placeholder={t('enter_owner_name')}
              required
            />
          </div>

          <div>
            <label htmlFor="phoneNumber" className="block text-white text-sm font-medium mb-1">
              {t('phone_number')}
            </label>
            <input
              type="text"
              id="phoneNumber"
              name="phoneNumber"
              value={formData.phoneNumber}
              onChange={handleInputChange}
              className="input-field w-full"
              placeholder={t('enter_phone_number')}
              required
            />
          </div>

          <div>
            <label htmlFor="lossLocation" className="block text-white text-sm font-medium mb-1">
              {t('loss_location')}
            </label>
            <input
              type="text"
              id="lossLocation"
              name="lossLocation"
              value={formData.lossLocation}
              onChange={handleInputChange}
              className="input-field w-full"
              placeholder={t('enter_loss_location')}
              required
            />
          </div>

          <div>
            <label htmlFor="lossTime" className="block text-white text-sm font-medium mb-1">
              {t('loss_time')}
            </label>
            <input
              type="datetime-local"
              id="lossTime"
              name="lossTime"
              value={formData.lossTime}
              onChange={handleInputChange}
              className="input-field w-full"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-white text-sm font-medium mb-1">
              {t('password')}
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              className="input-field w-full"
              required
            />
            <p className="text-sm text-gray-400 mt-1">
              {t('password_warning')}
            </p>
          </div>

          <button type="submit" className="glowing-button w-full">
            {t('submit_report')}
          </button>
        </form>
      </div>
    </PageContainer>
  );
};

export default Report;