import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import PageContainer from '@/components/PageContainer';
import AppNavbar from '@/components/AppNavbar';
import BackButton from '@/components/BackButton';
import { Smartphone, Eye, Search, Filter, SortAsc, Star } from 'lucide-react';

// Utility function to disable console logs in production
if (import.meta.env.MODE === 'production') {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}

// دالة مساعدة للحصول على الصورة الرئيسية للهاتف
const getPhoneMainImage = (phone: any): string | null => {
  if (!phone?.phone_images?.length) {
    console.log('No phone images found for phone:', phone?.id);
    return null;
  }

  // البحث عن الصورة الرئيسية
  const mainImage = phone.phone_images.find((img: any) => img.main_image);
  if (mainImage?.image_path) {
    console.log('Found main image for phone:', phone.id, 'path:', mainImage.image_path);
    return mainImage.image_path;
  }

  // إذا لم نجد صورة رئيسية، نستخدم أول صورة
  console.log('Using first image for phone:', phone.id, 'path:', phone.phone_images[0].image_path);
  return phone.phone_images[0].image_path;
};

// دالة مساعدة لإنشاء رابط صورة محسن باستخدام Supabase Storage
const getTransformedImageUrl = (originalUrl: string | null | undefined): string => {
  if (!originalUrl) {
    return '/placeholder-phone.png';
  }
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('Supabase URL not found in environment variables');
      return '/placeholder-phone.png';
    }

    // إذا كان الرابط يبدأ بـ http، فهو رابط كامل بالفعل
    if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
      return originalUrl;
    }

    // بناء الرابط الكامل للصورة
    const finalUrl = `${supabaseUrl}/storage/v1/object/public/phone-images/${originalUrl}`;
    console.log('Final image URL:', finalUrl);
    return finalUrl;
  } catch (e) {
    console.error('Error processing image URL:', e);
    return '/placeholder-phone.png';
  }
};

const PhonesForSale: React.FC = () => {
  const { t } = useLanguage();
  const { i18n } = useTranslation();
  const [phoneListings, setPhoneListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCondition, setSelectedCondition] = useState('all');
  const [priceRange, setPriceRange] = useState({ min: '', max: '' });
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1); // Current page for pagination
  const [totalPages, setTotalPages] = useState(1); // Total number of pages
  const itemsPerPage = 10; // Number of items per page

  useEffect(() => {
    const fetchPhoneListings = async () => {
      setLoading(true);
      try {
        const { data, error, count } = await supabase
          .from('phones')
          .select(`*, phone_images(image_path, main_image)`, { count: 'exact' })
          .eq('status', 'active')
          .range((page - 1) * itemsPerPage, page * itemsPerPage - 1); // Fetch items for the current page

        if (error) throw error;

        setPhoneListings(data || []);
        setTotalPages(Math.ceil((count || 0) / itemsPerPage)); // Calculate total pages
      } catch (error) {
        console.error('Error fetching phone listings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPhoneListings();
  }, [page]); // Fetch data when page changes

  // تحسين دالة الفلترة
  const getFilteredPhones = () => {
    const filtered = phoneListings.filter(phone => {
      const searchString = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        (phone.brand && phone.brand.toLowerCase().includes(searchString)) ||
        (phone.model && phone.model.toLowerCase().includes(searchString));
        
      const matchesCondition = selectedCondition === 'all' || phone.condition === selectedCondition;
      const matchesPrice = (!priceRange.min || phone.price >= Number(priceRange.min)) &&
                          (!priceRange.max || phone.price <= Number(priceRange.max));
      
      return matchesSearch && matchesCondition && matchesPrice;
    });

    // الترتيب
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
      
      const hasRoleA = !!a.role && a.role.trim() !== '';
      const hasRoleB = !!b.role && b.role.trim() !== '';
      if (!hasRoleA && hasRoleB) return 1;
      if (hasRoleA && !hasRoleB) return -1;
      
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

  // عرض النتائج مع رسالة في حالة عدم وجود نتائج
  const filteredPhones = getFilteredPhones();

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  return (
    <PageContainer>
      <AppNavbar />
      <div className="p-4 mb-10">
        {/* قسم البحث والفلترة */}
        <div className="bg-white/80 backdrop-blur-lg rounded-xl p-3 mb-4 shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* حقل البحث */}
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder={t('search_phones_by_brand_model')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-8 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black placeholder:text-gray-400 text-sm"
              />
            </div>

            {/* خيارات الفلترة */}
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

          {/* نطاق السعر */}
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
        ) : filteredPhones.length === 0 ? (
          <div className="bg-white/80 backdrop-blur-lg rounded-xl p-8 text-center">
            <Smartphone className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">{t('no_results')}</h3>
            <p className="text-gray-600">
              {searchTerm 
                ? t('no_phones_matching_search') 
                : t('no_phones_for_sale')}
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
          <div className="grid grid-cols-2 gap-4">
            {filteredPhones.map((phone) => {
              if (!phone || !phone.title) {
                console.warn('Skipping phone due to missing title:', phone);
                return null;
              }

              const titleParts = phone.title.split(' ');
              const brand = titleParts[0] || t('unknown_brand');
              const model = titleParts[1] || t('unknown_model');

              return (
                <Link
                  key={phone.id}
                  to={`/product/${phone.id}`}
                  className={`relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group flex flex-col h-[280px] ${phone.type === 'promotions' ? 'border-2 border-yellow-400 shadow-md shadow-yellow-100' : 'border border-gray-100'}`}
                >
                  {/* الشريط العلوي للإعلانات المميزة */}
                  {phone.type === 'promotions' && <div className="h-1.5 bg-gradient-to-r from-yellow-400 to-amber-500"></div>}

                  <div className="relative w-full h-[200px] bg-gray-50">
                    {phone.phone_images?.[0]?.image_path ? (
                      <>
                        <div className="relative w-full h-full bg-gray-50">
                          {/* صورة الهاتف */}
                          {(() => {
                            const imagePath = getPhoneMainImage(phone);
                            const imageUrl = getTransformedImageUrl(imagePath);
                            if (!imagePath || !imageUrl) return null;

                            return (
                              <img
                                src={imageUrl}
                                alt={phone.title || 'صورة الهاتف'}
                                className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300"
                                loading="lazy"
                                onLoad={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.classList.remove('opacity-0');
                                  target.classList.add('opacity-100');
                                  const placeholder = target.parentElement?.querySelector('.phone-placeholder');
                                  if (placeholder) {
                                    placeholder.classList.add('opacity-0');
                                  }
                                }}
                                onError={(e) => {
                                  console.error('Image failed to load:', e);
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const placeholder = target.parentElement?.querySelector('.phone-placeholder');
                                  if (placeholder) {
                                    placeholder.classList.remove('opacity-0');
                                  }
                                }}
                              />
                            );
                          })()}

                          {/* Placeholder */}
                          <div className="phone-placeholder absolute inset-0 flex items-center justify-center transition-opacity duration-300">
                            <div className="p-4 rounded-full bg-gray-100">
                              <Smartphone className="w-8 h-8 text-gray-400" />
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100">
                        <Smartphone className="w-12 h-12 text-gray-300" />
                      </div>
                    )}

                    {/* شارة "مميز" */}
                    {phone.type === 'promotions' && (
                      <div className="absolute top-1.5 left-1.5 bg-yellow-400/90 backdrop-blur-[2px] text-black text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10 flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 text-black" /><span>{t('featured')}</span>
                      </div>
                    )}

                    {/* شارة الضمان */}
                    {phone.warranty_months > 0 && (
                      <div className="absolute bottom-1 right-1 bg-blue-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                        {t('warranty_months').replace('{months}', phone.warranty_months.toString())}
                      </div>
                    )}
                  </div>
                  <div className="p-2.5 flex flex-col gap-1.5">
                    {/* Title */}
                    <h3 className="text-lg font-bold text-gray-800 truncate leading-tight mb-0.5 px-2">
                      {brand}
                    </h3>
                    <h4 className="text-base font-medium text-gray-700 truncate leading-tight mb-1 px-2">
                      {model}
                    </h4>

                    {/* Specs Line */}
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 truncate font-bold">
                      {phone.specs?.ram && <span>{phone.specs.ram}GB</span>}
                      {phone.specs?.storage && (
                        <>
                          <span className="w-0.5 h-0.5 rounded-full bg-gray-400"></span>
                          <span>{phone.specs.storage}GB</span>
                        </>
                      )}
                      {phone.condition && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${phone.condition === 'used' ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-cyan-50 text-cyan-700 border-cyan-100'}`}>
                          {t(phone.condition)}
                        </span>
                      )}
                    </div>

                    {/* Price */}
                    <div className="mt-0.5 flex items-center justify-between">
                      <div className="text-purple-700 font-bold text-lg" dir="ltr">
                        {phone.price.toLocaleString('en-US')} <span className="text-xs font-normal text-gray-500">{t('currency_short')}</span>
                      </div>
                      {phone.is_verified && (
                        <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-100 font-medium">
                          {t('verified')}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        <div className="flex justify-center items-center mt-4">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className="px-4 py-2 mx-1 bg-gray-200 rounded disabled:opacity-50"
          >
            {t('previous')}
          </button>
          {Array.from({ length: totalPages }, (_, index) => (
            <button
              key={index + 1}
              onClick={() => handlePageChange(index + 1)}
              className={`px-4 py-2 mx-1 rounded ${page === index + 1 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              {index + 1}
            </button>
          ))}
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            className="px-4 py-2 mx-1 bg-gray-200 rounded disabled:opacity-50"
          >
            {t('next')}
          </button>
        </div>
      </div>
    </PageContainer>
  );
};

export default PhonesForSale;