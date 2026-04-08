import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import imageCompression from 'browser-image-compression';
import ImageUploader from '@/components/ImageUploader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useLanguage } from '../contexts/LanguageContext';
import Logo from '../components/Logo';
import BackButton from '../components/BackButton';
import PageContainer from '@/components/PageContainer';
import TopBar from '@/components/TopBar';
import { ArrowLeft } from 'lucide-react';

export default function BusinessProfileComplete() {
  const { t } = useLanguage();
  const [storeImage, setStoreImage] = useState<File | null>(null);
  const [licenseImage, setLicenseImage] = useState<File | null>(null);
  const [previews, setPreviews] = useState<{ storeImage: string | null; licenseImage: string | null }>({ storeImage: null, licenseImage: null });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { completeProfile, logout } = useAuth();

  const handleImage = useCallback(async (file: File, type: 'store' | 'license') => {
    if (file.size > 10 * 1024 * 1024) { // 10MB limit for original file
      toast({ title: t('error'), description: t('file_too_large_10mb'), variant: 'destructive' });
      return;
    }

    const setFile = type === 'store' ? setStoreImage : setLicenseImage;
    const setPreview = (url: string | null) => setPreviews(p => ({ ...p, [type === 'store' ? 'storeImage' : 'licenseImage']: url }));

    if (type === 'store' && previews.storeImage) URL.revokeObjectURL(previews.storeImage);
    if (type === 'license' && previews.licenseImage) URL.revokeObjectURL(previews.licenseImage);
    setPreview(URL.createObjectURL(file));

    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: 'image/webp',
    };

    try {
      toast({ description: t('compressing_image') });
      const compressedFile = await imageCompression(file, options);
      setFile(compressedFile);
      toast({ title: t('success'), description: t('image_compressed_successfully') });
    } catch (error) {
      console.error('Image compression error:', error);
      toast({ title: t('error'), description: t('image_compression_failed'), variant: 'destructive' });
      setFile(file); // Fallback to original file
    }
  }, [previews.storeImage, previews.licenseImage, t, toast]);

  const uploadBusinessAsset = async (userId: string, file: File, assetName: string): Promise<string> => {
    const filePath = `${userId}/${assetName}_${Date.now()}.webp`;
      const uploadResp = await supabase.storage
        .from('business-assets')
        .upload(filePath, file, { upsert: true });
      console.log('[BusinessProfile] upload response for', assetName, uploadResp);
      if (uploadResp.error) throw new Error(`Failed to upload ${assetName}: ${uploadResp.error.message}`);

      const getUrlResp = await supabase.storage.from('business-assets').getPublicUrl(filePath);
      console.log('[BusinessProfile] getPublicUrl response for', assetName, getUrlResp);
      const publicUrl = getUrlResp?.data?.publicUrl;
      if (!publicUrl) throw new Error(`Could not get URL for ${assetName}`);
      return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // تحقق من وجود الصور قبل الحفظ
    if (!storeImage || !licenseImage) {
      toast({
        title: t('error'),
        description: t('select_store_and_license_images'),
        variant: 'destructive'
      });
      return;
    }
    setLoading(true);
    try {
      const { data: { user }, error: getUserError } = await supabase.auth.getUser();
      if (getUserError || !user) throw new Error(t('must_be_logged_in'));
      const userId = user.id;
      const [storeImageUrl, licenseImageUrl] = await Promise.all([
        uploadBusinessAsset(userId, storeImage, 'store_image'),
        uploadBusinessAsset(userId, licenseImage, 'license_image'),
      ]);
        const { data: updateData, error: profileUpdateError } = await supabase
          .from('businesses')
          .update({ store_image_url: storeImageUrl, license_image_url: licenseImageUrl })
          .eq('user_id', userId)
          .select();
        console.log('[BusinessProfile] update response', { updateData, profileUpdateError });

        // Call server-side endpoint that uses service_role key to bypass RLS and set image URLs
        try {
          const resp = await fetch('/api/set-business-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, store_image_url: storeImageUrl, license_image_url: licenseImageUrl })
          });
          const json = await resp.json().catch(() => ({}));
          console.log('[BusinessProfile] /api/set-business-images response', resp.status, json);
          if (!resp.ok) {
            throw new Error(json?.error || json?.details?.message || 'Failed to set business images on server');
          }
        } catch (e: any) {
          console.error('[BusinessProfile] set-business-images error', e);
          throw new Error(`${t('data_save_failed')}: ${e && e.message ? e.message : String(e)}`);
        }
      // تحديث حالة اكتمال الملف التجاري
      completeProfile();
      toast({
        title: t('business_profile_completed_successfully'),
        description: t('business_data_saved_redirecting'),
      });
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Function to capture an image with the camera and update the state
  const handleCameraCapture = async (type: 'store' | 'license') => {
    try {
      const image = await CapacitorCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });
  
      if (image.webPath) {
        const response = await fetch(image.webPath);
        const blob = await response.blob();
        const file = new File([blob], `${type}_${Date.now()}.webp`, { type: 'image/webp' });
        await handleImage(file, type);
      }
    } catch (error: any) {
      console.error("Camera error:", error);
      toast({ title: t('error'), description: t('failed_to_capture_image'), variant: 'destructive' });
    }
  };

  return (
    <PageContainer>
      <div className="flex flex-col items-center justify-center min-h-screen p-2">
        <TopBar />
        <div className="w-full flex items-center justify-center mb-6 mt-4">
          <div className="flex-1 flex justify-center">
            <Logo size="lg" className="mb-2" />
          </div>
        </div>
        <div className="w-full max-w-2xl mt-2 space-y-6">
          <Card className="shadow-md border-t-4 border-t-orange-800 glass-bg" style={{background: 'rgba(255,255,255,0.18)'}}>
            <CardHeader className="pb-2">
              <div className="relative flex items-center justify-center">
                <button 
                  onClick={() => {
                    logout();
                    navigate("/login", { replace: true });
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-orange-500 p-2 rounded-full hover:bg-orange-600 transition-colors w-10 h-10 flex items-center justify-center"
                >
                  <ArrowLeft size={24} className="text-white" />
                </button>
                <CardTitle className="w-full text-2xl md:text-3xl font-bold text-orange-600 text-center tracking-tight">
                  {t('complete_business_profile')}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-black mb-3">{t('store_image')}</h2>
                <ImageUploader
                  label=""
                  image={previews.storeImage || ''}
                  setImage={(url) => {
                    if (!url) {
                      if (previews.storeImage) URL.revokeObjectURL(previews.storeImage);
                      setPreviews(p => ({ ...p, storeImage: null }));
                      setStoreImage(null);
                    } else {
                      // عندما يتم اختيار صورة جديدة، قم بتحويلها إلى ملف
                      fetch(url)
                        .then(res => res.blob())
                        .then(blob => {
                          const file = new File([blob], 'store_image.webp', { type: 'image/webp' });
                          handleImage(file, 'store');
                        });
                    }
                  }}
                  onCameraClick={() => handleCameraCapture('store')}
                />
              </div>
              
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-black mb-3">{t('business_license_image')}</h2>
                <ImageUploader
                  label=""
                  image={previews.licenseImage || ''}
                  setImage={(url) => {
                    if (!url) {
                      if (previews.licenseImage) URL.revokeObjectURL(previews.licenseImage);
                      setPreviews(p => ({ ...p, licenseImage: null }));
                      setLicenseImage(null);
                    } else {
                      // عندما يتم اختيار صورة جديدة، قم بتحويلها إلى ملف
                      fetch(url)
                        .then(res => res.blob())
                        .then(blob => {
                          const file = new File([blob], 'license_image.webp', { type: 'image/webp' });
                          handleImage(file, 'license');
                        });
                    }
                  }}
                  onCameraClick={() => handleCameraCapture('license')}
                />
              </div>
              
              <div className="mt-8 pt-4 border-t border-gray-300 border-opacity-30">
                <Button type="submit" disabled={loading} className="w-full text-white text-lg font-large py-3 bg-orange-500 hover:bg-orange-600">
                  {loading ? t('saving') : t('confirm_and_save')}
                </Button>
              </div>
              </form>
            </CardContent>
          </Card>
          

        </div>
      </div>
    </PageContainer>
  );
}
