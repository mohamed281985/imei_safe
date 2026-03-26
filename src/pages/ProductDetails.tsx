import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import './ProductDetails.css';
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
  seller_phone?: string;
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
          .select('*, accessory_images(image_path, main_image, order)')
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

  return (
    <div className="product-details-glass-bg">
      <div className="product-details-card">
        <Swiper
          spaceBetween={10}
          slidesPerView={1}
          navigation
          className="product-details-main-swiper"
          style={{ marginBottom: '16px', width: '100%', maxWidth: '350px', borderRadius: '16px' }}
        >
          {sortedImages.map((img, index) => (
            <SwiperSlide key={index}>
              <img
                src={img.image_path}
                alt={t('phone_image')}
                style={{ width: '100%', height: '250px', objectFit: 'cover', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)' }}
              />
            </SwiperSlide>
          ))}
        </Swiper>

        <h2 className="product-details-title">{product.title}</h2>
        <span className="product-details-status">
          {product.condition === 'used' ? t('used') : t('new')}
        </span>

        <div style={{display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center'}}>
          <div className="product-details-price" style={{fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'center', margin: '0 auto'}}>
            {product.price?.toLocaleString('en-US')} {t('currency_short')}
          </div>

          <div className="product-details-seller" style={{textAlign: 'right', width: '100%'}}>
            <span style={{fontWeight: 'bold'}}>{t('seller')}:</span> {product.store_name || t('private_seller')}
          </div>

          {product.type === 'phone' || product.type === 'accessory' ? (
            <div className="product-details-info">
              {product.specs?.storage && (
                <div>
                  <span>{t('storage')}:</span> {product.specs.storage}
                </div>
              )}
              {product.specs?.ram && (
                <div>
                  <span>{t('memory_ram')}:</span> {`RAM ${product.specs.ram} ${t('gb')}`}
                </div>
              )}
              {product.specs?.color && (
                <div>
                  <span>{t('color')}:</span> {product.specs.color}
                </div>
              )}
              {product.city && (
                <div>
                  <span>{t('city')}:</span> {product.city}
                </div>
              )}
              {product.warranty_months !== undefined && (
                <div>
                  <span>{t('warranty_period')}:</span> {product.warranty_months > 0 ? `${product.warranty_months} ${t('warranty_period')}` : t('no_warranty')}
                </div>
              )}
              {product.is_verified && (
                <div className="text-green-600 font-bold">
                  <span>{t('status')}:</span> {t('verified')}
                </div>
              )}
              {product.category && (
                <div>
                  <span>{t('category')}:</span> {product.category}
                </div>
              )}
              {product.compatibility && (
                <div>
                  <span>{t('compatibility')}:</span> {product.compatibility}
                </div>
              )}
            </div>
          ) : null}

          <div className="product-details-details" style={{margin: '16px 0'}}>
            <span style={{color: '#222', fontWeight: 'bold', fontSize: '1.15rem', display: 'block', marginBottom: '8px'}}>
              {t('phone_details')}
            </span>
            <div style={{background: 'rgba(67,230,133,0.10)', borderRadius: '10px', padding: '14px', border: '1px solid #43e685', color: '#333', fontSize: '1rem', fontWeight: '500', width: '320px', minHeight: '80px', maxHeight: '200px', overflowY: 'auto', wordWrap: 'break-word'}}>
              {product.description || t('no_description')}
            </div>
          </div>
        </div>

        <div style={{display: 'flex', gap: '12px', marginTop: '18px', marginBottom: "18px"}}>
          <a
            href={`https://wa.me/${(product.seller_phone || product.contact_methods?.phone || '').replace(/^\+/, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#0F9D58',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 28px',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(37,211,102,0.15)'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 32 32" fill="currentColor"><path d="M16 3C9.373 3 4 8.373 4 15c0 2.637.86 5.09 2.484 7.16L4 29l7.09-2.484A12.94 12.94 0 0 0 16 27c6.627 0 12-5.373 12-12S22.627 3 16 3zm0 22c-2.13 0-4.21-.627-5.98-1.813l-.426-.267-4.21 1.477 1.44-4.13-.277-.44C6.627 19.21 6 17.13 6 15c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10zm5.09-7.09c-.277-.14-1.64-.813-1.893-.91-.253-.093-.437-.14-.62.14-.183.28-.71.91-.87 1.1-.16.187-.32.21-.597.07-.277-.14-1.17-.43-2.23-1.37-.823-.733-1.38-1.64-1.54-1.917-.16-.28-.017-.43.12-.57.123-.12.28-.32.42-.48.14-.16.187-.28.28-.467.093-.187.047-.35-.023-.49-.07-.14-.62-1.497-.85-2.05-.223-.537-.45-.463-.62-.47-.16-.007-.35-.01-.54-.01-.187 0-.49.07-.75.35-.26.28-.99.97-.99 2.37s1.015 2.75 1.157 2.94c.14.187 2 3.06 4.85 4.17.68.293 1.21.467 1.62.597.68.217 1.3.187 1.79.113.547-.08 1.64-.67 1.87-1.32.23-.65.23-1.21.16-1.32-.07-.11-.253-.18-.53-.32z"/></svg>
            {t('contact_now')}
          </a>
        </div>
      </div>
    </div>
  );
};

export default ProductDetails;
