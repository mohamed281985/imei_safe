import { createClient } from '@supabase/supabase-js'

// استبدل هذه القيم بالقيم الخاصة بمشروع Supabase الخاص بك
const supabaseUrl = 'https://idpnvgvamdedaynetjvm.supabase.co' // ضع هنا عنوان URL الصحيح
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcG52Z3ZhbWRlZGF5bmV0anZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NDQyNzMsImV4cCI6MjA2MjMyMDI3M30.MkMaSgmXUDPD1875MoW3h-SPXPBKFvPGSqlW3gWHddY' // ضع هنا مفتاح anon الصحيح

// إعدادات الأمان المحسنة
const supabaseOptions = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // تقصير مدة صلاحية الجلسة لزيادة الأمان
    storage: window.localStorage,
    flowType: 'pkce' as const, // استخدام PKCE لزيادة الأمان في عمليات المصادقة
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'X-Client-Info': 'imei-safe-web'
    }
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, supabaseOptions)