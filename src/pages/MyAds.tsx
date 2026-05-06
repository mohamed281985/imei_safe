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
  adType: 'normal' | 'special' | 'publish';
  user_id: string;
  upload_date?: string;
  created_at?: string;
  latitude?: number;
  longitude?: number;
  expires_at?: string;
  duration_days?: number;
}

const sanitizeServerValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  let sanitized = typeof value === 'string' ? value.trim() : JSON.stringify(value).trim();
  if (!sanitized) return '';

  if (sanitized.includes('encryptedData') || sanitized.includes('authTag') || sanitized.includes('iv')) {
    return '';
  }
  if ((sanitized.startsWith('{') && sanitized.endsWith('}')) || (sanitized.startsWith('[') && sanitized.endsWith(']'))) {
    return '';
  }
  sanitized = sanitized.replace(/^[\s\[\{\("']+|[\s\]\}\)"']+$/g, '').trim();
  return sanitized;
};

const normalizeWebsiteUrl = (url: string): string => {
  const cleanUrl = sanitizeServerValue(url);
  if (!cleanUrl) return '';
  if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) return cleanUrl;
  return `https://${cleanUrl}`;
};

const sanitizeAd = (ad: any): Ad => ({
  ...ad,
  store_name: sanitizeServerValue(ad.store_name),
  website_url: sanitizeServerValue(ad.website_url),
  image_url: sanitizeServerValue(ad.image_url),
});

const MyAds: React.FC = () => {
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
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmAdId, setConfirmAdId] = useState<string | null>(null);
  const [confirmAdType, setConfirmAdType] = useState<'normal' | 'special' | 'publish' | null>(null);

  const handleDelete = async (adId: string, adType: 'normal' | 'special' | 'publish') => {
    setDeletingId(adId);
    try {
      // تحديد الجدول المناسب بناءً على نوع الإعلان
      const tableName = adType === 'publish' ? 'publish_ad' : 'ads_payment';
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

      // إذا كان الإعلان من نوع publish، حاول حذفه أيضًا من ads_payment إذا كان موجودًا
      if (adType === 'publish') {
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
      setConfirmVisible(false);
    }
  };

  const handleEdit = async (adId: string, adType: 'normal' | 'special' | 'publish') => {
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
          .from('publish_ad')
          .select('*')
          .eq('user_id', user.id)
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
          ...sanitizeAd(ad),
          adType: 'publish',
        }));

        const mappedSpecialAds: Ad[] = (specialAds || []).map((ad: any) => ({
          ...sanitizeAd(ad),
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
      <div className="container mx-auto px-4 py-8" dir="rtl">
        <h1 className="text-3xl font-bold text-center mb-8" style={{ color: '#1e3a8a' }}>{t('my_ads') || 'إعلاناتي'}</h1>
        {loadingAds ? (
          <div className="grid md:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl p-4 border border-white/10 bg-white/5 backdrop-blur-sm animate-pulse">
                <div className="w-full h-48 rounded mb-2 bg-white/10" />
                <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
                <div className="h-3 bg-white/10 rounded w-1/2" />
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
                key={`${ad.adType}-${ad.id}`}
                className={`relative rounded-xl p-4 border-4 flex flex-col gap-2 transition-all duration-300 bg-white/5 backdrop-blur-sm ${ad.adType === 'special'
                  ? 'border-yellow-400/60 bg-gradient-to-r from-yellow-50/10 to-yellow-100/5 shadow-lg shadow-yellow-500/10'
                  : 'border-imei-cyan/30 bg-white/5'}
                  `}
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
                        {t('ad_ended') || 'تم الانتهاء'}
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="relative overflow-hidden rounded-lg">
                  <img
                    src={ad.image_url}
                    alt={sanitizeServerValue(ad.store_name) || 'ad'}
                    className="w-full h-48 object-cover rounded-md mb-2 border border-white/10 shadow-sm"
                  />
                </div>
                <div className="flex flex-col gap-1 leading-relaxed">
                  <span className="text-[#289c8e] font-extrabold text-xl tracking-tight">
                    {sanitizeServerValue(ad.store_name) || t('ad')}
                    {ad.adType === 'special' && (
                      <span className="ml-2 text-yellow-400 text-xs font-bold">{t('special') || 'إعلان مميز'}</span>
                    )}
                  </span>
                  {/* مدة الإعلان وتاريخ الانتهاء */}
                  <span className="text-sm text-black font-medium">
                    {t('ad_duration') || 'مدة الإعلان'}: <span className="font-bold">{ad.duration_days || '-'}</span> {t('days') || 'يوم'}
                  </span>
                  <span className="text-sm font-medium" style={{ color: '#ef4444' }}>
                    {t('expires_at') || 'تاريخ الانتهاء'}:
                    {ad.expires_at
                      ? (() => {
                        const dateObj = new Date(ad.expires_at);
                        if (!isNaN(dateObj.getTime())) {
                          return ` ${dateObj.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })} - ${dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
                        }
                        return ` ${ad.expires_at}`;
                      })()
                      : '-'}
                  </span>
                  {normalizeWebsiteUrl(ad.website_url || '') && (
                    <a
                      href={normalizeWebsiteUrl(ad.website_url || '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#289c8e] text-xs underline font-semibold hover:text-cyan-400 transition-colors"
                    >
                      {normalizeWebsiteUrl(ad.website_url || '')}
                    </a>
                  )}
                  <span className="text-xs text-black/70 font-light">{ad.upload_date?.slice(0, 10)}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 flex items-center gap-2 bg-imei-cyan text-white hover:brightness-95"
                    onClick={() => handleEdit(ad.id, ad.adType)}
                    aria-label={`${t('edit') || 'تعديل'} ${sanitizeServerValue(ad.store_name)}`}
                  >
                    <Edit className="w-4 h-4" /> {t('edit') || 'تعديل'}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1 flex items-center gap-2 bg-red-600 text-white hover:bg-red-700"
                    disabled={deletingId === ad.id}
                    onClick={() => {
                      console.log('تأكيد حذف: نوع الإعلان', ad.adType, 'بيانات الإعلان:', ad);
                      setConfirmAdId(ad.id);
                      setConfirmAdType(ad.adType);
                      setConfirmVisible(true);
                    }}
                    aria-label={`${t('delete') || 'حذف'} ${sanitizeServerValue(ad.store_name)}`}
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
      {confirmVisible && confirmAdId && (
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
                onClick={() => confirmAdId && confirmAdType && handleDelete(confirmAdId, confirmAdType)}
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
