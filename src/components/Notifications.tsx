import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { mockPhoneReports } from '../services/mockData';
import { Megaphone, CheckCircle, AlertCircle, AlertTriangle, Search, ChevronUp, ChevronDown, Crown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import axiosInstance from '@/services/axiosInterceptor';

// ⭐ إضافة props جديدة للتحكم في طريقة العرض
interface NotificationsProps {
  isBottomNavbarVersion?: boolean;
}
const Notifications: React.FC<NotificationsProps> = ({ isBottomNavbarVersion = false }) => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showReportPasswordDialog, setShowReportPasswordDialog] = useState(false);
  const [reportPassword, setReportPassword] = useState('');
  const [showStatusChangeModal, setShowStatusChangeModal] = useState(false);
  const [statusChangePassword, setStatusChangePassword] = useState('');
  // حالة لتتبع أي IMEI مكشوف (مفتوح) حسب id البلاغ
  const [revealedImeis, setRevealedImeis] = useState<Record<string, boolean>>({});
  const [decryptedData, setDecryptedData] = useState<Record<string, any>>({});
  const [loadingImeis, setLoadingImeis] = useState<Record<string, boolean>>({});

  // تبديل إظهار/إخفاء IMEI
  const toggleRevealImei = async (id: string) => {
    if (revealedImeis[id]) {
      setRevealedImeis(prev => ({ ...prev, [id]: false }));
    } else {
      if (decryptedData[id]) {
        setRevealedImeis(prev => ({ ...prev, [id]: true }));
      } else {
        setLoadingImeis(prev => ({ ...prev, [id]: true }));
        try {
          const response = await axiosInstance.post('https://imei-safe.me/api/report-details-decrypted', { reportId: id });
          const data = response.data;
          if (data.success) {
            setDecryptedData(prev => ({ ...prev, [id]: data }));
            setRevealedImeis(prev => ({ ...prev, [id]: true }));
          }
        } catch (error: any) {
          console.error('Server error response:', error?.response?.data);
          console.error('Error fetching decrypted IMEI:', error);
          toast({ title: t('error'), description: t('error_fetching_data'), variant: 'destructive' });
        } finally {
          setLoadingImeis(prev => ({ ...prev, [id]: false }));
        }
      }
    }
  };

  // دالة لإخفاء IMEI بالنجوم
  const maskImei = (imei?: string) => {
    return '**** **** **** ****';
  };

  useEffect(() => {
    // جلب البلاغات من Supabase للمستخدم الحالي فقط والتي حالتها active
    const fetchReports = async () => {
      try {
        if (!user?.id) {
          setReports([]);
          return;
        }
        const { data, error } = await supabase
          .from('phone_reports')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('report_date', { ascending: false });
        if (error) throw error;
        // إزالة التكرار حسب رقم الإيمي
        const uniqueReports = data ? data.filter((report, idx, arr) =>
          arr.findIndex(r => r.imei === report.imei) === idx
        ) : [];
        setReports(uniqueReports);
      } catch (error) {
        console.error('Error loading reports from Supabase:', error);
        setReports([]);
      }
    };
    fetchReports();
  }, [user]);

  useEffect(() => {
    const close = () => setShowNotifications(false);
    window.addEventListener('closeNotifications', close);
    return () => window.removeEventListener('closeNotifications', close);
  }, []);

  const filteredReports = reports.filter(report => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (report.imei || '').toLowerCase().includes(searchLower) ||
      (report.owner_name || '').toLowerCase().includes(searchLower) ||
      (report.phone_number || '').includes(searchQuery)
    );
  });

  const activeReports = filteredReports.filter(report => report.status === 'active');
  const resolvedReports = filteredReports.filter(report => report.status === 'resolved');

  const handleReportClick = (report: any) => {
    if (report.status === 'active') {
      setSelectedReport(report);
      setShowReportPasswordDialog(true);
      setShowNotifications(false);
    } else {
      navigateToReport(report);
    }
  };

  const navigateToReport = (report: any) => {
    setShowNotifications(false);
    window.location.href = `/phone/${report.id}`;
  };

  const handleStatusChange = () => {
    // Update report status
    const updatedReports = reports.map(report => {
      if (report.id === selectedReport.id) {
        return { 
          ...report, 
          status: report.status === 'active' ? 'resolved' : 'active' 
        };
      }
      return report;
    });

    // Update localStorage
    const savedReports = updatedReports.filter(report => !mockPhoneReports.some(mock => mock.id === report.id));
    localStorage.setItem('phoneReports', JSON.stringify(savedReports));

    // Update state
    setReports(updatedReports);
    setShowStatusDialog(false);
    setSelectedReport(null);

    toast({
      title: t('success'),
      description: t('status_changed_success'),
    });
  };

  // تحديث حالة البلاغ في Supabase عند إدخال الباسورد
  const verifyReportPassword = async () => {
    try {
      const entered = (reportPassword || '').toString().trim();
      if (!entered) {
        toast({ title: t('error'), description: t('please_enter_password_to_confirm'), variant: 'destructive' });
        return;
      }

      // Call server endpoint to verify and resolve the report atomically
      try {
        await axiosInstance.post('/api/verify-and-resolve-report', { reportId: selectedReport.id, password: entered });
      } catch (err: any) {
        const json = err?.response?.data || {};
        const status = err?.response?.status;
        console.warn('verify-and-resolve-report failed:', status, json);
        toast({ title: t('error'), description: t('invalid_report_password'), variant: 'destructive', className: "z-[10001]" });
        return;
      }

      // refresh local reports list
      const { data: refreshed, error: fetchError } = await supabase
        .from('phone_reports')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('report_date', { ascending: false });
      if (fetchError) throw fetchError;
      const uniqueReports = refreshed ? refreshed.filter((report, idx, arr) =>
        arr.findIndex(r => r.imei === report.imei) === idx
      ) : [];
      setReports(uniqueReports);

      setShowReportPasswordDialog(false);
      setReportPassword('');
      setSelectedReport(null);
      setShowNotifications(false);
      toast({ title: t('success'), description: t('phone_found_message'), className: "z-[10001]" });
    } catch (error) {
      console.error('Error during verify-and-resolve flow:', error);
      toast({ title: t('error'), description: t('error_updating_status'), variant: 'destructive', className: "z-[10001]" });
    }
  };

  const verifyPassword = () => {
    if (password === '123456') {
      // Update report status
      const updatedReports = reports.map(report => {
        if (report.id === selectedReport.id) {
          return { ...report, status: 'resolved' };
        }
        return report;
      });

      // Update localStorage
      const savedReports = updatedReports.filter(report => !mockPhoneReports.some(mock => mock.id === report.id));
      localStorage.setItem('phoneReports', JSON.stringify(savedReports));

      // Update state
      setReports(updatedReports);
      setPassword('');
      setShowPasswordDialog(false);
      setSelectedReport(null);

      toast({
        title: t('success'),
        description: t('status_changed_success'),
        className: "z-[10001]"
      });
    } else {
      toast({
        title: t('error'),
        description: t('invalid_password'),
        variant: 'destructive',
        className: "z-[10001]"
      });
    }
  };

  const loadReports = () => {
    try {
      const savedReportsStr = localStorage.getItem('phoneReports') || '[]';
      const savedReports = JSON.parse(savedReportsStr);
      
      // Combine mock and saved reports, ensuring we use the latest version of each report
      const allReports = [...mockPhoneReports, ...savedReports].reduce((acc, report) => {
        const existingIndex = acc.findIndex(r => r.id === report.id);
        if (existingIndex === -1) {
          acc.push(report);
        } else {
          // If report exists, use the latest version (from localStorage)
          acc[existingIndex] = report;
        }
        return acc;
      }, []);

      // Sort reports by date (newest first)
      const sortedReports = allReports.sort((a, b) => 
        new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime()
      );
      
      setReports(sortedReports);
    } catch (error) {
      console.error("Error loading reports:", error);
      setReports(mockPhoneReports);
    }
  };

  const handleStatusChangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleStatusChange();
    setShowStatusChangeModal(false);
    setStatusChangePassword('');
  };

  // ⭐ دالة لعرض المحتوى المشترك (قائمة البلاغات)
  const renderContent = () => (
          <div className="p-4">
            <h3 className="text-red-500 text-2xl font-bold mb-3">
              {t('my_reports')}
            </h3>
            
            {/* Search Bar */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <Input
                type="text"
                placeholder={t('search_reports')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-[#b8d7d5] border border-imei-cyan text-gray-800 placeholder:text-gray-500"
              />
            </div>
            
            <ScrollArea className="h-[400px] pr-4">
              {activeReports.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-red-500 text-lg font-bold mb-2 flex items-center">
                    <AlertCircle className="mr-2 h-4 w-4 text-red-500" />
                    {t('active_reports')}
                  </h4>
                  <div className="space-y-2">
                    {activeReports.map(report => (
                      <button
                        key={report.id}
                        onClick={() => handleReportClick(report)}
                        className="w-full text-left p-3 rounded-lg bg-black/70 hover:bg-black/20 transition-colors border border-imei-cyan/20"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <span className="text-white text-sm font-medium">
                              {revealedImeis[report.id] ? (decryptedData[report.id]?.imei || (loadingImeis[report.id] ? t('loading') : 'Error')) : maskImei(report.imei)}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleRevealImei(report.id); }}
                              className="ml-2 px-2 py-1 text-xs rounded bg-white/10 text-imei-cyan hover:bg-white/20"
                            >
                              {revealedImeis[report.id] ? 'إخفاء' : 'عرض'}
                            </button>
                          </div>
                          <ChevronDown className="h-4 w-4 text-imei-cyan" />
                        </div>
                        <div className="text-gray-400 text-xs mt-1">
                          {report.report_date ? new Date(report.report_date).toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {resolvedReports.length > 0 && (
                <div>
                  <h4 className="text-red-500 text-lg font-bold mb-2 flex items-center">
                    <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                    {t('resolved_reports')}
                  </h4>
                  <div className="space-y-2">
                    {resolvedReports.map(report => (
                      <button
                        key={report.id}
                        onClick={() => navigateToReport(report)}
                        className="w-full text-left p-3 rounded-lg bg-black/10 hover:bg-black/20 transition-colors border border-imei-cyan/20"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <span className="text-white text-sm font-medium">
                              {revealedImeis[report.id] ? (decryptedData[report.id]?.imei || (loadingImeis[report.id] ? t('loading') : 'Error')) : maskImei(report.imei)}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleRevealImei(report.id); }}
                              className="ml-2 px-2 py-1 text-xs rounded bg-white/10 text-imei-cyan hover:bg-white/20"
                            >
                              {revealedImeis[report.id] ? 'إخفاء' : 'عرض'}
                            </button>
                          </div>
                          <ChevronUp className="h-4 w-4 text-imei-cyan" />
                        </div>
                        <div className="text-gray-400 text-xs mt-1">
                          {report.report_date ? new Date(report.report_date).toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredReports.length === 0 && (
                <div className="text-gray-400 text-sm text-center py-4">
                  {t('no_reports_found')}
                </div>
              )}
            </ScrollArea>
          </div>
  );

  // ⭐ دالة لعرض الـ Modals المشتركة
  const renderModals = () => (
    <>
      {/* Modal لتغيير حالة البلاغ */}
      {showStatusChangeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]">
          <div className="glass-bg rounded-lg p-6 max-w-md w-full">
            <h2 className="text-red-500 text-3xl font-bold mb-4">
              {t('change_report_status')}
            </h2>
            <form onSubmit={handleStatusChangeSubmit} className="space-y-4">
              <div>
                <label htmlFor="statusChangePassword" className="block text-white text-sm font-medium mb-1">
                  {t('password')}
                </label>
                <input
                  type="password"
                  id="statusChangePassword"
                  value={statusChangePassword}
                  onChange={(e) => setStatusChangePassword(e.target.value)}
                  className="bg-[#b8d7d5] w-full text-gray-800 border border-imei-cyan rounded-lg px-3 py-2"
                  required
                />
                <p className="text-sm text-gray-400 mt-1">
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
                  className="px-4 py-2 text-white bg-orange-500 rounded-lg hover:bg-orange-600"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-amber-800 rounded-lg hover:bg-amber-900"
                >
                  {t('confirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Password Dialog */}
      <Dialog open={showReportPasswordDialog} onOpenChange={setShowReportPasswordDialog}>
      <DialogContent className="bg-white/90 backdrop-blur-lg text-gray-800 w-[90%] sm:max-w-md border-2 border-orange-400 shadow-2xl rounded-2xl z-[10000]">
          <DialogHeader className="text-center">
            <DialogTitle className="text-2xl font-bold text-gray-900">{t('enter_report_password')}</DialogTitle>
            <DialogDescription className="text-gray-600">
              {t('enter_password_to_view_report')}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 text-orange-700 mb-4">
            <AlertTriangle className="h-4 w-4 inline-block mr-2 align-middle" />
            <span className="text-sm align-middle">{t('status_change_warning')}</span>
          </div>
          <Input
            type="password"
            value={reportPassword}
            onChange={(e) => setReportPassword(e.target.value)}
            placeholder={t('report_password')}
            className="bg-white/80 border border-orange-200 text-gray-800 placeholder:text-gray-500"
          />
          <DialogFooter className="gap-2 sm:justify-start">
            <Button variant="outline" onClick={() => setShowReportPasswordDialog(false)} className="bg-orange-500 text-white hover:bg-orange-600 border-none">
              {t('cancel')}
            </Button>
            <Button onClick={verifyReportPassword} className="bg-green-600 hover:bg-green-700 text-white">
              {t('verify')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Verification Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
      <DialogContent className="bg-white/90 backdrop-blur-lg text-gray-800 w-[90%] sm:max-w-md border-2 border-orange-400 shadow-2xl rounded-2xl z-[10000]">
          <DialogHeader className="text-center">
            <DialogTitle className="text-2xl font-bold text-gray-900">{t('verify_password')}</DialogTitle>
            <DialogDescription className="text-gray-600">
              {t('enter_password_to_confirm')}
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('password')}
            className="bg-white/80 border border-orange-200 text-gray-800 placeholder:text-gray-500"
          />
          <DialogFooter className="gap-2 sm:justify-start">
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)} className="bg-orange-500 text-white hover:bg-orange-600 border-none">
              {t('cancel')}
            </Button>
            <Button onClick={verifyPassword} className="bg-green-600 hover:bg-green-700 text-white">
              {t('verify')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  // ⭐ عرض زر الإشعارات فقط إذا لم يكن نسخة الشريط السفلي
  if (!isBottomNavbarVersion) {
    return (
      <div className="relative flex items-center gap-4 justify-center align-middle" style={{ minHeight: 40 }}>
        {/* Notifications Megaphone */}
        <button
          onClick={() => {
            setShowNotifications(!showNotifications);
            window.dispatchEvent(new Event('closeMenu'));
          }}
          className="relative p-2 text-imei-cyan hover:text-white transition-colors flex items-center justify-center"
          style={{ minWidth: 36 }}
          aria-label="الإشعارات"
        >
          <Megaphone className="h-7 w-7" style={{ verticalAlign: 'middle' }} />
          {activeReports.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {activeReports.length}
            </span>
          )}
        </button>
        {showNotifications && (
          <div
            className={
              `fixed w-80 bg-white/40 backdrop-blur-lg rounded-lg shadow-lg border border-imei-cyan border-opacity-30 z-[9999]`
            }
            style={{
              top: 90,
              [language === 'ar' ? 'left' : 'right']: 8
            }}
          >
            {/* المحتوى المشترك */}
            {renderContent()}
          </div>
        )}
        {/* باقي الـ Modals */}
        {renderModals()}
      </div>
    );
  }

  // ⭐ عرض المحتوى والـ Modals مباشرة إذا كان نسخة الشريط السفلي
  return (
    <div>
      {renderContent()}
      {renderModals()}
    </div>
  );
};

export default Notifications;
