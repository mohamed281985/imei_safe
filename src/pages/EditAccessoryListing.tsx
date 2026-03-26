import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, Camera } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface AccessoryData {
  id: string;
  title: string;
  category: string;
  brand: string;
  price: number;
  condition: string;
  warranty_months: number;
  store_name: string;
  description: string;
  compatibility: string;
  accessory_images: Array<{
    image_path: string;
    main_image: boolean;
  }>;
}

const EditAccessoryListing: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [accessory, setAccessory] = useState<AccessoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: '',
    brand: '',
    price: '',
    condition: '',
    warranty_months: '',
    store_name: '',
    description: '',
    compatibility: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchAccessory = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('accessories')
          .select(`*, accessory_images (image_path, main_image)`)
          .eq('id', id)
          .single();

        if (error) throw error;

        if (data) {
          setAccessory(data);
          setForm({
            title: data.title || '',
            category: data.category || '',
            brand: data.brand || '',
            price: data.price?.toString() || '',
            condition: data.condition || '',
            warranty_months: data.warranty_months?.toString() || '',
            store_name: data.store_name || '',
            description: data.description || '',
            compatibility: data.compatibility || '',
          });
        }
      } catch (err) {
        console.error(t('error_fetching_accessory_data'), err);
        setError(t('error_fetching_accessory_data'));
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchAccessory();
  }, [id, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const { error } = await supabase
        .from('accessories')
        .update({
          title: form.title,
          category: form.category,
          brand: form.brand,
          price: parseFloat(form.price),
          condition: form.condition,
          warranty_months: parseInt(form.warranty_months),
          store_name: form.store_name,
          description: form.description,
          compatibility: form.compatibility,
        })
        .eq('id', id);

      if (error) throw error;
      setSuccess(t('data_updated_success'));
      setTimeout(() => navigate('/seller-dashboard'), 1500);
    } catch (err) {
      setError(t('error_updating_accessory_data'));
    } finally {
      setSaving(false);
    }
  };

  const handleImageClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !accessory) return;

    try {
      setLoading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${accessory.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('accessory-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('accessory-images')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('accessory_images')
        .upsert({
          accessory_id: id,
          image_path: publicUrl,
          main_image: accessory.accessory_images.length === 0
        });

      if (dbError) throw dbError;

      setAccessory(prev => prev ? {
        ...prev,
        accessory_images: [...prev.accessory_images, { image_path: publicUrl, main_image: prev.accessory_images.length === 0 }]
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
      <style>{` input, textarea, select { color: black !important; } input::placeholder, textarea::placeholder { color: #6b7280 !important; } `}</style>
      <div className="w-full max-w-4xl flex flex-col items-center relative">
        <div className="w-full max-w-4xl px-1 sm:px-2 py-0 flex flex-col my-0 rounded-b-2xl rounded-t-none shadow-2xl glass-bg z-10" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mt-6">{t('edit_accessory_ad')}</h2>
            <p className="mt-1 text-sm text-gray-500">{t('update_accessory_info')}</p>
          </div>

          {error && <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700">{error}</div>}
          {success && <div className="p-4 bg-green-50 border-l-4 border-green-500 text-green-700">{success}</div>}

          <form onSubmit={handleSubmit} className="p-6 space-y-6 pb-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('ad_title_required')}</label>
                <input name="title" value={form.title} onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))} className="w-full p-2 border rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('category_required')}</label>
                <input name="category" value={form.category} onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))} className="w-full p-2 border rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('brand_optional')}</label>
                <input name="brand" value={form.brand} onChange={(e) => setForm(prev => ({ ...prev, brand: e.target.value }))} className="w-full p-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('price_currency')}</label>
                <input name="price" type="number" value={form.price} onChange={(e) => setForm(prev => ({ ...prev, price: e.target.value }))} className="w-full p-2 border rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('condition_required')}</label>
                <select name="condition" value={form.condition} onChange={(e) => setForm(prev => ({ ...prev, condition: e.target.value }))} className="w-full p-2 border rounded-lg" required>
                  <option value="">{t('select')}</option>
                  <option value="new">{t('new')}</option>
                  <option value="used">{t('used')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('warranty_months_label')}</label>
                <input name="warranty_months" type="number" value={form.warranty_months} onChange={(e) => setForm(prev => ({ ...prev, warranty_months: e.target.value }))} className="w-full p-2 border rounded-lg" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('description_required')}</label>
                <textarea name="description" value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} className="w-full p-2 border rounded-lg" rows={3}></textarea>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('compatibility')}</label>
                <input name="compatibility" value={form.compatibility} onChange={(e) => setForm(prev => ({ ...prev, compatibility: e.target.value }))} className="w-full p-2 border rounded-lg" />
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">{t('accessory_images')}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {accessory?.accessory_images.map((img, index) => (
                  <div key={index} className="relative aspect-square group cursor-pointer" onClick={handleImageClick}>
                    <img src={img.image_path} alt={`${t('image')} ${index + 1}`} className="w-full h-full object-cover rounded-lg" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-8 h-8 text-white" />
                    </div>
                  </div>
                ))}
                <div className="relative aspect-square cursor-pointer border-2 border-dashed rounded-lg flex items-center justify-center" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="w-8 h-8 text-gray-400" />
                </div>
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageChange} />
            </div>

            <div className="flex items-center justify-end space-x-3 rtl:space-x-reverse pt-6 border-t">
              <button type="button" onClick={() => navigate('/seller-dashboard')} className="px-4 py-2 border text-black rounded-lg">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 flex items-center">
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

export default EditAccessoryListing;