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
import axiosInstance from '@/services/axiosInterceptor';
import { useDevRequestDeduper } from '@/hooks/useDevRequestDeduper';

// واجهة البيانات
interface AdDisplay {
  id: number | string;
  ad_id?: string;
  image_url: string;
  created_at: string;
  expires_at?: string | null;
  type?: string;
  payment_status?: string;
  store_name?: string;
  status?: string;
  source?: 'publish_ad' | 'package_payment';
}

const MyAds: React.FC = () => {
  const { t } = useLanguage();
  useScrollToTop();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [myAds, setMyAds] = useState<AdDisplay[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [deletingId, setDeletingId] = useState<number | string | null>(null);
  
  const [confirmAd, setConfirmAd] = useState<AdDisplay | null>(null);
  const shouldRunRequest = useDevRequestDeduper();

  const handleDelete = async (adToDelete: AdDisplay) => {
    if (!user) return;
    setDeletingId(adToDelete.id);
    try {
      if (adToDelete.source === 'package_payment') {
        await axiosInstance.delete(`/api/ads/my-pending-package/${encodeURIComponent(String(adToDelete.id))}`);
      } else {
        const { error, count } = await supabase
          .from('publish_ad')
          .delete({ count: 'exact' })
          .eq('id', adToDelete.id)
          .eq('user_id', user.id);

        if (error) throw new Error(error.message || 'فشل حذف الإعلان');
        if (count === 0) throw new Error('لم يتم العثور على الإعلان');
      }

      setMyAds((currentAds) => currentAds.filter((ad) => ad.id !== adToDelete.id || ad.source !== adToDelete.source));

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
      setConfirmAd(null);
    }
  };

  useEffect(() => {
    if (!shouldRunRequest(`MyAds:loadUserAds:${user?.id || 'guest'}`)) {
      return;
    }

    const loadUserAds = async () => {
      setLoadingAds(true);
      try {
        let query = supabase
          .from('publish_ad')
          .select('id, ad_id, image_url, created_at, expires_at, user_id'); 

        if (user) {
          query = query.eq('user_id', user.id);
        }

        const { data: publishAds, error } = await query.order('created_at', { ascending: false });

        if (error) {
          console.error('خطأ في جلب الإعلانات:', error);
          throw error;
        }

        console.log('البيانات المستلمة من Supabase:', publishAds);

        const userPublishAds: AdDisplay[] = (publishAds || []).map((ad: any) => ({ ...ad, source: 'publish_ad' }));
        let packagePendingAds: AdDisplay[] = [];
        if (user?.id) {
          try {
            const { data } = await axiosInstance.get('/api/ads/my-pending-package');
            packagePendingAds = (data?.ads || []).map((ad: any) => ({
              ...ad,
              id: String(ad.id),
              created_at: ad.created_at || ad.upload_date,
              source: 'package_payment',
            }));
          } catch (error) {
            console.warn('Could not load pending package ads:', error);
          }
        }
        setMyAds([...userPublishAds, ...packagePendingAds].sort((first, second) =>
          new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
        ));
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
  }, [user, t, toast, shouldRunRequest]);

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
                key={`${ad.source || 'publish_ad'}-${ad.id}`}
                className="relative rounded-xl p-4 border-4 flex flex-col gap-2 transition-all duration-300 bg-white/5 backdrop-blur-sm border-imei-cyan/30"
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
                  {ad.status === 'pending' && (
                    <span className="w-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">قيد المراجعة</span>
                  )}
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
                    onClick={() => setConfirmAd(ad)}
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
      {confirmAd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-[90%] max-w-md">
            <h3 className="text-lg font-semibold mb-2 text-imei-cyan">{t('delete_confirmation') || 'هل أنت متأكد من حذف هذا الإعلان؟'}</h3>
            <p className="text-sm text-gray-600 mb-4">{t('delete_confirmation_desc') || 'لا يمكن التراجع عن هذا الإجراء.'}</p>
            <div className="flex gap-3 justify-end">
              <Button 
                variant="ghost" 
                onClick={() => setConfirmAd(null)}
                className="bg-gray-200 text-gray-800 hover:bg-gray-300"
              >
                {t('cancel') || 'إلغاء'}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleDelete(confirmAd)}
                disabled={deletingId === confirmAd.id}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deletingId === confirmAd.id ? (t('deleting') || 'جاري الحذف...') : (t('delete') || 'حذف')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default MyAds;
