import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Trash2 } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { supabase } from '@/lib/supabase';

// واجهة البيانات
interface AdDisplay {
  id: number;
  ad_id?: string;
  image_url: string;
  created_at: string;
  expires_at?: string | null;
  type?: string;
  payment_status?: string;
  store_name?: string;
}

const MyAds: React.FC = () => {
  const { t } = useLanguage();
  useScrollToTop();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [myAds, setMyAds] = useState<AdDisplay[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null); // ⭐ تغيير النوع إلى number
  
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmAdId, setConfirmAdId] = useState<number | null>(null); // ⭐ تغيير النوع إلى number

  const handleDelete = async (idToDelete: number) => {
    if (!user) return;
    setDeletingId(idToDelete);
    try {
      console.log(`[Delete] Attempting to delete ad with ID (Number): ${idToDelete}`);

      const { error, count } = await supabase
        .from('publish_ad')
        .delete({ count: 'exact' })
        .eq('id', idToDelete)
        .eq('user_id', user.id); // ⭐ أمان إضافي: الحذف فقط إذا كان المستخدم هو المالك

      if (error) {
        console.error('[Delete] Supabase Error:', error);
        throw new Error(error.message || 'فشل حذف الإعلان');
      }

      if (count === 0) {
        console.warn('[Delete] No rows deleted. ID might not exist.');
        throw new Error('لم يتم العثور على الإعلان');
      }

      console.log(`[Delete] Successfully deleted ${count} row(s).`);

      // تحديث الواجهة
      setMyAds((currentAds) => currentAds.filter((ad) => ad.id !== idToDelete));

      toast({
        title: t('success'),
        description: t('ad_deleted_successfully') || 'تم حذف الإعلان بنجاح'
      });
    } catch (error: any) {
      console.error('[Delete] Operation Failed:', error);
      toast({
        title: t('error'),
        description: error.message || t('delete_error') || 'حدث خطأ أثناء الحذف',
        variant: 'destructive'
      });
    } finally {
      setDeletingId(null);
      setConfirmVisible(false);
    }
  };

  useEffect(() => {
    const loadUserAds = async () => {
      setLoadingAds(true);
      try {
        let query = supabase
          .from('publish_ad')
          .select('id, ad_id, image_url, created_at, expires_at'); 

        if (user) {
          // ⭐ Security: Ensure users only fetch their own ads
          query = query.eq('user_id', user.id);
        }

        const { data: publishAds, error } = await query.order('created_at', { ascending: false });

        if (error) {
          console.error('خطأ في جلب الإعلانات:', error);
          throw error;
        }

        console.log('البيانات المستلمة من Supabase:', publishAds);

        if (publishAds) {
          setMyAds(publishAds);
        }
      } catch (error) {
        console.error('Error fetching user ads:', error);
        toast({
          title: t('error'),
          description: t('error_fetching_ads') || 'حدث خطأ أثناء جلب الإعلانات',
          variant: 'destructive'
        });
      } finally {
        setLoadingAds(false);
      }
    };

    loadUserAds();
  }, [user, t, toast]);

  const isExpired = (expiresAt: string | null | undefined): boolean => {
    if (!expiresAt) return false;
    const expDate = new Date(expiresAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expDate.setHours(0, 0, 0, 0);
    return expDate <= today;
  };

  return (
    <PageContainer>
      <div className="container mx-auto px-4 py-8" dir="rtl">
        <h1 className="text-3xl font-bold text-center mb-8" style={{ color: '#1e3a8a' }}>{t('my_ads') || 'إعلاناتي'}</h1>
        
        {process.env.NODE_ENV === 'development' && (
          <div className="mb-4 p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
            <p>وضع التطوير: جاري جلب البيانات...</p>
            <p>عدد الإعلانات المحملة: {myAds.length}</p>
            <p>معرف المستخدم الحالي: {user?.id || 'غير مسجل'}</p>
          </div>
        )}

        {loadingAds ? (
          <div className="grid md:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl p-4 border border-white/10 bg-white/5 backdrop-blur-sm animate-pulse">
                <div className="w-full h-48 rounded mb-2 bg-white/10" />
                <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
              </div>
            ))}
          </div>
        ) : myAds.length === 0 ? (
          <div className="text-center">
            <p className="text-gray-200 mb-4">{t('no_ads_found') || 'لا توجد إعلانات بعد.'}</p>
            <Button className="mx-auto bg-imei-cyan text-white px-6 py-2 rounded-lg" onClick={() => navigate('/publish-ad')}>{t('publish_ad') || 'انشر إعلان'}</Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {myAds.map((ad) => (
              <div
                key={ad.id}
                className="relative rounded-xl p-4 border-4 flex flex-col gap-2 transition-all duration-300 bg-white/5 backdrop-blur-sm border-imei-cyan/30 bg-white/5"
              >
                {isExpired(ad.expires_at) && (
                  <div
                    className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-8 py-2 rounded-lg shadow-2xl transform -rotate-2"
                    style={{
                      background: 'linear-gradient(135deg, #1e3a8a 0%, #289c8e 100%)',
                      border: '2px solid rgba(255, 255, 255, 0.4)',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                      color: '#ffffff',
                      textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                      fontWeight: '900',
                      fontSize: '1.8rem',
                    }}
                  >
                    {t('ad_ended') || 'تم الانتهاء'}
                  </div>
                )}

                <div className="relative overflow-hidden rounded-lg">
                  <img
                    src={ad.image_url || 'https://via.placeholder.com/400x300?text=No+Image'}
                    alt="Ad"
                    className="w-full h-48 object-cover rounded-md mb-2 border border-white/10 shadow-sm"
                  />
                </div>
                
                <div className="flex flex-col gap-1 leading-relaxed">
                  <span className="text-xs text-black/70 font-light">
                    {t('created_at') || 'تاريخ الإضافة'}: {new Date(ad.created_at).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })}
                  </span>
                  {ad.expires_at && (
                    <span className="text-xs text-red-500 font-bold">
                      {t('expires_at') || 'تنتهي في'}: {new Date(ad.expires_at).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })}
                    </span>
                  )}
                  {ad.ad_id && <span className="text-xs text-gray-500">Ad ID: {ad.ad_id}</span>}
                </div>

                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white hover:bg-red-700"
                    disabled={deletingId === ad.id}
                    onClick={() => {
                      // ⭐ التعديل الحاسم: تمرير ad.id (الرقم) وليس ad.ad_id
                      console.log('Delete Clicked. Passed ID:', ad.id);
                      setConfirmAdId(ad.id);
                      setConfirmVisible(true);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    {deletingId === ad.id
                      ? t('deleting') || 'جاري الحذف...'
                      : t('delete') || 'حذف'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmVisible && confirmAdId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-[90%] max-w-md">
            <h3 className="text-lg font-semibold mb-2 text-imei-cyan">{t('delete_confirmation') || 'هل أنت متأكد من حذف هذا الإعلان؟'}</h3>
            <p className="text-sm text-gray-600 mb-4">{t('delete_confirmation_desc') || 'لا يمكن التراجع عن هذا الإجراء.'}</p>
            <div className="flex gap-3 justify-end">
              <Button 
                variant="ghost" 
                onClick={() => setConfirmVisible(false)}
                className="bg-gray-200 text-gray-800 hover:bg-gray-300"
              >
                {t('cancel') || 'إلغاء'}
              </Button>
              <Button
                variant="destructive"
                onClick={() => confirmAdId !== null && handleDelete(confirmAdId)}
                disabled={deletingId === confirmAdId}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deletingId === confirmAdId ? (t('deleting') || 'جاري الحذف...') : (t('delete') || 'حذف')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default MyAds;
