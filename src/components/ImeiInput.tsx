import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { Camera, Check, Flashlight, FlashlightOff, Loader2, RotateCcw, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Script, TextRecognition } from '@capacitor-mlkit/text-recognition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';
import { isImeiAllowed, normalizeImei } from '../../shared/imeiValidation.js';
import { findImeisNearLabels, getImeiOcrDiagnostics } from '../../shared/imeiOcr.js';

interface ImeiInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  userRole?: string;
}

let ocrWorkerPromise: Promise<any> | null = null;

const getOcrWorker = async () => {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('eng'));
  }
  return ocrWorkerPromise;
};

export default function ImeiInput({ value, onValueChange, className, disabled, onBlur, userRole, ...inputProps }: ImeiInputProps) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [touched, setTouched] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selectedImei, setSelectedImei] = useState('');
  const [manualImei, setManualImei] = useState('');
  const [flashSupported, setFlashSupported] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const normalizedValue = normalizeImei(value);
  const invalidValue = normalizedValue.length > 0 && !isImeiAllowed(normalizedValue, userRole);
  const showInvalid = invalidValue && (normalizedValue.length === 15 || touched);

  const updateValue = (rawValue: string) => {
    const normalized = normalizeImei(rawValue).slice(0, 15);
    setScanError('');
    setCandidates([]);
    onValueChange(normalized);
  };

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setFlashSupported(false);
    setFlashEnabled(false);
  }, []);

  useEffect(() => {
    if (!cameraOpen || capturedImage) return;
    let active = true;
    const openCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 960 },
            aspectRatio: { ideal: 4 / 3 },
          },
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
          torch?: boolean;
          zoom?: { min: number; max: number; step?: number };
        };
        setFlashSupported(Boolean(capabilities?.torch));
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          try {
            const zoomRange = capabilities?.zoom;
            const minimumZoom = zoomRange
              ? Math.min(zoomRange.max, Math.max(zoomRange.min, 1))
              : undefined;
            await track.applyConstraints({
              advanced: [{
                focusMode: 'continuous',
                ...(minimumZoom !== undefined ? { zoom: minimumZoom } : {}),
              } as any],
            });
          } catch {
            // Focus and zoom constraints are not exposed by every camera implementation.
          }
        }
      } catch (error) {
        console.error('IMEI camera preview failed:', error);
        if (active) setCameraError('imei_scan_camera_unavailable');
      }
    };
    void openCamera();
    return () => {
      active = false;
      stopCamera();
    };
  }, [cameraOpen, capturedImage, stopCamera]);

  useEffect(() => () => {
    stopCamera();
    if (capturedImage) URL.revokeObjectURL(capturedImage);
  }, [capturedImage, stopCamera]);

  const loadImageBlob = async (image: File | string) => {
    if (typeof image !== 'string') return image;
    const response = await fetch(image);
    if (!response.ok) throw new Error('Could not load captured image');
    return response.blob();
  };

  const canvasToBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode image')), 'image/jpeg', 0.97);
  });

  const prepareImageVariants = async (sourceBlob: Blob) => {
    const bitmap = await createImageBitmap(sourceBlob, { imageOrientation: 'from-image' });
    try {
      const maxDimension = 3200;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = width;
      fullCanvas.height = height;
      const fullContext = fullCanvas.getContext('2d');
      if (!fullContext) throw new Error('Could not prepare image for OCR');
      fullContext.drawImage(bitmap, 0, 0, width, height);

      const enhancedCanvas = document.createElement('canvas');
      enhancedCanvas.width = width;
      enhancedCanvas.height = height;
      const enhancedContext = enhancedCanvas.getContext('2d');
      if (!enhancedContext) throw new Error('Could not enhance image for OCR');
      enhancedContext.filter = 'brightness(1.12) contrast(1.35) grayscale(1)';
      enhancedContext.drawImage(bitmap, 0, 0, width, height);

      const cropX = Math.round(bitmap.width * 0.05);
      const cropY = Math.round(bitmap.height * 0.12);
      const cropWidth = Math.max(1, Math.round(bitmap.width * 0.9));
      const cropHeight = Math.max(1, Math.round(bitmap.height * 0.76));
      const cropScale = Math.min(1.5, maxDimension / Math.max(cropWidth, cropHeight));
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = Math.max(1, Math.round(cropWidth * cropScale));
      cropCanvas.height = Math.max(1, Math.round(cropHeight * cropScale));
      const cropContext = cropCanvas.getContext('2d');
      if (!cropContext) throw new Error('Could not crop image for OCR');
      cropContext.filter = 'brightness(1.12) contrast(1.35) grayscale(1)';
      cropContext.drawImage(bitmap, cropX, cropY, cropWidth, cropHeight, 0, 0, cropCanvas.width, cropCanvas.height);

      return [
        { name: 'original', blob: sourceBlob },
        { name: 'enhanced', blob: await canvasToBlob(enhancedCanvas) },
        { name: 'center-crop', blob: await canvasToBlob(cropCanvas) },
      ];
    } finally {
      bitmap.close();
    }
  };

  const recognizeImage = async (image: Blob) => {
    if (Capacitor.isNativePlatform()) {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(image);
      });
      const file = await Filesystem.writeFile({
        path: `imei-scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`,
        data: base64,
        directory: Directory.Cache,
      });
      try {
        const result = await TextRecognition.processImage({ path: file.uri, script: Script.Latin });
        return result.text || '';
      } finally {
        await Filesystem.deleteFile({ path: file.path, directory: Directory.Cache }).catch(() => undefined);
      }
    }

    const imageUrl = URL.createObjectURL(image);
    try {
      const worker = await getOcrWorker();
      await worker.setParameters({ tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:.-' });
      const { data } = await worker.recognize(imageUrl);
      return data.text || '';
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  };

  const scanImage = async (image: File | string) => {
    setScanning(true);
    setScanError('');
    setCandidates([]);
    setSelectedImei('');
    try {
      const sourceBlob = await loadImageBlob(image);
      const imageVariants = await prepareImageVariants(sourceBlob);
      const foundImeis = new Set<string>();
      const failedVariants: string[] = [];
      let lastDiagnostics = getImeiOcrDiagnostics('');

      for (const variant of imageVariants) {
        try {
          const text = await recognizeImage(variant.blob);
          const variantCandidates = findImeisNearLabels(text);
          lastDiagnostics = getImeiOcrDiagnostics(text, variantCandidates);
          variantCandidates.forEach((candidate) => foundImeis.add(candidate));
          console.info('[IMEI OCR] attempt complete', {
            variant: variant.name,
            ...lastDiagnostics,
            totalCandidateCount: foundImeis.size,
            reason: variantCandidates.length ? 'valid_candidates_found' : lastDiagnostics.imeiLabelCount ? 'no_valid_luhn_candidate' : 'no_imei_label',
          });
        } catch (error) {
          const reason = error instanceof Error ? error.name : 'recognition_error';
          failedVariants.push(variant.name);
          console.warn('[IMEI OCR] attempt failed', { variant: variant.name, reason });
        }
      }

      const results = [...foundImeis];
      if (results.length > 0) {
        setCandidates(results);
        setSelectedImei(results[0]);
        setManualImei(results[0]);
        setScanError('');
      } else {
        console.info('[IMEI OCR] scan finished', {
          attempts: imageVariants.length,
          failedAttempts: failedVariants.length,
          ...lastDiagnostics,
          reason: failedVariants.length === imageVariants.length ? 'all_recognition_attempts_failed' : 'no_valid_15_digit_luhn_imei',
        });
        setScanError(failedVariants.length === imageVariants.length ? 'imei_scan_failed' : 'imei_scan_no_match');
      }
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'image_preparation_error';
      console.warn('[IMEI OCR] image preparation failed', { reason });
      setScanError('imei_scan_failed');
    } finally {
      setScanning(false);
    }
  };

  const handleCameraClick = () => {
    setScanError('');
    setCameraError('');
    setCapturedImage(null);
    setCameraOpen(true);
  };

  const captureCameraFrame = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.96));
    if (!blob) {
      setScanError('imei_scan_failed');
      return;
    }
    const previewUrl = URL.createObjectURL(blob);
    setCapturedImage(previewUrl);
    stopCamera();
    void scanImage(previewUrl);
  };

  const toggleFlash = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextEnabled = !flashEnabled;
      await track.applyConstraints({ advanced: [{ torch: nextEnabled } as any] });
      setFlashEnabled(nextEnabled);
    } catch (error) {
      console.warn('IMEI camera torch toggle failed:', error);
      setFlashSupported(false);
    }
  };

  const retakePhoto = () => {
    if (capturedImage) URL.revokeObjectURL(capturedImage);
    setCapturedImage(null);
    setCandidates([]);
    setSelectedImei('');
    setManualImei('');
    setScanError('');
  };

  const confirmManualImei = () => {
    const normalized = normalizeImei(manualImei);
    if (!isImeiAllowed(normalized, userRole)) return;
    updateValue(normalized);
    closeCamera();
  };

  const confirmImei = () => {
    if (!isImeiAllowed(selectedImei, userRole)) return;
    updateValue(selectedImei);
    retakePhoto();
    setCameraOpen(false);
  };

  const closeCamera = () => {
    stopCamera();
    if (capturedImage) URL.revokeObjectURL(capturedImage);
    setCapturedImage(null);
    setCameraOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-stretch gap-2">
        <Input
          {...inputProps}
          value={normalizedValue}
          onChange={(event) => updateValue(event.currentTarget.value)}
          onBlur={(event) => {
            setTouched(true);
            onBlur?.(event);
          }}
          disabled={disabled || scanning}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={15}
          dir="ltr"
          aria-invalid={showInvalid || undefined}
          className={['min-w-0 flex-1', className].filter(Boolean).join(' ')}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label={t('imei_scan_camera')}
          title={t('imei_scan_camera')}
          disabled={disabled || scanning}
          onClick={handleCameraClick}
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              if (capturedImage) URL.revokeObjectURL(capturedImage);
              setCapturedImage(URL.createObjectURL(file));
              setCandidates([]);
              setSelectedImei('');
              setManualImei('');
              setCameraError('');
              setCameraOpen(true);
              void scanImage(file);
            }
            event.currentTarget.value = '';
          }}
        />
      </div>
      {cameraOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-3" dir="rtl">
          <section className="w-full max-w-lg space-y-4 rounded-xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-black text-slate-900">{t('imei_scan_frame_title')}</h2>
                <p className="text-sm text-slate-600">{t('imei_scan_frame_hint')}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={t('close')} onClick={closeCamera}><X /></Button>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-black">
              {capturedImage ? (
                <img src={capturedImage} alt={t('imei_scan_captured_image')} className="h-full w-full object-contain" />
              ) : (
                <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-contain" />
              )}
              {!capturedImage && <div className="pointer-events-none absolute left-[8%] top-[24%] h-[52%] w-[84%] rounded-md border-2 border-emerald-400 shadow-[0_0_0_999px_rgba(0,0,0,0.45)]" />}
            </div>
            {cameraError && <p role="alert" className="text-sm font-semibold text-red-700">{t(cameraError)}</p>}
            {scanError && <p role="alert" className="text-sm font-semibold text-red-700">{t(scanError)}</p>}
            {scanning && <p role="status" className="text-sm text-slate-600">{t('imei_scanning')}</p>}
            {candidates.length > 0 && !scanning && (
              <div className="space-y-3">
                {candidates.length > 1 && <div className="flex flex-wrap gap-2" aria-label={t('imei_scan_choose_result')}>
                  {candidates.map((candidate) => (
                    <Button key={candidate} type="button" variant={selectedImei === candidate ? 'default' : 'outline'} size="sm" onClick={() => setSelectedImei(candidate)}>{candidate}</Button>
                  ))}
                </div>}
                <label className="block text-sm font-semibold text-slate-800" htmlFor="detected-imei">{t('imei_scan_confirm_label')}</label>
                <Input id="detected-imei" value={selectedImei} onChange={(event) => setSelectedImei(normalizeImei(event.currentTarget.value).slice(0, 15))} inputMode="numeric" dir="ltr" maxLength={15} />
                {selectedImei.length === 15 && !isImeiAllowed(selectedImei, userRole) && <p className="text-sm text-red-700">{t('invalid_imei')}</p>}
                <p className="text-xs leading-relaxed text-slate-500">{t('imei_scan_luhn_notice')}</p>
                <Button type="button" onClick={confirmImei} disabled={!isImeiAllowed(selectedImei, userRole)} className="w-full"><Check />{t('imei_scan_confirm_action')}</Button>
              </div>
            )}
            {capturedImage && candidates.length === 0 && !scanning && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <label className="block text-sm font-semibold text-slate-800" htmlFor="manual-imei">{t('imei_scan_manual_label')}</label>
                <Input
                  id="manual-imei"
                  value={manualImei}
                  onChange={(event) => setManualImei(normalizeImei(event.currentTarget.value).slice(0, 15))}
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={15}
                  autoComplete="off"
                />
                {manualImei.length === 15 && !isImeiAllowed(manualImei, userRole) && <p className="text-sm text-red-700">{t('invalid_imei')}</p>}
                <Button type="button" onClick={confirmManualImei} disabled={!isImeiAllowed(manualImei, userRole)} className="w-full">{t('imei_scan_manual_action')}</Button>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {!capturedImage && flashSupported && <Button type="button" variant="outline" onClick={() => void toggleFlash()}>{flashEnabled ? <FlashlightOff /> : <Flashlight />}{t(flashEnabled ? 'imei_scan_flash_off' : 'imei_scan_flash_on')}</Button>}
              {!capturedImage && <Button type="button" onClick={() => void captureCameraFrame()} disabled={Boolean(cameraError)}><Camera />{t('imei_scan_capture')}</Button>}
              {capturedImage && <Button type="button" variant="outline" onClick={retakePhoto}><RotateCcw />{t('imei_scan_retake')}</Button>}
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}><Camera />{t('imei_scan_choose_image')}</Button>
            </div>
          </section>
        </div>
      )}
      {scanning && <p className="text-sm text-slate-600" role="status">{t('imei_scanning')}</p>}
      {showInvalid && <p className="text-sm font-medium text-red-600" role="alert">{t('invalid_imei')}</p>}
      {scanError && <p className="text-sm font-medium text-red-600" role="alert">{t(scanError)}</p>}
    </div>
  );
}