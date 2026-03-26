import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, Camera } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface PhoneData {
  id: string;
  title: string;
  brand: string;
  model: string;
  price: number;
  condition: string;
  warranty_months: number;
  store_name: string;
  description: string;
  specs: {
    storage: string;
    ram: string;
  };
  phone_images: Array<{
    image_path: string;
    main_image: boolean;
  }>;
}

const EditPhoneListing: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [phone, setPhone] = useState<PhoneData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    brand: '',
    model: '',
    price: '',
    condition: '',
    warranty_months: '',
    store_name: '',
    description: '',
    specs: { storage: '', ram: '' },
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchPhone = async () => {
      try {
        setLoading(true);
        console.log(t('fetching_phone_data'), id);
        
        const { data, error } = await supabase
          .from('phones')
          .select(`
            *,
            phone_images (
              image_path,
              main_image
            )
          `)
          .eq('id', id)
          .single();

        console.log(t('data_received'), data);
        console.log(t('error'), error);

        if (error) {
          console.error(t('error_fetching_data'), error);
          throw error;
        }

        if (data) {
          console.log(t('setting_phone_data'), data);
          setPhone(data);
          
          const formData = {
            title: data.title || '',
            brand: data.brand || '',
            model: data.model || '',
            price: data.price?.toString() || '',
            condition: data.condition || '',
            warranty_months: data.warranty_months?.toString() || '',
            store_name: data.store_name || '',
            description: data.description || '',
            specs: {
              storage: data.specs?.storage || '',
              ram: data.specs?.ram || '',
            },
          };
          
          console.log(t('setting_form_data'), formData);
          setForm(formData);
        }
      } catch (err) {
        console.error(t('unexpected_error'), err);
        setError(t('error_fetching_phone_data'));
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchPhone();
  }, [id, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const { error } = await supabase
        .from('phones')
        .update({
          title: form.title,
          brand: form.brand,
          model: form.model,
          price: parseFloat(form.price),
          condition: form.condition,
          warranty_months: parseInt(form.warranty_months),
          store_name: form.store_name,
          description: form.description,
          specs: form.specs,
        })
        .eq('id', id);

      if (error) throw error;
      setSuccess(t('data_updated_success'));
      setTimeout(() => navigate('/seller-dashboard'), 1500);
    } catch (err) {
      setError(t('error_updating_phone_data'));
    } finally {
      setSaving(false);
    }
  };

  const handleImageClick = (index: number) => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('phone-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('phone-images')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('phone_images')
        .upsert({
          phone_id: id,
          image_path: publicUrl,
          main_image: phone?.phone_images.length === 0
        });

      if (dbError) throw dbError;

      setPhone(prev => prev ? {
        ...prev,
        phone_images: [...prev.phone_images, { image_path: publicUrl, main_image: prev.phone_images.length === 0 }]
      } : null);

    } catch (err) {
      console.error(t('error_uploading_image'), err);
      setError(t('error_uploading_image'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="bg-transparent flex flex-col min-w-0 items-center justify-center px-2 pt-2 pb-0 sm:px-4 sm:pt-4 sm:pb-0 relative min-h-screen">
      <style>
        {`
          input, textarea, select {
            color: black !important;
          }
          input::placeholder, textarea::placeholder {
            color: #6b7280 !important;
          }
        `}
      </style>
      <div className="w-full max-w-4xl flex flex-col items-center relative">
        <div
          className="w-full max-w-4xl px-1 sm:px-2 py-0 flex flex-col my-0 rounded-b-2xl rounded-t-none shadow-2xl glass-bg z-10"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        >
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mt-6">{t('edit_phone_ad')}</h2>
            <p className="mt-1 text-sm text-gray-500">{t('update_phone_info')}</p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="p-4 bg-green-50 border-l-4 border-green-500 text-green-700">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 space-y-6 pb-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('ad_title')}</label>
                  <input
                    name="title"
                    value={form.title}
                    onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('brand')}</label>
                    <input
                      name="brand"
                      value={form.brand}
                      onChange={(e) => setForm(prev => ({ ...prev, brand: e.target.value }))}
                      className="w-full p-2 border rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('model')}</label>
                    <input
                      name="model"
                      value={form.model}
                      onChange={(e) => setForm(prev => ({ ...prev, model: e.target.value }))}
                      className="w-full p-2 border rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('price')}</label>
                  <div className="relative">
                    <input
                      name="price"
                      type="number"
                      value={form.price}
                      onChange={(e) => setForm(prev => ({ ...prev, price: e.target.value }))}
                      className="w-full p-2 border rounded-lg pl-16"
                      required
                    />
                    <span className="absolute left-3 top-2 text-gray-500">{t('currency_short')}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('condition')}</label>
                  <select
                    name="condition"
                    value={form.condition}
                    onChange={(e) => setForm(prev => ({ ...prev, condition: e.target.value }))}
                    className="w-full p-2 border rounded-lg"
                    required
                  >
                    <option value="">{t('select_condition')}</option>
                    <option value="new">{t('new')}</option>
                    <option value="used">{t('used')}</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('memory_ram')}</label>
                    <input
                      name="ram"
                      value={form.specs.ram}
                      onChange={(e) => setForm(prev => ({ 
                        ...prev, 
                        specs: { ...prev.specs, ram: e.target.value }
                      }))}
                      className="w-full p-2 border rounded-lg"
                      placeholder={t('ram_example')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('storage')}</label>
                    <input
                      name="storage"
                      value={form.specs.storage}
                      onChange={(e) => setForm(prev => ({ 
                        ...prev, 
                        specs: { ...prev.specs, storage: e.target.value }
                      }))}
                      className="w-full p-2 border rounded-lg"
                      placeholder={t('storage_example')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('warranty_months_label')}</label>
                  <input
                    name="warranty_months"
                    type="number"
                    value={form.warranty_months}
                    onChange={(e) => setForm(prev => ({ ...prev, warranty_months: e.target.value }))}
                    className="w-full p-2 border rounded-lg"
                    placeholder={t('warranty_placeholder')}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">{t('phone_images')}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {phone?.phone_images.map((img, index) => (
                  <div
                    key={index}
                    className="relative aspect-square group cursor-pointer"
                    onClick={() => handleImageClick(index)}
                  >
                    <div className="absolute inset-0 rounded-lg overflow-hidden">
                      <img
                        src={img.image_path}
                        alt={`${t('image')} ${index + 1}`}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="w-8 h-8 text-white" />
                      </div>
                      {img.main_image && (
                        <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded shadow-sm">
                          {t('main_image')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <div
                  className="relative aspect-square cursor-pointer border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Camera className="w-8 h-8 text-gray-400 mx-auto" />
                      <span className="text-sm text-gray-500">{t('add_photo')}</span>
                    </div>
                  </div>
                </div>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageChange}
              />
            </div>

            <div className="flex items-center justify-end space-x-3 rtl:space-x-reverse pt-6 border-t">
              <button
                type="button"
                onClick={() => navigate('/seller-dashboard')}
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('save_changes')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditPhoneListing;
