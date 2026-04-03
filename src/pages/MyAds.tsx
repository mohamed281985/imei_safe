import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAds } from '../contexts/AdContext';
import { Edit, Trash2 } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useScrollToTop } from '@/hooks/useScrollToTop';

// Import the ads_payment type from AdContext to ensure consistency
import type { ads_payment } from '../contexts/AdContext';
import { supabase } from '@/lib/supabase';

interface Ad extends Omit<ads_payment, 'adType'> {
  adType: 'normal' | 'special';
  user_id: string;
  upload_date?: string;
  created_at?: string;
  latitude?: number;
  longitude?: number;
  expires_at?: string;
  duration_days?: number;
}

const MyAds: React.FC = (): React.ReactNode => {
  const { t } = useLanguage();
  useScrollToTop();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { ads: rawAds, deleteAd } = useAds();
  const ads = rawAds as ads_payment[];
  const [myAds, setMyAds] = useState<Ad[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (adId: string, adType: 'normal' | 'special') => {
    if (!window.confirm(t('delete_confirmation') || 'هل أنت متأكد من حذف هذا الإعلان؟')) {
      return;
    }

    setDeletingId(adId);
    try {
      const tableName = adType === 'special' ? 'ads_payment' : 'ads_payment';
      console.log(`محاولة حذف الإعلان ID: ${adId} من جدول: ${tableName}`);

      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', adId)
        .eq('user_id', user?.id);

      if (error) {
        console.error(`خطأ في حذف الإعلان من ${tableName}:`, error);
        throw new Error(`فشل حذف الإعلان من ${tableName}`);
      }

      // إذا كان الإعلان مميزًا، قد نرغب في حذفه من كلا الجدولين إذا كان موجودًا
      if (adType === 'special') {
        // محاولة الحذف الاحترازي مع التحقق من الملكية
        await supabase.from('ads_payment').delete().eq('id', adId).eq('user_id', user?.id);
      }

      console.log('تم التأكد من حذف الإعلان بنجاح');
      console.log('تحديث واجهة المستخدم...');

      setMyAds((currentAds) => currentAds.filter((ad) => ad.id !== adId));
      await deleteAd(adId, adType === 'special');

      toast({
        title: t('success'),
        description: t('ad_deleted_successfully') || 'تم حذف الإعلان بنجاح'
      });
    } catch (error: any) {
      console.error('تفاصيل الخطأ الكامل:', {
        error,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      toast({
        title: t('error'),
        description: error.message || t('delete_error') || 'حدث خطأ أثناء الحذف',
        variant: 'destructive'
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = async (adId: string, adType: 'normal' | 'special') => {
    const path = adType === 'special' ? '/special-ad' : '/publish-ad';
    navigate(`${path}?id=${adId}`);
  };

  useEffect(() => {
    const loadUserAds = async () => {
      if (!user) return;
      setLoadingAds(true);
      try {
        // جلب الإعلانات العامة (publish)
        const { data: publishAds, error: publishError } = await supabase
          .from('ads_payment')
          .select('*')
          .eq('user_id', user.id)
          .eq('type', 'publish')
          .eq('payment_status', 'paid') // التأكد من أن الدفع مكتمل
          .eq('is_paid', true);
        if (publishError) {
          console.error('خطأ في جلب الإعلانات العامة:', publishError);
        }

        // جلب الإعلانات المميزة (special)
        const { data: specialAds, error: specialError } = await supabase
          .from('ads_payment')
          .select('*')
          .eq('user_id', user.id)
          .eq('type', 'special')
          .eq('payment_status', 'paid') // التأكد من أن الدفع مكتمل
          .eq('is_paid', true);

        if (specialError) {
          console.error('خطأ في جلب الإعلانات المميزة:', specialError);
        }

        // منطق الحذف بعد 3 أيام من الانتهاء
        const now = new Date();
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000; // 3 أيام بالمللي ثانية

        const expiredAds = [
          ...(publishAds || []).filter(ad => ad.expires_at && new Date(ad.expires_at) < now),
          ...(specialAds || []).filter((ad: any) => ad.expires_at && new Date(ad.expires_at) < now)
        ];

        for (const expiredAd of expiredAds) {
          const expiredDate = new Date(expiredAd.expires_at);
          if (now.getTime() - expiredDate.getTime() > threeDaysMs) {
            // حذف من جدول الإعلانات العادية
            if (expiredAd.id) {
              await supabase.from('ads_payment').delete().eq('id', expiredAd.id).eq('user_id', user.id);
            }
            // حذف من جدول الإعلانات المميزة إذا كان مميزًا
            if (expiredAd.adType === 'special' || expiredAd.is_paid) {
              await supabase.from('ads_payment').delete().eq('id', expiredAd.id).eq('user_id', user.id);
            }
          }
        }

        // اعرض جميع الإعلانات بما فيها المنتهية
        const mappedPublishAds: Ad[] = (publishAds || []).map((ad: any) => ({
          ...ad,
          adType: 'publish',
        }));

        const mappedSpecialAds: Ad[] = (specialAds || []).map((ad: any) => ({
          ...ad,
          adType: 'special',
        }));

        // دمج القائمتين
        const combinedAds = [...mappedPublishAds, ...mappedSpecialAds];

        // استخدام Map لإزالة التكرارات مع إعطاء الأولوية للإعلانات المميزة
        // نفترض أن image_url فريد لكل إعلان
        const adMap = new Map<string, Ad>();
        combinedAds.forEach(ad => {
          const existingAd = adMap.get(ad.image_url);
          if (!existingAd || ad.adType === 'special') {
            adMap.set(ad.image_url, ad);
          }
        });

        const uniqueAds = Array.from(adMap.values());
        uniqueAds.sort((a, b) => new Date(b.created_at || b.upload_date || '').getTime() - new Date(a.created_at || a.upload_date || '').getTime());
        setMyAds(uniqueAds);
      } catch (error) {
        console.error('Error filtering user ads:', error);
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
  }, [user, t, toast]); // تمت إزالة ads من الاعتماديات لأننا نجلبها مباشرة



  return (
    <PageContainer>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-center mb-8">{t('my_ads') || 'إعلاناتي'}</h1>
        {loadingAds ? (
          <div className="text-center text-gray-400">{t('loading') || 'جاري التحميل...'}</div>
        ) : myAds.length === 0 ? (
          <div className="text-center text-gray-400">{t('no_ads_found') || 'لا توجد إعلانات بعد.'}</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {myAds.map((ad) => (
              <div
                key={`${ad.adType}-${ad.id}`}
                className={`relative bg-imei-darker rounded-xl p-4 border flex flex-col gap-2 transition-all duration-300 ${ad.adType === 'special'
                  ? 'border-yellow-500/50 bg-gradient-to-br from-yellow-900/20 via-imei-darker to-imei-darker shadow-lg shadow-yellow-500/10'
                  : 'border-imei-cyan/20'
                  }`}
              >
                {/* شعار انتهاء الإعلان بأسلوب ملصق مطلوب */}
                {ad.adType === 'special' && ad.expires_at && new Date(ad.expires_at) > new Date() && (
                  <div className="absolute top-2 right-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-2 py-1 rounded-full text-xs font-bold shadow-md z-10">
                    {t('special') || 'مميز'}
                  </div>
                )}

                {(() => {
                  // تحقق من انتهاء الإعلان بدقة مع معالجة تنسيقات التاريخ
                  if (!ad.expires_at) return null;
                  let expDate;
                  if (typeof ad.expires_at === 'string' && ad.expires_at.length === 10 && ad.expires_at.includes('-')) {
                    // تنسيق yyyy-mm-dd
                    expDate = new Date(ad.expires_at + 'T00:00:00');
                  } else {
                    expDate = new Date(ad.expires_at);
                  }
                  if (isNaN(expDate.getTime())) return null;
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  expDate.setHours(0, 0, 0, 0);
                  if (expDate <= today) {
                    return (
                      <div
                        className="absolute top-0 left-1/2 -translate-x-1/2 z-50 px-8 py-3 rounded-md border-4 border-[#6b4f28] shadow-xl"
                        style={{
                          background: 'linear-gradient(135deg, #f5e6c3 80%, #c2a06c 100%)',
                          fontFamily: 'Impact, Arial Black, sans-serif',
                          color: '#2d1c0b',
                          textShadow: '2px 2px 6px #c2a06c, 0 1px 0 #fff',
                          fontWeight: 'bold',
                          fontSize: '2rem',
                          letterSpacing: '2px',
                          boxShadow: '0 4px 16px 0 rgba(0,0,0,0.25)',
                          borderRadius: '12px',
                          borderColor: '#6b4f28',
                          borderStyle: 'solid',
                          borderWidth: '4px', //
                        }}
                      >
                        تم الانتهاء
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="relative">
                  <img
                    src={ad.image_url}
                    alt="ad"
                    className="w-full h-40 object-contain rounded mb-2 bg-black/10"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-white font-semibold">
                    {ad.store_name || t('ad')}
                    {ad.adType === 'special' && (
                      <span className="ml-2 text-yellow-500 text-xs">{t('special') || 'إعلان مميز'}</span>
                    )}
                  </span>
                  {/* مدة الإعلان وتاريخ الانتهاء */}
                  <span className="text-xs text-imei-cyan">
                    {t('ad_duration') || 'مدة الإعلان'}: {ad.duration_days || '-'} {t('days') || 'يوم'}
                  </span>
                  <span className="text-xs text-red-400">
                    {t('expires_at') || 'تاريخ الانتهاء'}:
                    {ad.expires_at
                      ? (() => {
                        const dateObj = new Date(ad.expires_at);
                        if (!isNaN(dateObj.getTime())) {
                          // عرض التاريخ والوقت حسب توقيت المستخدم المحلي
                          return ` ${dateObj.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })} - ${dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
                        }
                        return ` ${ad.expires_at}`;
                      })()
                      : '-'}
                  </span>
                  {ad.website_url && (
                    <a
                      href={ad.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-imei-cyan text-xs underline"
                    >
                      {ad.website_url}
                    </a>
                  )}
                  <span className="text-xs text-gray-400">{ad.upload_date?.slice(0, 10)}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 flex items-center gap-1 border-imei-cyan text-imei-cyan hover:bg-imei-cyan/10"
                    onClick={() => handleEdit(ad.id, ad.adType)}
                  >
                    <Edit className="w-4 h-4" /> {t('edit') || 'تعديل'}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1 flex items-center gap-1"
                    disabled={deletingId === ad.id}
                    onClick={() => {
                      console.log('زر الحذف: نوع الإعلان', ad.adType, 'بيانات الإعلان:', ad);
                      handleDelete(ad.id, ad.adType);
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
    </PageContainer>
  );
};

export default MyAds;
