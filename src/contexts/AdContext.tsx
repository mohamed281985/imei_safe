import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface ads_payment {
  id: string;
  image_url: string;
  is_active: boolean;
  page?: string;
  website_url?: string;
  adType?: 'normal' | 'special';
  store_name?: string;
  user_id?: string;
  upload_date?: string;
  created_at?: string;
  latitude?: number;
  longitude?: number;
}

interface AdContextType {
  ads: ads_payment[];
  deleteAd: (adId: string, isSpecialAd: boolean) => Promise<void>;
  updateAd: (adId: string, newData: Partial<ads_payment>, isSpecialAd: boolean) => Promise<void>;
  refreshAds: () => Promise<void>;
}
interface AdContextType {
  ads: ads_payment[];
  deleteAd: (adId: string, isSpecialAd: boolean) => Promise<void>;
  updateAd: (adId: string, newData: Partial<ads_payment>, isSpecialAd: boolean) => Promise<void>;
  refreshAds: () => Promise<void>;
}

const AdContext = createContext<AdContextType | undefined>(undefined);

export function AdProvider({ children }: { children: React.ReactNode }) {
  const [ads, setAds] = useState<ads_payment[]>([]);
  const [isAdModalOpen, setIsAdModalOpen] = useState(false);

  const refreshAds = async () => {
    try {
      // جلب الإعلانات العادية
      const { data: normalAds, error: normalError } = await supabase
        .from('ads_payment')
        .select('*')
        .eq('is_active', true);

      // جلب الإعلانات المميزة المدفوعة فقط
      const { data: specialAds, error: specialError } = await supabase
        .from('ads_payment')
        .select('*')
        .eq('is_active', true)
        .eq('is_paid', true)
        .gt('expires_at', new Date().toISOString());

      if (normalError) console.error('Error fetching normal ads:', normalError);
      if (specialError) console.error('Error fetching special ads:', specialError);

      // دمج الإعلانات مع إضافة نوع الإعلان
      const allAds = [
        ...(normalAds?.map(ad => ({ ...ad, adType: 'normal' as const })) || []),
        ...(specialAds?.map(ad => ({ ...ad, adType: 'special' as const })) || [])
      ];

      setAds(allAds);
    } catch (error) {
      console.error('Error in refreshAds:', error);
    }
  };

  const deleteAd = async (adId: string, isSpecialAd: boolean) => {
    try {
      const table = isSpecialAd ? 'ads_payment' : 'ads_payment';
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', adId);

      if (error) throw error;

      // تحديث حالة الإعلانات محلياً
      setAds(currentAds => currentAds.filter(ad => ad.id !== adId));

      // تحديث كل الإعلانات
      await refreshAds();
    } catch (error) {
      console.error('Error deleting ad:', error);
      throw error;
    }
  };

  const updateAd = async (adId: string, newData: Partial<ads_payment>, isSpecialAd: boolean) => {
    try {
      const table = isSpecialAd ? 'ads_payment' : 'ads_payment';
      const { error } = await supabase
        .from(table)
        .update(newData)
        .eq('id', adId);

      if (error) throw error;

      // تحديث حالة الإعلانات محلياً
      setAds(currentAds => 
        currentAds.map(ad => 
          ad.id === adId ? { ...ad, ...newData } : ad
        )
      );

      // تحديث كل الإعلانات
      await refreshAds();
    } catch (error) {
      console.error('Error updating ad:', error);
      throw error;
    }
  };

  // تحميل الإعلانات عند بدء التطبيق
  useEffect(() => {
    refreshAds();
  }, []);

  const openAdModal = () => setIsAdModalOpen(true);
  const closeAdModal = () => setIsAdModalOpen(false);

  return (
    <AdContext.Provider value={{ ads, deleteAd, updateAd, refreshAds }}>
      {children}
    </AdContext.Provider>
  );
}

export function useAds() {
  const context = useContext(AdContext);
  if (context === undefined) {
    throw new Error('useAds must be used within an AdProvider');
  }
  return context;
}
