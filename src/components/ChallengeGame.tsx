import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface ChallengeGameProps {
  onComplete?: (success: boolean) => void;
}

const ChallengeGame: React.FC<ChallengeGameProps> = ({ onComplete }) => {
  const { t } = useLanguage();
  const { toast } = useToast();

  // حالة اللعبة: 'idle' | 'running' | 'success' | 'failed'
  const [gameState, setGameState] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');

  // الوقت الحالي في الثواني وأجزاء الثانية
  const [time, setTime] = useState({ seconds: 0, milliseconds: 0 });

  // الهدف هو 30 ثانية
  const targetTime = 10;

  // متغيرات للتحكم في المؤقت
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastButtonClickRef = useRef<number>(0);

  // بدء اللعبة
  const startGame = () => {
    setGameState('running');
    setTime({ seconds: 0, milliseconds: 0 });
    lastButtonClickRef.current = Date.now();
    startTimeRef.current = Date.now();

    const tick = () => {
      if (startTimeRef.current === 0) return; // Game has been stopped

      const elapsed = Date.now() - startTimeRef.current;
      const seconds = Math.floor(elapsed / 1000);
      const milliseconds = Math.floor((elapsed % 1000) / 10);

      setTime({ seconds, milliseconds: Math.floor(milliseconds) });

      timerRef.current = requestAnimationFrame(tick);
    };

    timerRef.current = requestAnimationFrame(tick);
  };

  // نهاية اللعبة
  const endGame = (success: boolean) => {
    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
      startTimeRef.current = 0; // Reset start time to stop the tick function
    }

    setGameState(success ? 'success' : 'failed');

    // إعلام المكون الأب
    if (onComplete) {
      onComplete(success);
    }

    // عرض رسالة نجاح أو فشل
    if (success) {
      toast({
        title: "🎉 " + t('challenge_success'),
        description: t('you_achieved_target', { target: String(targetTime) }),
        variant: "default"
      });
    } else {
      toast({
        title: "⏱️ " + t('challenge_failed'),
        description: t('try_again_game'),
        variant: "destructive"
      });
    }
  };

  // التعامل مع النقر على الزر
  const handleButtonClick = () => {
    if (gameState === 'idle') {
      startGame();
    } else if (gameState === 'running') {
      // التحقق مما إذا كان الوقت الحالي هو 10 ثانية بالضبط
      if (time.seconds === targetTime && time.milliseconds === 0) {
        // الفوز الدقيق عند 10.00 بالضبط
        endGame(true);
      } else {
        // الخسارة إذا تم الضغط في وقت خاطئ
        endGame(false);
      }
    } else if (gameState === 'success' || gameState === 'failed') {
      // إعادة تشغيل اللعبة
      setGameState('idle');
    }
  };

  // تنظيف المؤقت عند تفكيك المكون
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        cancelAnimationFrame(timerRef.current);
      }
    };
  }, []);
  
  // تنظيف المؤقت عند تغيير حالة اللعبة
  useEffect(() => {
    if (gameState !== 'running' && timerRef.current !== null) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
      startTimeRef.current = 0;
    }
  }, [gameState]);

  // تحديد نص الزر بناءً على حالة اللعبة
  const getButtonText = () => {
    if (gameState === 'idle') {
      return t('start_challenge');
    } else if (gameState === 'running') {
      return t('stop_challenge'); // تم تغيير النص
    } else if (gameState === 'success') {
      return t('play_again');
    } else if (gameState === 'failed') {
      return t('try_again_game');
    }
    return t('start_challenge');
  };

  // تحديد لون الزر بناءً على حالة اللعبة
  const getButtonVariant = () => {
    if (gameState === 'idle') {
      return "default";
    } else if (gameState === 'running') {
      return "default";
    } else if (gameState === 'success') {
      return "default";
    } else if (gameState === 'failed') {
      return "destructive";
    }
    return "default";
  };

  return (
    <div className="w-full max-w-sm mx-auto  bg-gradient-to-br from-imei-dark/90 to-black/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-imei-cyan/20">
      <h2 className="text-2xl font-bold text-center mb-6 bg-gradient-to-r from-imei-cyan to-green-400 bg-clip-text text-transparent">
       العب لتربح
      </h2>

      {/* عداد الوقت */}
      <div className="mb-8">
        <div className="relative flex flex-col items-center justify-center">
          <div className="bg-black/50 rounded-lg p-4 shadow-inner w-56 text-center">
            <div className="text-5xl font-mono font-bold tracking-wider">
              <span className={gameState === 'success' ? "text-green-400 animate-pulse" : "text-imei-cyan"}>
                {time.seconds.toString().padStart(2, '0')}
              </span>
              <span className="text-gray-500 mx-1">:</span>
              <span className="text-imei-cyan">
                {time.milliseconds.toString().padStart(2, '0')}
              </span>
            </div>
          </div>
          <div className="text-gray-400 text-sm mt-3">
            {t('target_time', { target: String(targetTime) })}
          </div>
        </div>

      </div>

      {/* زر اللعبة */}
      <div className="flex justify-center mb-6">
        <Button 
          onClick={handleButtonClick}
          variant={getButtonVariant()}
          className={`px-8 py-4 text-lg rounded-full transition-all duration-300 transform hover:scale-105 shadow-lg
            ${gameState === 'idle' ? 'bg-imei-cyan hover:bg-imei-cyan/90 shadow-imei-cyan/20' : ''}
            ${gameState === 'running' ? 'bg-orange-500 hover:bg-orange-600 animate-pulse shadow-orange-500/20' : ''}
            ${gameState === 'success' ? 'bg-green-500 hover:bg-green-600 shadow-green-500/20' : ''}
            ${gameState === 'failed' ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' : ''}
          `}
        >
          <span className="font-bold text-xl text-black">{gameState === 'idle' ? 'ابدأ التحدي' : getButtonText()}</span>
        </Button>
      </div>

      {/* تعليمات اللعبة */}
      <div className="text-center text-white-400 text-xl font-bold  p-3 bg-black/20 rounded-lg border border-imei-cyan/10">
        {gameState === 'idle' && t('اضغط  عند 00 : 10  لتربح')}
      
      </div>
    </div>
  );
};

export default ChallengeGame;
