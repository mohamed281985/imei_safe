import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import PageContainer from '../components/PageContainer';
import { supabase } from '../lib/supabase'; // استيراد Supabase
import AppNavbar from '../components/AppNavbar';
import BackButton from '../components/BackButton';
import { CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '../contexts/AuthContext';

const MyReports: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [showStatusChangeModal, setShowStatusChangeModal] = useState(false);
  const [statusChangePassword, setStatusChangePassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth(); // جلب المستخدم الحالي
  const userId = user?.id;

  useEffect(() => {
    const fetchReports = async () => {
      setIsLoading(true);
      
      if (!userId) {
        console.log('No userId found, user:', user);
        return;
      }
      
      // جلب البلاغات الخاصة بالمستخدم الحالي فقط
      const { data, error } = await supabase.from('phone_reports').select('*').eq('user_id', userId);
      console.log('Fetched reports:', data, 'Error:', error, 'userId:', userId);
      if (error) {
        console.error('Error fetching reports:', error);
        toast({ title: t('error'), description: t('error_fetching_reports'), variant: 'destructive' });
      } else {
        setReports(data || []);
      }
      setIsLoading(false);
    };

    fetchReports();

    // تحديث تلقائي عند عودة التركيز للصفحة
    const handleFocus = () => {
      fetchReports();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [t, toast, userId]);

  const handleDeleteReport = async (reportId: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('phone_reports')
        .delete()
        .match({ id: reportId });

      if (error) throw error;

      setReports(prevReports => prevReports.filter(report => report.id !== reportId));
      
      toast({
        title: t('success'),
        description: t('report_deleted_successfully'),
      });
    } catch (error) {
      console.error('Error deleting report:', error);
      toast({
        title: t('error'),
        description: t('error_deleting_report'),
        variant: 'destructive'
      });
    }
  };

  const handleStatusChange = (report: any) => {
    setSelectedReport(report);
    setShowStatusChangeModal(true);
  };

  const handleForgotPassword = () => {
    if (!selectedReport) return;
    // بما أن هذه الصفحة تعرض بلاغات المستخدم الحالي فقط، يمكننا التوجيه مباشرة
    navigate('/reset-register', { state: { imei: selectedReport.imei } });
    setShowStatusChangeModal(false);
    setStatusChangePassword('');
  };

  const handleStatusChangeSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedReport || !statusChangePassword) {
      toast({
        title: t('error'),
        description: t('select_report_and_enter_password'),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    // الخطوة 1: التحقق من كلمة المرور من قاعدة البيانات
    const { data: reportToVerify, error: fetchError } = await supabase
      .from('phone_reports')
      .select('password')
      .eq('id', selectedReport.id)
      .single();

    if (fetchError || !reportToVerify) {
      toast({ title: t('error'), description: t('error_fetching_report_details'), variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    if (reportToVerify.password !== statusChangePassword) {
      toast({
        title: t('error'),
        description: t('incorrect_password'),
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    try {
      const newStatus = selectedReport.status === 'pending' ? 'resolved' : 'pending';
      const updatedReportData: any = {
        status: newStatus,
      };
      if (newStatus === 'resolved') {
        updatedReportData.resolved_date = new Date().toISOString();
      }

      const { data: updatedReport, error: updateError } = await supabase
        .from('phone_reports')
        .update(updatedReportData)
        .eq('id', selectedReport.id)
        .select()
        .single();

      if (updateError) throw updateError;

      setReports(prevReports =>
        prevReports.map(report =>
          report.id === selectedReport.id ? { ...report, ...updatedReport } : report
        )
      );

      toast({
        title: t('success'),
        description: t('report_status_updated_successfully'),
      });
      setShowStatusChangeModal(false);
      setSelectedReport(null);
      setStatusChangePassword('');
    } catch (error) {
      console.error("Error updating report status:", error);
      toast({
        title: t('error'),
        description: t('error_updating_report_status'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageContainer>
      <AppNavbar />
      
      <div className="my-6">
        <div className="flex items-center mb-6">
          <BackButton to="/dashboard" className="mr-4" />
          <h1 className="text-white text-2xl font-bold text-center flex-1 pr-10">
            {t('my_reports')}
          </h1>
        </div>
        
        {isLoading && <p className="text-center text-white">{t('loading')}...</p>}

        {!isLoading && reports.length === 0 ? (
          <div className="text-center text-white py-8">
            <p>{t('no_reports_found')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div key={report.id} className="bg-[#c0dee5] rounded-lg p-4 border border-imei-primary">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <p className="text-gray-800">
                      <span className="font-medium">{t('imei')}:</span> {report.imei}
                    </p>
                    <p className="text-gray-800">
                      <span className="font-medium">{t('loss_location')}:</span> {report.loss_location}
                    </p>
                    <p className="text-gray-800">
                      <span className="font-medium">{t('loss_time')}:</span> {new Date(report.loss_time).toLocaleString(i18n.language === 'ar' ? 'ar-SA' : 'en-US')}
                    </p>
                    <p className="text-gray-800">
                      <span className="font-medium">{t('report_date')}:</span> {new Date(report.report_date).toLocaleString(i18n.language === 'ar' ? 'ar-SA' : 'en-US')}
                    </p>
                    <p className="text-gray-800">
                      <span className="font-medium">{t('status')}:</span> {t(report.status)} {/* ترجمة الحالة */}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleStatusChange(report)}
                      className={`p-2 rounded-full ${
                        report.status === 'pending' 
                          ? 'bg-green-500 hover:bg-green-600' 
                          : 'bg-yellow-500 hover:bg-yellow-600'
                      }`}
                      disabled={isLoading}
                    >
                      {report.status === 'pending' ? (
                        <CheckCircle2 size={20} className="text-gray-800" />
                      ) : (
                        <AlertCircle size={20} className="text-gray-800" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteReport(report.id)}
                      className="p-2 rounded-full bg-red-500 hover:bg-red-600"
                      disabled={isLoading}
                    >
                      <Trash2 size={20} className="text-gray-800" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal لتغيير حالة البلاغ */}
      {showStatusChangeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-[#c0dee5] rounded-lg p-6 max-w-md w-full">
            <h2 className="text-gray-800 text-xl font-bold mb-4">
              {t('change_report_status')}
            </h2>
            <form onSubmit={handleStatusChangeSubmit} className="space-y-4">
              <div>
                <label htmlFor="statusChangePassword" className="block text-gray-800 text-sm font-medium mb-1">
                  {t('password')}
                </label>
                <input
                  type="password"
                  id="statusChangePassword"
                  value={statusChangePassword}
                  onChange={(e) => setStatusChangePassword(e.target.value)}
                  className="input-field w-full bg-[#c0dee5] text-gray-800"
                  required //
                />
                <p className="text-sm text-gray-600 mt-1">
                  {t('password_warning')}
                </p>
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowStatusChangeModal(false);
                    setStatusChangePassword('');
                  }}
                  className="text-gray-800 border-gray-600 hover:bg-gray-700"
                >
                  {t('cancel')}
                </button>
                <Button
                  type="submit"
                  className="bg-imei-cyan hover:bg-imei-cyan-dark"
                  disabled={isLoading}
                >
                  {t('confirm')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default MyReports;