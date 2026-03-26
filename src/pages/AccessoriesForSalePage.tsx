import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import PageContainer from '@/components/PageContainer';
import AppNavbar from '@/components/AppNavbar';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { Crown, Smartphone, Search, Star } from 'lucide-react';
import { useGeolocated } from 'react-geolocated';

interface Accessory {
    id: string;
    title: string;
    price: number;
    condition: 'new' | 'used';
    store_name?: string;
    accessory_images: { image_path: string; main_image: boolean }[];
    role?: string;
    latitude?: number;
    longitude?: number;
    distance?: number;
    category?: string;
    brand?: string;
    created_at?: string; // Added created_at property
    type?: 'promotions' | 'normal';
}

const getAccessoryMainImage = (accessory: any): string | null => {
    if (!accessory?.accessory_images?.length) return null;
    const mainImage = accessory.accessory_images.find((img: any) => img.main_image);
    return mainImage?.image_path || accessory.accessory_images[0]?.image_path || null;
};

const getTransformedImageUrl = (originalUrl: string | null | undefined): string => {
    if (!originalUrl) {
        return '/placeholder-phone.png';
    }
    try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseUrl) return '/placeholder-phone.png';
        if (originalUrl.startsWith('http')) return originalUrl;
        return `${supabaseUrl}/storage/v1/object/public/accessory-images/${originalUrl}`;
    } catch (e) {
        console.debug('Error processing image URL:', e);
        return '/placeholder-phone.png';
    }
};

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

const AccessoriesForSalePage: React.FC = () => {
    const { t } = useLanguage();
    const { i18n } = useTranslation();
    const [accessories, setAccessories] = useState<Accessory[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCondition, setSelectedCondition] = useState('all');
    const [priceRange, setPriceRange] = useState({ min: '', max: '' });
    const [sortBy, setSortBy] = useState('newest');
    const { coords } = useGeolocated({ positionOptions: { enableHighAccuracy: true } });

    useEffect(() => {
        const fetchAccessories = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('accessories')
                .select(`*, accessory_images(image_path, main_image)`)
                .eq('status', 'active')
                .order('created_at', { ascending: false });

            if (error) {
                console.debug('Error fetching accessories:', error);
                setAccessories([]);
            } else {
                setAccessories(data || []);
            }
            setLoading(false);
        };

        fetchAccessories();
    }, []);

    const getFilteredAccessories = () => {
        const filtered = accessories.filter(acc => {
            const searchString = searchTerm.toLowerCase();
            const matchesSearch = !searchTerm ||
                (acc.title && acc.title.toLowerCase().includes(searchString)) ||
                (acc.brand && acc.brand.toLowerCase().includes(searchString)) ||
                (acc.category && acc.category.toLowerCase().includes(searchString));

            const matchesCondition = selectedCondition === 'all' || acc.condition === selectedCondition;
            const matchesPrice = (!priceRange.min || acc.price >= Number(priceRange.min)) &&
                (!priceRange.max || acc.price <= Number(priceRange.max));

            return matchesSearch && matchesCondition && matchesPrice;
        });

        return filtered.sort((a, b) => {
            const isAPromoted = a.type === 'promotions';
            const isBPromoted = b.type === 'promotions';

            // 1. الإعلانات المميزة أولاً
            if (isAPromoted && !isBPromoted) return -1;
            if (isBPromoted && !isAPromoted) return 1;

            // 2. الترتيب حسب أولوية الدور (الأولوية الأعلى أولاً)
            const rolePriority: { [key: string]: number } = {
                'gold_business': 1,
                'silver_business': 2,
                'free_business': 3,
            };
            const priorityA = rolePriority[a.role as keyof typeof rolePriority] || 99;
            const priorityB = rolePriority[b.role as keyof typeof rolePriority] || 99;
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // 3. بعد ذلك، تطبيق الترتيب المطلوب من قبل المستخدم
            if (sortBy === 'price-asc') return a.price - b.price;
            if (sortBy === 'price-desc') return b.price - a.price;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    };

    const filteredAccessories = getFilteredAccessories();

    return (
        <PageContainer>
            <AppNavbar />
            <div className="p-4 mb-10">
                {/* قسم البحث والفلترة */}
                <div className="bg-white/80 backdrop-blur-lg rounded-xl p-3 mb-4 shadow-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="relative">
                            <Search className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder={t('search_accessories')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-3 pr-8 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black placeholder:text-gray-400 text-sm"
                            />
                        </div>

                        <div className="flex gap-2">
                            <select
                                value={selectedCondition}
                                onChange={(e) => setSelectedCondition(e.target.value)}
                                className="px-2 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-black text-sm"
                            >
                                <option value="all">{t('all_conditions')}</option>
                                <option value="new">{t('new')}</option>
                                <option value="used">{t('used')}</option>
                            </select>

                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="px-2 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-black text-sm"
                            >
                                <option value="newest">{t('newest')}</option>
                                <option value="price-asc">{t('price_low_to_high')}</option>
                                <option value="price-desc">{t('price_high_to_low')}</option>
                            </select>
                        </div>
                    </div>

                    <div className="mt-3 flex gap-3">
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                placeholder={t('price_from')}
                                value={priceRange.min}
                                onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
                                className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-black placeholder:text-gray-400 text-sm"
                            />
                            <span className="text-gray-500 text-sm">{t('to')}</span>
                            <input
                                type="number"
                                placeholder={t('price_to')}
                                value={priceRange.max}
                                onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
                                className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-black placeholder:text-gray-400 text-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* عرض النتائج */}
                {loading ? (
                    <div className="text-center text-white py-10">{t('loading')}...</div>
                ) : filteredAccessories.length === 0 ? (
                    <div className="bg-white/80 backdrop-blur-lg rounded-xl p-8 text-center">
                        <Smartphone className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                        <h3 className="text-xl font-bold text-gray-800 mb-2">{t('no_results')}</h3>
                        <p className="text-gray-600">
                            {searchTerm || selectedCondition !== 'all' || priceRange.min || priceRange.max
                                ? t('no_accessories_matching_criteria')
                                : t('no_accessories_available_now')}
                        </p>
                        {(searchTerm || selectedCondition !== 'all' || priceRange.min || priceRange.max) && (
                            <button
                                onClick={() => {
                                    setSearchTerm('');
                                    setSelectedCondition('all');
                                    setPriceRange({ min: '', max: '' });
                                    setSortBy('newest');
                                }}
                                className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
                            >
                                {t('clear_search_criteria')}
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 px-2">
                        {filteredAccessories.map((acc) => (
                            <Link
                                key={acc.id}
                                to={`/product/${acc.id}`}
                                className={`relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group flex flex-col h-[280px] ${acc.type === 'promotions' ? 'border-2 border-yellow-400 shadow-md shadow-yellow-100' : 'border border-gray-100'}`}
                            >
                                {/* الشريط العلوي للإعلانات المميزة */}
                                {acc.type === 'promotions' && <div className="h-1.5 bg-gradient-to-r from-yellow-400 to-amber-500"></div>}

                                <div className="relative w-full h-[200px] bg-gray-50">
                                    {getAccessoryMainImage(acc) ? (
                                        <img
                                            src={getTransformedImageUrl(getAccessoryMainImage(acc))}
                                            alt={acc.title}
                                            className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300"
                                            loading="lazy"
                                            onLoad={(e) => {
                                              const target = e.target as HTMLImageElement;
                                              target.classList.remove('opacity-0');
                                              target.classList.add('opacity-100');
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                          <Smartphone className="w-12 h-12 text-gray-300" />
                                        </div>
                                    )}
                                    {/* Placeholder */}
                                    {!getAccessoryMainImage(acc) && (
                                      <div className="phone-placeholder absolute inset-0 flex items-center justify-center transition-opacity duration-300">
                                        <div className="p-4 rounded-full bg-gray-100">
                                          <Smartphone className="w-8 h-8 text-gray-400" />
                                        </div>
                                      </div>
                                    )}
                                    {/* شارة مميز */}
                                    {acc.type === 'promotions' && (
                                        <div className="absolute top-1.5 left-1.5 bg-yellow-400/90 backdrop-blur-[2px] text-black text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10 flex items-center gap-0.5">
                                            <Star className="w-2.5 h-2.5 text-black" /><span>{t('featured')}</span>
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2 flex flex-col gap-2">
                                    </div>
                                </div>
                                
                                <div className="p-2.5 flex flex-col gap-1.5">
                                  {/* Title */}
                                  <h3 className="text-lg font-bold text-gray-800 truncate leading-tight mb-0.5">
                                    {acc.title}
                                  </h3>

                                  {/* Category and Brand */}
                                  <div className="flex items-center gap-1.5 text-xs text-gray-500 truncate font-medium">
                                    {acc.category && <span>{acc.category}</span>}
                                    {acc.category && acc.brand && <span className="w-0.5 h-0.5 rounded-full bg-gray-400"></span>}
                                    {acc.brand && <span>{acc.brand}</span>}
                                  </div>

                                  {/* Price */}
                                  <div className="mt-0.5 flex items-center justify-between">
                                    <div className="text-purple-700 font-bold text-lg" dir="ltr">
                                      {acc.price.toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US')} <span className="text-xs font-normal text-gray-500">{t('currency_short')}</span>
                                    </div>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${acc.condition === 'used' ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-cyan-50 text-cyan-700 border-cyan-100'}`}>
                                      {t(acc.condition)}
                                    </span>
                                  </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </PageContainer>
    );
};

export default AccessoriesForSalePage;