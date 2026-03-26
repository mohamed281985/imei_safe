import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

/**
 * AuthBusinessGuard: يمنع المستخدم التجاري من تصفح أي صفحة إذا لم يكمل بياناته التجارية (رفع الصور)
 * استخدم هذا المكون في أعلى صفحات التطبيق أو في App.tsx حول جميع Routes
 * مثال:
 * <AuthBusinessGuard><AppRoutes /></AuthBusinessGuard>
 */
export default function AuthBusinessGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.user_metadata?.role === 'business') {
        const { data: profile } = await supabase
          .from('business_profiles')
          .select('store_image_url, license_image_url')
          .eq('id', user.id)
          .single();
        if (!profile || !profile.store_image_url || !profile.license_image_url) {
          toast({
            title: 'يجب إكمال بياناتك التجارية',
            description: 'يرجى تفعيل بريدك الإلكتروني ثم العودة لإكمال بياناتك التجارية ورفع الصور المطلوبة.',
            duration: 9000,
            variant: 'destructive',
          });
          navigate('/business-profile-complete', { replace: true });
        }
      }
    })();
  }, [navigate, toast]);

  return <>{children}</>;
}
