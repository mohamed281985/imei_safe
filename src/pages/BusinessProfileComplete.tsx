import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import imageCompression from 'browser-image-compression';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import ImageUploader from '@/components/ImageUploader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { useLanguage } from '../contexts/LanguageContext';
import Logo from '../components/Logo';
import BackButton from '../components/BackButton';
import PageContainer from '@/components/PageContainer';
import TopBar from '@/components/TopBar';
import { ArrowLeft, Crop as CropIcon, Wand2, RotateCw } from 'lucide-react';

export default function BusinessProfileComplete() {
  const { t } = useLanguage();
  const [storeImage, setStoreImage] = useState<File | null>(null);
  const [licenseImage, setLicenseImage] = useState<File | null>(null);
  const [previews, setPreviews] = useState<{ storeImage: string | null; licenseImage: string | null }>({ storeImage: null, licenseImage: null });
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [businessStatus, setBusinessStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { completeProfile, logout } = useAuth();

  // حالة للاقتطاع
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImageType, setCropImageType] = useState<'store' | 'license' | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState('');
  const [crop, setCrop] = useState<Crop>({ unit: '%', x: 5, y: 5, width: 90, height: 56 });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);

  // التحقق مما إذا كنا في بيئة تطبيق حقيقي
  const isNative = Capacitor.isNativePlatform();

  // cleanup object URLs when previews change or component unmounts
  useEffect(() => {
    return () => {
      if (previews.storeImage) URL.revokeObjectURL(previews.storeImage);
      if (previews.licenseImage) URL.revokeObjectURL(previews.licenseImage);
    };
  }, [previews.storeImage, previews.licenseImage]);

  // fetch current business status and rejection reason
  useEffect(() => {
    const loadBusinessStatus = async () => {
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !user) return;

        const { data: business, error: businessErr } = await supabase
          .from('businesses')
          .select('status, reason')
          .eq('user_id', user.id)
          .maybeSingle();

        if (businessErr) {
          console.warn('BusinessProfileComplete: failed to load business status', businessErr);
          return;
        }

        if (business) {
          setBusinessStatus(business.status || null);
          setRejectionReason(business.reason || null);
        }
      } catch (error) {
        console.error('BusinessProfileComplete: loadBusinessStatus error', error);
      }
    };

    loadBusinessStatus();
  }, []);

  // دالة لاقتطاع الصورة
  const handleCropComplete = useCallback(async (crop: PixelCrop, image: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx || !crop.width || !crop.height) return;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = crop.width * scaleX;
    canvas.height = crop.height * scaleY;

    ctx.drawImage(
      image,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      crop.width * scaleX,
      crop.height * scaleY
    );

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `${cropImageType}_cropped.webp`, { type: 'image/webp' });
      handleImage(file, cropImageType || 'store');
      setShowCropModal(false);
      setCropImageType(null);
      setCropImageSrc('');
    }, 'image/webp');
  }, [cropImageType]);

  // دالة لفتح نافذة الاقتطاع
  const openCropModal = useCallback((type: 'store' | 'license') => {
    const imageSrc = type === 'store' ? previews.storeImage : previews.licenseImage;
    if (!imageSrc) return;

    setCropImageType(type);
    setCropImageSrc(imageSrc);
    setShowCropModal(true);
  }, [previews.storeImage, previews.licenseImage]);

  // دالة لتحسين الصورة تلقائياً
  const enhanceImage = useCallback(async (file: File, type: 'store' | 'license') => {
    setProcessing(true);
    try {
      toast({ description: t('enhancing_image') });

      // خيارات تحسين الصورة
      const enhanceOptions = {
        maxSizeMB: 2,
        maxWidthOrHeight: 2048,
        useWebWorker: true,
        fileType: 'image/webp',
        quality: 0.9,
        // تحسينات إضافية
        initialQuality: 0.8,
        alwaysKeepResolution: false,
      };

      // تحويل الصورة إلى Blob
      const compressedFile = await imageCompression(file, enhanceOptions);

      // تطبيق تحسينات إضافية باستخدام Canvas
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;

        // تحسين السطوع والتباين
        ctx.filter = 'contrast(1.1) brightness(1.05) saturate(1.1)';
        ctx.drawImage(img, 0, 0);

        // تطبيق تأثير حاد بسيط
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
          if (!blob) {
            setProcessing(false);
            return;
          }

          const enhancedFile = new File([blob], `${type}_enhanced.webp`, { type: 'image/webp' });
          handleImage(enhancedFile, type);
          setProcessing(false);
          toast({ title: t('success'), description: t('image_enhanced_successfully') });
        }, 'image/webp');
      };

      img.onerror = () => {
        setProcessing(false);
        toast({ title: t('error'), description: t('image_enhancement_failed'), variant: 'destructive' });
      };

      // تحميل الصورة المضغوطة
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error('Image enhancement error:', error);
      setProcessing(false);
      toast({ title: t('error'), description: t('image_enhancement_failed'), variant: 'destructive' });
    }
  }, [t, toast]);

  const handleImage = useCallback(async (file: File, type: 'store' | 'license') => {
    if (file.size > 10 * 1024 * 1024) { // 10MB limit for original file
      toast({ title: t('error'), description: t('file_too_large_10mb'), variant: 'destructive' });
      return;
    }

    // Validate MIME type is an image
    if (!file.type || !file.type.startsWith('image/')) {
      toast({ title: t('error'), description: t('invalid_file_type'), variant: 'destructive' });
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
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('business-assets')
      .upload(filePath, file, { upsert: true });
    if (uploadError) throw new Error(`Failed to upload ${assetName}: ${uploadError.message}`);

    // Try to get a public URL first
    try {
      const { data: { publicUrl } } = supabase.storage.from('business-assets').getPublicUrl(filePath);
      if (publicUrl) return publicUrl;
    } catch (err) {
      console.warn('getPublicUrl error or returned no url', err);
    }

    // If no public URL (private bucket), attempt to create a signed URL
    try {
      const expiresIn = 60 * 60 * 24 * 7; // 7 days
      const { data: signedData, error: signedError } = await supabase.storage
        .from('business-assets')
        .createSignedUrl(filePath, expiresIn);
      if (signedError) throw signedError;
      if (signedData && (((signedData as any).signedUrl) || ((signedData as any).signed_url))) {
        return (signedData as any).signedUrl || (signedData as any).signed_url;
      }
      throw new Error('Could not obtain a signed URL');
    } catch (err: any) {
      throw new Error(`Could not get URL for ${assetName}: ${err?.message || err}`);
    }
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
      // 1. جلب بيانات المستخدم الحالي
      const { data: { user }, error: getUserError } = await supabase.auth.getUser();
      if (getUserError || !user) throw new Error(t('must_be_logged_in'));
      const userId = user.id;

      // 2. رفع الصور والحصول على الروابط
      console.log('[BusinessProfile] Uploading images...');
      const [storeImageUrl, licenseImageUrl] = await Promise.all([
        uploadBusinessAsset(userId, storeImage, 'store_image'),
        uploadBusinessAsset(userId, licenseImage, 'license_image'),
      ]);
      console.log('[BusinessProfile] Images uploaded successfully');

      // 3. التحقق مما إذا كان سجل النشاط التجاري موجوداً
      console.log('[BusinessProfile] Checking for existing business record...');
      const { data: existingBusiness, error: checkError } = await supabase
        .from('businesses')
        .select('id, user_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (checkError) {
        console.error('[BusinessProfile] Error checking business record:', checkError);
        throw new Error(t('error_checking_business_record'));
      }

      let resultError;
      if (existingBusiness) {
        // الحالة أ: السجل موجود -> نقوم بالتحديث
        console.log('[BusinessProfile] Updating existing business record, ID:', existingBusiness.id);
        const { data: updatedRows, error: updateError } = await supabase
          .from('businesses')
          .update({ 
            store_image_url: storeImageUrl, 
            license_image_url: licenseImageUrl,
            status: 'pending',
            reason: null
          })
          .eq('user_id', userId)
          .select();

        console.log('[BusinessProfile] Update result:', { updatedRows, updateError });
        if (!updatedRows || updatedRows.length === 0) {
          console.warn('[BusinessProfile] Update affected 0 rows despite record existing');
        }
        resultError = updateError;
      } else {
        // الحالة ب: السجل غير موجود -> نقوم بإنشاء سجل جديد
        console.log('[BusinessProfile] No existing record found. Creating new business record...');
        const metadata = user.user_metadata || {};
        const { data: insertedRows, error: insertError } = await supabase
          .from('businesses')
          .insert({ 
            user_id: userId, 
            store_image_url: storeImageUrl, 
            license_image_url: licenseImageUrl,
            store_name: metadata.store_name || '',
            email: user.email || '',
            phone: metadata.phone || '',
            owner_name: metadata.full_name || metadata.owner_name || '',
            address: metadata.address || '',
            business_type: metadata.business_type || '',
            id_last6: metadata.id_last6 || '',
            status: 'pending',
            reason: null
          })
          .select();

        console.log('[BusinessProfile] Insert result:', { insertedRows, insertError });
        resultError = insertError;
      }

      // 4. التحقق من وجود أخطاء بعد التحديث أو الإدراج
      if (resultError) {
        console.error('[BusinessProfile] Database operation error:', resultError);
        throw new Error(`${t('data_save_failed')}: ${resultError.message}`);
      }

      // 5. إتمام العملية: حالة التحقق ستصبح قيد المراجعة
      setBusinessStatus('pending');
      setRejectionReason(null);
      toast({
        title: t('business_profile_completed_successfully'),
        description: t('business_data_saved_redirecting') || 'تم إرسال بيانات النشاط التجاري بنجاح، وهي الآن قيد المراجعة.'
      });

    } catch (error: any) {
      console.error('[BusinessProfile] handleSubmit error:', error);
      toast({
        title: t('error'),
        description: error.message || t('unknown_error'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Function to capture an image with the camera and update the state
  const handleCameraCapture = async (type: 'store' | 'license') => {
    try {
      let imageFile: File | null = null;

      if (isNative) {
        // استخدام Capacitor Camera في بيئة التطبيق الحقيقي
        const image = await CapacitorCamera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
        });
    
        if (image.webPath) {
          const response = await fetch(image.webPath);
          const blob = await response.blob();
          if (!blob.type || !blob.type.startsWith('image/')) {
            console.error('Camera capture did not return an image blob, type=', blob.type);
            toast({ title: t('error'), description: t('invalid_file_type'), variant: 'destructive' });
            return;
          }
          const ext = blob.type.split('/')[1] || 'webp';
          imageFile = new File([blob], `${type}_${Date.now()}.${ext}`, { type: blob.type });
        }
      } else {
        // استخدام navigator.mediaDevices.getUserMedia في بيئة الويب
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment' // استخدام الكاميرا الخلفية
          } 
        });
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        // انتظار حتى يتم تحميل الفيديو
        await new Promise((resolve) => {
          video.onloadedmetadata = () => {
            resolve(null);
          };
        });

        // التقاط صورة من الفيديو
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (!blob || !blob.type.startsWith('image/')) {
            toast({ title: t('error'), description: t('invalid_file_type'), variant: 'destructive' });
            return;
          }
          
          // إيقاف دفق الفيديو
          stream.getTracks().forEach(track => track.stop());
          
          imageFile = new File([blob], `${type}_${Date.now()}.webp`, { type: 'image/webp' });
          handleImage(imageFile, type);
        }, 'image/webp');
        
        return;
      }

      if (imageFile) {
        await handleImage(imageFile, type);
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
                {businessStatus === 'pending' && (
                  <div className="mb-4 rounded-lg border border-yellow-400 bg-yellow-50 p-4 text-yellow-900">
                    <p className="font-semibold">{t('business_registration_under_review') || 'طلبك قيد المراجعة'}</p>
                    <p>{t('business_registration_under_review_description') || 'سيتم مراجعة بياناتك التجارية قريباً. لا يمكنك الدخول إلى التطبيق حتى يتم الموافقة على طلبك.'}</p>
                  </div>
                )}
                {businessStatus === 'rejected' && (
                  <div className="mb-4 rounded-lg border border-red-400 bg-red-50 p-4 text-red-900">
                    <p className="font-semibold">{t('business_registration_rejected') || 'تم رفض طلب التسجيل'}</p>
                    <p>{rejectionReason || t('business_registration_rejected_description') || 'يرجى تعديل البيانات وإعادة إرسال نموذج التحقق.'}</p>
                  </div>
                )}
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
                  additionalActions={
                    previews.storeImage && (
                      <div className="flex gap-2 mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openCropModal('store')}
                          disabled={processing}
                          className="flex items-center gap-1"
                        >
                          <CropIcon size={16} />
                          {t('crop')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => enhanceImage(storeImage, 'store')}
                          disabled={processing}
                          className="flex items-center gap-1"
                        >
                          {processing ? (
                            <RotateCw size={16} className="animate-spin" />
                          ) : (
                            <Wand2 size={16} />
                          )}
                          {t('enhance')}
                        </Button>
                      </div>
                    )
                  }
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
                  additionalActions={
                    previews.licenseImage && (
                      <div className="flex gap-2 mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openCropModal('license')}
                          disabled={processing}
                          className="flex items-center gap-1"
                        >
                          <CropIcon size={16} />
                          {t('crop')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => enhanceImage(licenseImage, 'license')}
                          disabled={processing}
                          className="flex items-center gap-1"
                        >
                          {processing ? (
                            <RotateCw size={16} className="animate-spin" />
                          ) : (
                            <Wand2 size={16} />
                          )}
                          {t('enhance')}
                        </Button>
                      </div>
                    )
                  }
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

      {/* نافذة الاقتطاع */}
      {showCropModal && cropImageSrc && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full">
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold">{t('crop_image')}</h3>
            </div>
            <div className="p-4">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={16 / 9}
              >
                <img src={cropImageSrc} alt="Crop preview" />
              </ReactCrop>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCropModal(false);
                  setCropImageType(null);
                  setCropImageSrc('');
                }}
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={() => {
                  if (completedCrop && cropImageType) {
                    const imageElement = document.querySelector('img[src="' + cropImageSrc + '"]') as HTMLImageElement;
                    if (imageElement) {
                      handleCropComplete(completedCrop, imageElement);
                    }
                  }
                }}
                disabled={!completedCrop}
              >
                {t('apply_crop')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
