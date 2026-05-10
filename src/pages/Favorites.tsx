import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Heart, Trash2, Package, ChevronRight } from 'lucide-react'; // ✅ تمت إضافة ChevronRight هنا

interface FavItem {
  id: string;
  title: string;
  price?: number;
  image?: string;
  type: 'phone' | 'accessory';
}

const Favorites: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [items, setItems] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [flippedIds, setFlippedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const raw = localStorage.getItem('favorites');
        const ids: string[] = raw ? JSON.parse(raw) : [];
        
        if (ids.length === 0) {
          setItems([]);
          setLoading(false);
          return;
        }

        // Fetch phones first
        const { data: phones } = await supabase.from('phones').select('id,title,price,phone_images(image_path)').in('id', ids);
        const phoneMap = (phones || []).reduce((acc: Record<string, any>, p: any) => { acc[p.id] = p; return acc; }, {});

        // Fetch accessories
        const { data: accessories } = await supabase.from('accessories').select('id,title,price,accessory_images(image_path)').in('id', ids);
        const accessoryMap = (accessories || []).reduce((acc: Record<string, any>, a: any) => { acc[a.id] = a; return acc; }, {});

        const out: FavItem[] = ids.map(id => {
          if (phoneMap[id]) {
            const p = phoneMap[id];
            return { id: p.id, title: p.title, price: p.price, image: p.phone_images?.[0]?.image_path, type: 'phone' };
          }
          if (accessoryMap[id]) {
            const a = accessoryMap[id];
            return { id: a.id, title: a.title, price: a.price, image: a.accessory_images?.[0]?.image_path, type: 'accessory' };
          }
          return { id, title: t('unknown_item'), type: 'phone' } as FavItem;
        });

        setItems(out);
      } catch (err) {
        console.error('Error loading favorites', err);
        toast({ title: t('error'), description: t('error_loading_favorites'), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [t, toast]);

  const openItem = (id: string) => navigate(`/product/${id}`);

  const toggleFlip = (id: string) => {
    setFlippedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const removeFavorite = (id: string) => {
    try {
      const raw = localStorage.getItem('favorites');
      const arr: string[] = raw ? JSON.parse(raw) : [];
      const next = arr.filter(x => x !== id);
      localStorage.setItem('favorites', JSON.stringify(next));
      setItems(prev => prev.filter(i => i.id !== id));
      setFlippedIds(prev => ({ ...prev, [id]: false }));
      toast({ title: 'تم الحذف' });
    } catch (e) {
      console.error('Failed to remove favorite', e);
      toast({ title: 'فشل الحذف', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#F5F9FF]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#0A84FF] border-t-transparent"></div>
          <div className="text-xl font-bold text-[#0A84FF]">{t('loading')}...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#F5F9FF] pb-24 font-['Tajawal','Cairo',sans-serif]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#F5F9FF]/90 backdrop-blur-md border-b border-white/20 px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-2xl  mt-6 font-black text-gray-900">
            {t('favorites')}
          </h1>
          <span className="text-sm  mt-6 font-bold text-gray-500 bg-white/50 px-4 py-1 rounded-full shadow-sm">
            {items.length} {t('items')}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-white/50 py-20 text-center">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gray-100">
              <Heart className="h-12 w-12 text-gray-400" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-gray-800">{t('no_favorites_title')}</h2>
            <p className="text-gray-500">{t('no_favorites_desc')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {items.map(item => (
              <div 
                key={item.id} 
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)] transition-all duration-300 hover:shadow-[0_20px_40px_rgba(10,132,255,0.15)] hover:-translate-y-1"
              >
                {/* Flip overlay for delete confirmation */}
                {flippedIds[item.id] && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/95 p-4">
                    <p className="mb-4 text-center font-bold text-gray-800">هل تريد حذف هذا من المفضلة؟</p>
                    <div className="flex gap-3">
                      <button onClick={() => removeFavorite(item.id)} className="rounded-lg bg-red-500 px-4 py-2 text-white font-bold">تأكيد</button>
                      <button onClick={() => toggleFlip(item.id)} className="rounded-lg bg-gray-200 px-4 py-2">إلغاء</button>
                    </div>
                  </div>
                )}
                {/* Image Section */}
                <div className="relative h-48 w-full overflow-hidden bg-gray-100">
                  <img 
                    src={item.image || '/placeholder.png'} 
                    alt={item.title} 
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  {/* Type Badge */}
                  <div className="absolute top-3 right-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold shadow-sm backdrop-blur-sm">
                    {item.type === 'phone' ? t('phone') : t('accessory')}
                  </div>
                  {/* Delete (flip) button */}
                  <button onClick={() => toggleFlip(item.id)} className="absolute top-3 left-3 z-10 rounded-full bg-white/90 p-2 shadow-sm">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </button>
                </div>

                {/* Content Section */}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 flex-1 text-lg font-bold text-gray-900 leading-tight">
                      {item.title}
                    </h3>
                  </div>
                  
                  {item.price && (
                    <div className="flex items-end gap-1">
                      <span className="text-xl font-black text-[#0A84FF]">
                        {item.price.toLocaleString('en-US')}
                      </span>
                      <span className="mb-1 text-sm font-bold text-gray-400">{t('currency')}</span>
                    </div>
                  )}
                </div>

                {/* Action Button */}
                <div className="mt-auto pt-4">
                  <button 
                    onClick={() => openItem(item.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0A84FF] py-3 text-base font-bold text-white shadow-md transition-transform active:scale-95"
                  >
                    {t('view_details')}
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Favorites;
