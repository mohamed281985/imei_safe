import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import './ProductDetails.css';
import { FaRegHeart, FaShareAlt, FaWhatsapp, FaRegCheckCircle } from 'react-icons/fa';
import { MdStorage, MdOutlineMemory, MdLocationOn, MdShield } from 'react-icons/md';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/navigation';

interface Product {
  id: string;
  title: string;
  brand?: string;
  model?: string;
  category?: string;
  compatibility?: string;
  type: 'phone' | 'accessory';
  price: number;
  condition: string;
  description: string;
  specs?: {
    storage?: string;
    ram?: string;
    color?: string;
  };
  store_name?: string;
  city?: string;
  is_verified?: boolean;
  contact_methods?: {
    phone?: string;
  };
  images: Array<{
    image_path: string;
    main_image: boolean;
    order?: number;
  }>;
  warranty_months?: number;
}

const ProductDetails = () => {
    const { id } = useParams();
    const { t } = useLanguage();
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingPhone, setLoadingPhone] = useState(false);

  const handleContactNow = async () => {
    if (!product) return;

    setLoadingPhone(true);
    try {
      // الحصول على التوكن من التخزين
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        alert(t('please_login'));
        setLoadingPhone(false);
        return;
      }

      // الاتصال بنقطة النهاية الجديدة من السيرفر
      const response = await fetch(`https://imei-safe.me/api/store-phone/${product.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success && data.phone) {
        window.open(`https://wa.me/${data.phone}`, '_blank');
      } else {
        alert(t('no_contact_info'));
      }
    } catch (error) {
      console.error('Error fetching phone number:', error);
      alert(t('error_fetching_contact'));
    } finally {
      setLoadingPhone(false);
    }
  };

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);

      // Try fetching from phones first
      const { data: phoneData, error: phoneError } = await supabase
        .from('phones')
        .select('*, phone_images(image_path, main_image, order)')
        .eq('id', id)
        .single();

      if (phoneData) {
        setProduct({
          ...phoneData,
          images: phoneData.phone_images || [],
          type: 'phone'
        });
        setLoading(false);
        return;
      }

      // If not found in phones, try accessories
      if (phoneError && (phoneError.code === 'PGRST116' || phoneError.code === '22P02')) {
        const { data: accessoryData, error: accessoryError } = await supabase
          .from('accessories')
          .select('*, contact_methods, accessory_images(image_path, main_image, order)')
          .eq('id', id)
          .single();

        if (accessoryData) {
          setProduct({
            ...accessoryData,
            images: accessoryData.accessory_images || [],
            type: 'accessory'
          });
        } else {
          console.error('خطأ في جلب بيانات المنتج:', accessoryError);
          setProduct(null);
        }
      } else {
        console.error('خطأ في جلب بيانات الهاتف:', phoneError);
        setProduct(null);
      }

      setLoading(false);
    };

    if (id) {
      fetchProduct();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="product-details-glass-bg">
        <div className="product-details-card">{t('loading')}</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="product-details-glass-bg">
        <div className="product-details-card">{t('phone_not_found')}</div>
      </div>
    );
  }

  const sortedImages = [...(product.images || [])].sort((a, b) => {
    if (a.main_image) return -1;
    if (b.main_image) return 1;
    return (a.order || 99) - (b.order || 99);
  });


  // RTL & Glassmorphism Container
  return (
    <div dir="rtl" style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F5F9FF 60%, #DFF4FF 100%)',
      padding: '0',
      fontFamily: 'Tajawal, Cairo, sans-serif',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 430,
        margin: '32px 0',
        borderRadius: 28,
        background: 'rgba(255,255,255,0.65)',
        boxShadow: '0 8px 32px 0 rgba(10,132,255,0.10)',
        padding: '0',
        overflow: 'hidden',
        border: '1.5px solid rgba(10,132,255,0.07)'
      }}>
        {/* Top Image Slider */}
        <div style={{
          padding: 0,
          background: 'linear-gradient(135deg, #DFF4FF 80%, #F5F9FF 100%)',
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
          boxShadow: '0 4px 24px 0 rgba(10,132,255,0.10)',
          position: 'relative',
        }}>
          <Swiper
            spaceBetween={10}
            slidesPerView={1}
            navigation
            style={{ width: '100%', maxWidth: 430, borderRadius: 0 }}
          >
            {sortedImages.map((img, index) => (
              <SwiperSlide key={index}>
                <img
                  src={img.image_path}
                  alt={t('phone_image')}
                  style={{ width: '100%', height: 270, objectFit: 'contain', borderRadius: 0, boxShadow: '0 4px 24px rgba(10,132,255,0.10)' }}
                />
              </SwiperSlide>
            ))}
          </Swiper>
          {/* Favorite Heart Floating Button */}
          <button style={{
            position: 'absolute',
            top: 18,
            left: 18,
            zIndex: 2,
            background: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: 48,
            height: 48,
            boxShadow: '0 2px 8px rgba(10,132,255,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            transition: 'box-shadow 0.2s'
          }} aria-label="المفضلة">
            <FaRegHeart size={26} color="#0A84FF" />
          </button>
        </div>

        {/* Product Info */}

        <div style={{padding: '32px 18px 0 18px'}}>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 18, marginTop: 2}}>
            <h2 style={{
              fontSize: 32,
              fontWeight: 900,
              color: '#181C32',
              margin: 0,
              marginBottom: 18,
              letterSpacing: '-1.2px',
              lineHeight: 1.18,
              textShadow: '0 2px 8px rgba(10,132,255,0.07)',
              textAlign: 'center',
              width: '100%'
            }}>{product.title}</h2>
            {/* عرض الموديل فقط إذا كان معرفاً وصحيحاً */}
            {product.model && product.model !== 'unknown_model' && (
              <h4 className="text-base font-medium text-gray-700 truncate leading-tight mb-1 px-2" style={{
                fontSize: 18,
                fontWeight: 600,
                color: '#555',
                margin: 0,
                marginBottom: 6,
                textAlign: 'center',
                letterSpacing: '-0.5px',
                lineHeight: 1.2
              }}>{product.model}</h4>
            )}
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, width: '100%'}}>
              <span style={{
                fontSize: 16,
                fontWeight: 700,
                background: '#E6F7FF',
                color: '#0A84FF',
                borderRadius: 18,
                padding: '4px 22px',
                letterSpacing: 0.5,
                boxShadow: '0 1px 4px rgba(10,132,255,0.06)',
                marginBottom: 7,
                textAlign: 'center',
                display: 'inline-block'
              }}>
                {product.condition === 'used' ? 'مستعمل' : 'جديد'}
              </span>
              <span style={{
                fontSize: 28,
                fontWeight: 900,
                color: '#12B76A',
                marginBottom: 0,
                letterSpacing: '-1px',
                textShadow: '0 2px 8px rgba(18,183,106,0.08)',
                marginTop: 7,
                textAlign: 'center',
                display: 'inline-block'
              }}>
                {product.price?.toLocaleString('ar-EG')} <span style={{fontSize: 18, fontWeight: 700, color: '#0A84FF', marginRight: 2}}>ج.م</span>
              </span>
            </div>
          </div>

          {/* Specs Card */}
          <div style={{
            background: 'rgba(255,255,255,0.92)',
            borderRadius: 24,
            boxShadow: '0 2px 16px 0 rgba(10,132,255,0.08)',
            padding: '22px 18px 12px 18px',
            margin: '28px 0 0 0',
            display: 'flex', flexDirection: 'column', gap: 0,
            border: '1.5px solid #E6F7FF'
          }}>
            <div style={{display: 'flex', alignItems: 'center', gap: 18, marginBottom: 12}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 7, flex: 1}}>
                <MdStorage size={22} color="#0A84FF" />
                <span style={{fontSize: 15, color: '#222', fontWeight: 600}}>{product.specs?.storage || '--'}<span style={{fontSize: 13, color: '#888', marginRight: 3}}> تخزين</span></span>
              </div>
              <div style={{width: 1, height: 28, background: '#E6F7FF'}} />
              <div style={{display: 'flex', alignItems: 'center', gap: 7, flex: 1}}>
                <MdOutlineMemory size={22} color="#0A84FF" />
                <span style={{fontSize: 15, color: '#222', fontWeight: 600}}>{product.specs?.ram || '--'}<span style={{fontSize: 13, color: '#888', marginRight: 3}}> رام</span></span>
              </div>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 18, marginBottom: 12}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 7, flex: 1}}>
                <MdLocationOn size={22} color="#0A84FF" />
                <span style={{fontSize: 15, color: '#222', fontWeight: 600}}>{product.city || '--'}</span>
              </div>
              <div style={{width: 1, height: 28, background: '#E6F7FF'}} />
              <div style={{display: 'flex', alignItems: 'center', gap: 7, flex: 1}}>
                <MdShield size={22} color="#0A84FF" />
                <span style={{fontSize: 15, color: '#222', fontWeight: 600}}>{product.warranty_months && product.warranty_months > 0 ? `${product.warranty_months} شهر` : 'بدون ضمان'}</span>
              </div>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 7, marginTop: 2}}>
              <FaRegCheckCircle size={20} color="#12B76A" />
              <span style={{fontSize: 15, color: '#12B76A', fontWeight: 700}}>موثوق</span>
            </div>
          </div>

          {/* Details Section */}
          <div style={{margin: '38px 0 0 0'}}>
            <div style={{
              fontSize: 20,
              fontWeight: 900,
              color: '#0A84FF',
              marginBottom: 14,
              letterSpacing: '-0.5px',
              textShadow: '0 1px 4px rgba(10,132,255,0.07)'
            }}>تفاصيل إضافية</div>
            <div style={{
              background: 'rgba(251, 251, 252, 1)',
              border: '1.5px solid #E6F7FF',
              borderRadius: 20,
              padding: '22px 18px',
              color: '#0e0d0dff',
              fontSize: 17,
              fontWeight: 600,
              minHeight: 80,
              maxHeight: 200,
              overflowY: 'auto',
              wordWrap: 'break-word',
              lineHeight: 2.1,
              boxShadow: '0 4px 24px rgba(241, 241, 243, 0.9), 0 1.5px 8px rgba(10,132,255,0.04)'
            }}>
              {product.description || 'لا توجد تفاصيل إضافية'}
            </div>
          </div>

          {/* Bottom Actions */}
          <div style={{display: 'flex', gap: 12, margin: '38px 0 24px 0', alignItems: 'center', justifyContent: 'center'}}>
            <button
              onClick={handleContactNow}
              disabled={loadingPhone}
              style={{
                flex: 1,
                background: loadingPhone ? '#A7EFC5' : 'linear-gradient(90deg, #12B76A 60%, #43e685 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 18,
                padding: '12px 0',
                fontSize: 20,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                cursor: loadingPhone ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 12px rgba(18,183,106,0.10)',
                transition: 'background 0.2s'
              }}
            >
              <FaWhatsapp size={26} color="#fff" />
              {loadingPhone ? t('loading') : 'اتصل الآن'}
            </button>
            <button
              style={{
                background: '#fff',
                border: 'none',
                borderRadius: 14,
                width: 54,
                height: 54,
                boxShadow: '0 2px 8px rgba(10,132,255,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 15,
                gap: 7
              }}
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: product.title,
                    url: window.location.href
                  });
                } else {
                  window.prompt('انسخ الرابط:', window.location.href);
                }
              }}
              aria-label="مشاركة"
            >
              <FaShareAlt size={22} color="#0A84FF" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductDetails;
