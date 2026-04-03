import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, Star, ArrowLeft, Calendar, Trophy, Award, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from "@/components/ui/skeleton";
import PageContainer from '@/components/PageContainer';
import AppNavbar from '@/components/AppNavbar';
import PageAdvertisement from '@/components/advertisements/PageAdvertisement';
import { useScrollToTop } from '@/hooks/useScrollToTop';

const RewardsPage: React.FC = () => {
    const { t } = useLanguage();
    useScrollToTop();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [rewards, setRewards] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [claimingId, setClaimingId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const rewardsPerPage = 4;

    // جلب المكافآت الخاصة بالمستخدم
    useEffect(() => {
        const fetchRewards = async () => {
            if (!user) return;

            setLoading(true);
            try {
                // جلب جميع البيانات من جدول المكافآت
                const { data, error } = await supabase
                    .from('user_rewards')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('Error fetching rewards:', error);
                    toast({
                        title: 'خطأ',
                        description: 'فشل جلب المكافآت',
                        variant: 'destructive'
                    });
                    return;
                }

                setRewards(data || []);
            } catch (err) {
                console.error('Error fetching rewards:', err);
                toast({
                    title: 'خطأ',
                    description: 'حدث خطأ أثناء جلب المكافآت',
                    variant: 'destructive'
                });
            } finally {
                setLoading(false);
            }
        };

        fetchRewards();
    }, [user, toast]);

    // استرداد مكافأة
    const claimReward = async (rewardId: string) => {
        setClaimingId(rewardId);
        try {
            // جلب بيانات المكافأة أولاً
            const { data: reward, error: fetchError } = await supabase
                .from('user_rewards')
                .select('*')
                .eq('id', rewardId)
                .eq('user_id', user?.id)
                .eq('claimed', false)
                .single();
            
            if (fetchError || !reward) {
                console.error('لم يتم العثور على المكافأة أو أنها مستردة بالفعل:', fetchError);
                toast({
                    title: 'خطأ',
                    description: 'لم يتم العثور على المكافأة أو أنها مستردة بالفعل',
                    variant: 'destructive'
                });
                return;
            }
            
            // تحديث حالة المكافأة إلى مستردة
            const { error: updateError } = await supabase
                .from('user_rewards')
                .update({ 
                    claimed: true,
                    claimed_at: new Date().toISOString()
                })
                .eq('id', rewardId)
                .eq('user_id', user?.id);
            
            if (updateError) {
                console.error('خطأ في تحديث حالة المكافأة:', updateError);
                toast({
                    title: 'خطأ',
                    description: 'حدث خطأ في تحديث حالة المكافأة',
                    variant: 'destructive'
                });
                return;
            }
            
            // تطبيق الجائزة للمستخدم بناءً على نوعها
            let message = '';
            
            // استنتاج نوع الجائزة من اسمها
            const rewardType = reward.reward_name.includes('بونص') || reward.reward_name.includes('bonus') || reward.reward_name.includes('bouns') 
                ? 'bonus' 
                : reward.reward_name.includes('نقاط') || reward.reward_name.includes('points') 
                    ? 'points' 
                    : reward.reward_name.includes('مال') || reward.reward_name.includes('money') 
                        ? 'money' 
                        : 'other';
            
            if (rewardType === 'bonus') {
                // جلب قيمة البونص الحالية
                const { data: currentBonus } = await supabase
                    .from('users_plans')
                    .select('bonus')
                    .eq('user_id', user?.id)
                    .single();
                
                // تحديث رصيد البونص للمستخدم
                const { error: bonusError } = await supabase
                    .from('users_plans')
                    .upsert({
                        user_id: user?.id,
                        bonus: (currentBonus?.bonus || 0) + parseInt(reward.prizes || '0')
                    });
                
                if (bonusError) {
                    console.error('خطأ في تحديث رصيد البونص:', bonusError);
                    message = 'حدث خطأ في تحديث رصيد البونص';
                } else {
                    message = `تم إضافة ${reward.prizes} بونص إلى حسابك`;
                }
            } else if (rewardType === 'points') {
                // جلب قيمة النقاط الحالية
                const { data: currentPoints } = await supabase
                    .from('users_plans')
                    .select('points')
                    .eq('user_id', user?.id)
                    .single();
                
                // تحديث رصيد النقاط للمستخدم
                const { error: pointsError } = await supabase
                    .from('users_plans')
                    .upsert({
                        user_id: user?.id,
                        points: (currentPoints?.points || 0) + parseInt(reward.prizes || '0')
                    });
                
                if (pointsError) {
                    console.error('خطأ في تحديث رصيد النقاط:', pointsError);
                    message = 'حدث خطأ في تحديث رصيد النقاط';
                } else {
                    message = `تم إضافة ${reward.prizes} نقطة إلى حسابك`;
                }
            } else if (rewardType === 'money') {
                // جلب قيمة المال الحالية
                const { data: currentMoney } = await supabase
                    .from('users_plans')
                    .select('money')
                    .eq('user_id', user?.id)
                    .single();
                
                // تحديث رصيد المال للمستخدم
                const { error: moneyError } = await supabase
                    .from('users_plans')
                    .upsert({
                        user_id: user?.id,
                        money: (currentMoney?.money || 0) + parseInt(reward.prizes || '0')
                    });
                
                if (moneyError) {
                    console.error('خطأ في تحديث رصيد المال:', moneyError);
                    message = 'حدث خطأ في تحديث رصيد المال';
                } else {
                    message = `تم إضافة ${reward.prizes} دولار إلى حسابك`;
                }
            } else {
                // نوع جائزة آخر
                message = 'تم استرداد الجائزة بنجاح';
            }
            
            // تحديث الحالة بعد تأخير بسيط لإظهار التأثير البصري
            setTimeout(() => {
                setRewards(prev => prev.map(r => 
                    r.id === rewardId ? { ...r, claimed: true, claimed_at: new Date().toISOString() } : r
                ));
            }, 500);

            toast({
                title: 'نجاح',
                description: message || 'تم استرداد المكافأة بنجاح'
            });
        } catch (err) {
            console.error('Error claiming reward:', err);
            toast({
                title: 'خطأ',
                description: 'حدث خطأ أثناء استرداد المكافأة',
                variant: 'destructive'
            });
        } finally {
            setTimeout(() => setClaimingId(null), 1000);
        }
    };

    const RewardCard = ({ reward }: { reward: any }) => {
        // استنتاج نوع الجائزة من اسمها
        const rewardType = reward.reward_name.includes('بونص') || reward.reward_name.includes('bonus') || reward.reward_name.includes('bouns') 
            ? 'bonus' 
            : reward.reward_name.includes('نقاط') || reward.reward_name.includes('points') 
                ? 'points' 
                : reward.reward_name.includes('مال') || reward.reward_name.includes('money') 
                    ? 'money' 
                    : 'other';
        
        return (
            <div className={`relative rounded-2xl overflow-hidden border transition-all duration-300 ${
                reward.claimed 
                    ? 'border-green-500/20 bg-white/80 backdrop-blur-sm shadow-md' 
                    : 'border-imei-cyan/20 bg-white/80 backdrop-blur-sm shadow-lg'
            }`}>
                <div className="p-5 flex flex-col h-full">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h4 className="font-bold text-lg text-gray-800">{reward.reward_name}</h4>
                            <p className="text-sm text-gray-600 mt-1">{reward.reward_description}</p>
                            {reward.prizes && (
                                <div className="mt-3 p-2 bg-gradient-to-r from-imei-cyan/20 to-blue-500/20 rounded-lg">
                                    <p className="text-base font-bold text-gray-700">
                                        <span className="text-purple-600">{t('reward_value')}:</span> <span className="text-xl text-blue-600">{reward.prizes}</span> 
                                        <span className="text-base font-bold text-blue-700 mr-1">
                                            {rewardType === 'bonus' ? t('reward_bonus') : 
                                             rewardType === 'points' ? t('reward_points') : 
                                             rewardType === 'money' ? t('reward_money') : ''}
                                        </span>
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ml-4 ${
                            reward.claimed ? 'bg-green-100' : 'bg-imei-cyan/10'
                        }`}>
                            {reward.claimed ? (
                                <CheckCircle className="w-6 h-6 text-green-500" />
                            ) : (
                                <Gift className="w-6 h-6 text-imei-cyan" />
                            )}
                        </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Calendar className="w-4 h-4" />
                            {new Date(reward.created_at).toLocaleDateString()}
                        </div>
                        {!reward.claimed && (
                            <Button 
                                onClick={() => claimReward(reward.id)}
                                disabled={claimingId === reward.id}
                                className="bg-imei-cyan text-imei-dark font-bold text-sm px-4 py-2 h-auto"
                            >
                                {claimingId === reward.id ? t('claiming_reward') : t('claim_reward')}
                            </Button>
                        )}
                        {reward.claimed && (
                            <div className="text-green-500 text-sm font-medium">
                                {t('reward_claimed')} {reward.claimed_at && new Date(reward.claimed_at).toLocaleDateString()}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const SkeletonCard = () => (
        <div className="rounded-2xl border border-gray-700/50 bg-white/5 p-5">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <Skeleton className="h-6 w-32 mb-2" />
                    <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="w-12 h-12 rounded-full" />
            </div>
            <div className="flex items-center justify-between mt-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-20" />
            </div>
        </div>
    );

    // حساب الصفحات
    const totalPages = Math.ceil(rewards.length / rewardsPerPage);
    const startIndex = currentPage * rewardsPerPage;
    const endIndex = startIndex + rewardsPerPage;
    const currentRewards = rewards.slice(startIndex, endIndex);

    // الانتقال إلى الصفحة التالية
    const nextPage = () => {
        if (currentPage < totalPages - 1) {
            setCurrentPage(currentPage + 1);
        }
    };

    // الانتقال إلى الصفحة السابقة
    const prevPage = () => {
        if (currentPage > 0) {
            setCurrentPage(currentPage - 1);
        }
    };

    return (
        <PageContainer>
            <div className="relative min-h-screen pb-20">
                <AppNavbar />
                <div className="mt-8 mb-4">
                    <PageAdvertisement pageName="rewards" />
                </div>
                <div className="px-4 py-8">
                    <div className="w-full max-w-4xl mx-auto">
                        {/* رأس الصفحة */}
                        <div className="flex items-center justify-center mb-8">
                            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                                <Award className="w-8 h-8 text-yellow-500" />
                                {t('rewards_history')}
                            </h1>
                        </div>

                        {loading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <SkeletonCard />
                                <SkeletonCard />
                                <SkeletonCard />
                                <SkeletonCard />
                            </div>
                        ) : rewards.length > 0 ? (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {currentRewards.map((reward) => (
                                        <RewardCard key={reward.id} reward={reward}/>
                                    ))}
                                </div>
                                
                                {/* أزرار التنقل بين الصفحات */}
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-center mt-8 gap-4">
                                        <Button 
                                            onClick={prevPage}
                                            disabled={currentPage === 0}
                                            className="bg-imei-cyan hover:bg-cyan-600 text-white flex items-center gap-2 p-3 rounded-full"
                                            variant="outline"
                                            size="icon"
                                        >
                                            <ChevronRight className="w-5 h-5" />
                                        </Button>
                                        
                                        <div className="flex items-center gap-2">
                                            {Array.from({ length: totalPages }, (_, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setCurrentPage(i)}
                                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                                        i === currentPage 
                                                            ? 'bg-imei-cyan text-white' 
                                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                                    }`}
                                                >
                                                    {i + 1}
                                                </button>
                                            ))}
                                        </div>
                                        
                                        <Button 
                                            onClick={nextPage}
                                            disabled={currentPage === totalPages - 1}
                                            className="bg-imei-cyan hover:bg-cyan-600 text-white flex items-center gap-2 p-3 rounded-full"
                                            variant="outline"
                                            size="icon"
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </Button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-16 bg-white rounded-2xl shadow-md">
                                <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                                <p className="font-bold text-lg text-gray-800">{t('no_rewards')}</p>
                                <p className="text-sm text-gray-600">{t('play_more_challenges')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </PageContainer>
    );
};

export default RewardsPage;
