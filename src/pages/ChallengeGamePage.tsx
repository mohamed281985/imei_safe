import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '@/components/PageContainer';
import AppNavbar from '@/components/AppNavbar';
import { useLanguage } from '@/contexts/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/hooks/use-toast';
import { useScrollToTop } from '../hooks/useScrollToTop';
import PageAdvertisement from '@/components/advertisements/PageAdvertisement';
import { Button } from '@/components/ui/button';
import { Gift } from 'lucide-react';

interface ChallengeGameProps {
  onComplete: (success: boolean, prize?: any) => void;
}

import { supabase } from '../lib/supabase';
import axiosInstance from '@/services/axiosInterceptor';

const checkGameLimit = async (userId: string, t: any) => {
  try {
    // استخدم API الخادم لتجنب مشاكل RLS وصلاحيات القراءة المباشرة من الجداول
    const response = await axiosInstance.post('/api/check-limit', { type: 'game' });
    const data = response?.data || {};
    if (!data.allowed) {
      toast({ 
        title: t('warning'), 
        description: t('game_limit_reached'), 
        variant: 'destructive' 
      });
      return false;
    }
    return true;
  } catch (error) {
    toast({ 
      title: t('error'), 
      description: t('error_checking_game_limit'), 
      variant: 'destructive' 
    });
    return false;
  }
};

const updateGameUsage = async (userId: string, t: any) => {
  try {
    await axiosInstance.post('/api/increment-usage', { type: 'game' });
  } catch (error) {
    toast({ 
      title: t('error'), 
      description: t('game_counter_update_failed'), 
      variant: 'destructive' 
    });
  }
};

const getRandomPrize = async () => {
  try {
    // جلب الجوائز الفائزة التي تكون active = TRUE
    const { data: prizes, error } = await supabase
      .from('game_win')
      .select('*')
      .eq('active', true);
      
    if (error) {
      throw error; // إطلاق الخطأ إذا كان من قاعدة البيانات مباشرة
    }
    if (!prizes || prizes.length === 0) {
      console.warn('لم يتم العثور على جوائز نشطة متاحة في جدول game_win.');
      return null; // إرجاع null بدلاً من إطلاق خطأ
    }
    
    // اختيار جائزة عشوائية
    const randomIndex = Math.floor(Math.random() * prizes.length);
    return prizes[randomIndex];
  } catch (error) {
    console.error('خطأ في جلب الجوائز:', error);
    return null;
  }
};

const addUserReward = async (userId: string, prize: any, t: any) => {
  try {
    console.log(t('adding_reward_to_user'), userId, prize);
    
    if (prize.type === 'none') {
      console.log(t('reward_type_none'));
      return true;
    }
    
    const rewardName = `${prize.type === 'bonus' || prize.type === 'bouns' ? t('bonus') : prize.type === 'points' ? t('points') : prize.type === 'money' ? t('money') : t('reward')}: ${prize.win || prize.type || t('unknown_reward')}`;
    const { error: insertError } = await supabase
      .from('user_rewards')
      .insert({
        user_id: userId,
        reward_name: rewardName,
        reward_description: t('won_prize_in_challenge_game'),
        reward_image: prize.imagesmall_url,
        prizes: prize.prizes || '0',
        claimed: false,
        created_at: new Date().toISOString()
      });
    
    if (insertError) {
      console.error(t('error_adding_reward'), insertError);
      
      if (insertError.code === '42501') {
        console.log(t('trying_rpc_method'));
        const { error: rpcError } = await supabase.rpc('insert_user_reward', {
          p_user_id: userId,
          p_reward_name: rewardName,
          p_reward_description: t('won_prize_in_timing_game'),
          p_reward_image: prize.imagesmall_url,
          p_prizes: prize.prizes || '0',
          p_claimed: false,
          p_created_at: new Date().toISOString()
        });
        
        if (rpcError) {
          console.error(t('rpc_method_failed'), rpcError);
          return false;
        }
        
        console.log(t('reward_added_via_rpc'));
        return true;
      }
      
      return false;
    }
    
    console.log(t('reward_added_successfully'));
    return true;
  } catch (error) {
    console.error(t('error_adding_reward'), error);
    return false;
  }
};


const ChallengeGame: React.FC<ChallengeGameProps> = ({ onComplete }): JSX.Element => {
  const { t } = useLanguage();
  const [userId, setUserId] = useState<string | null>(null);
  const [hasReachedGameLimit, setHasReachedGameLimit] = useState(false);
  const [showPrizeModal, setShowPrizeModal] = useState(false);
  const [prizeData, setPrizeData] = useState<any>(null);
  
  const [isActive, setIsActive] = useState(false);
  const [time, setTime] = useState(0);
  const [targetTime, setTargetTime] = useState(10000); // 10 ثوانٍ بالمللي ثانية
  const [finalTime, setFinalTime] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const ms = Math.floor((milliseconds % 1000) / 10);
    return `${seconds.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    fetchUser();
  }, []);

  const startTimer = () => {
    if (!userId) {
      // toast({ title: 'خطأ', description: 'يرجى تسجيل الدخول أولاً', variant: 'destructive' });
      return;
    }
    const localT = t;
    checkGameLimit(userId, localT).then((canProceed) => {
      if (!canProceed) {
        return;
      }
      const newTarget = 10000; // 10 ثوانٍ بالمللي ثانية
      setTargetTime(newTarget);
      setIsActive(true);
      setFinalTime(null);
      setTime(0);
      intervalRef.current = setInterval(() => {
        setTime(prevTime => { // تحديث الوقت كل 10 مللي ثانية
          const newTime = prevTime + 10; // زيادة الوقت
          // إيقاف المؤقت تلقائياً بعد 15 ثانية لمنع التشغيل اللانهائي
          if (newTime >= 15000) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
            setIsActive(false);
            setFinalTime(newTime);
          }
          return newTime;
        });
      }, 10);
    });
  };

  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsActive(false);
    const finalTimeValue = time;
    setFinalTime(finalTimeValue);
    if (userId) {
      updateGameUsage(userId, t);
    }
    
    if (finalTimeValue === targetTime) {
      (async () => {
        try {
          const prize = await getRandomPrize();
          if (prize) {
            setPrizeData(prize);
            setShowPrizeModal(true);
            const prizeAdded = await addUserReward(userId, prize, t);
            const rewardAdded = await addUserReward(userId, prize, t);
            
            if (prizeAdded) {
              console.log(t('prize_added_to_user_record'));
            } else {
              console.error(t('prize_addition_failed'));
            }
            
            if (rewardAdded) {
              console.log(t('reward_added_to_rewards_record'));
            } else {
              console.error(t('reward_addition_to_record_failed'));
            }
            
            onComplete(true, prize);
          } else {
            console.warn(t('no_active_prizes_available'));
            onComplete(true);
          }
        } catch (error) {
          console.error(t('error_in_win_process'), error);
          onComplete(false);
        }
      })();
    } else {
      toast({
        title: t('try_again_game'),
        description: `${t('you_stopped_at')} ${formatTime(finalTimeValue)}`,
        variant: 'destructive'
      });
      onComplete(false);
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const buttonText = isActive ? t('stop') : t('start');
  
  // دالة اختبار شاملة للفوز وجلب جائزة حقيقية
  const testWin = async () => {
    if (!userId) {
      return;
    }

    setIsActive(false);
    setFinalTime(targetTime);

    try {
      console.log(t('starting_win_test'));
      
      const prize = await getRandomPrize();
      
      if (prize) {
        console.log(t('prize_fetched_successfully'), prize);
        
        setPrizeData(prize);
        setShowPrizeModal(true);
        
        const prizeAdded = await addUserReward(userId, prize, t);
        const rewardAdded = await addUserReward(userId, prize, t);
        
        if (prizeAdded) {
          console.log(t('prize_added_to_user_record'));
        }
        
        if (rewardAdded) {
          console.log(t('reward_added_to_rewards_record'));
        } else {
          console.error(t('reward_addition_to_record_failed'));
        }
        
        onComplete(true, prize);
      } else {
        console.warn(t('no_active_prizes_available'));
        onComplete(true);
      }
    } catch (error) {
      console.error(t('error_in_win_test'), error);
    }
  };

  return (
    <div className="bg-imei-darker border border-imei-cyan/20 rounded-2xl p-6 text-center shadow-lg shadow-black/30">
      <AnimatePresence mode="wait">
        {isActive ? (
          <motion.div
            key="timer"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="font-bold text-[4rem] text-orange-400 bg-black/50 px-6 py-4 rounded-lg border border-orange-500/30 shadow-inner"
          >
            {formatTime(time)}
          </motion.div>
        ) : (
          <motion.div
            key="target"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="font-mono text-7xl text-imei-cyan bg-black/50 px-6 py-4 rounded-lg border border-imei-cyan/30 shadow-inner"
          >
            {finalTime !== null ? formatTime(finalTime) : (targetTime > 0 ? formatTime(targetTime) : "00:00")}
          </motion.div>
        )}
      </AnimatePresence>
      <p className="text-white/80 mt-4 mb-6">{t('stop_at_target_time')}</p>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={isActive ? stopTimer : startTimer}
        className={`w-full py-3 rounded-lg text-lg font-bold transition-all duration-300 ${
          isActive 
            ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/30' 
            : 'bg-imei-cyan hover:bg-cyan-400 text-imei-dark shadow-cyan-500/30'
        } shadow-lg`}
      >
        {buttonText}
      </motion.button>
    </div>
  );
};

const ChallengeGamePage: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  useScrollToTop();
  const [showPrizeModal, setShowPrizeModal] = useState(false);
  const [prizeData, setPrizeData] = useState<any>(null);

  const handleGameComplete = (success: boolean, prize?: any) => {
    if (success && prize) {
      setPrizeData(prize);
      setShowPrizeModal(true);
    }
  };

  return (
    <>
      <PageContainer>
        <div className="relative min-h-screen pb-20">
          <AppNavbar />
          <div className="mt-8 mb-4">
            <PageAdvertisement pageName="challenge-game" />
          </div>
          <div className="px-4 py-8">
            <h1 className="text-3xl font-bold text-black text-center mb-2">{t('play_and_win')}</h1>
            <p className="text-black text-center font-bold text-2xl mb-6">{t('win_prizes_by_playing')}</p>
            <div className="flex justify-center gap-4 mb-4">
              <Button 
                onClick={() => navigate('/rewards')}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Gift className="w-5 h-5" />
                {t('my_rewards')}
              </Button>
            </div>
            <ChallengeGame onComplete={handleGameComplete} />
          </div>
        </div>
      </PageContainer>
      <AnimatePresence>
        {showPrizeModal && prizeData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setShowPrizeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              className="relative w-full h-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              {prizeData.imagesmall_url && (
                <img src={prizeData.imagesmall_url} alt={prizeData.win}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              )}
              <Button
                onClick={() => setShowPrizeModal(false)}
                className="absolute top-20 right-6 bg-red-600 text-white rounded-full w-10 h-10 p-2 hover:bg-red-700"
                aria-label={t('close')}
              >
                X
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChallengeGamePage;
