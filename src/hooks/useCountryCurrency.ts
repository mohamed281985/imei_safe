import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';

export const useCountryCurrency = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const defaultCurrency = language === 'ar' ? 'ج.م' : 'EGP';
  const [currencySymbol, setCurrencySymbol] = useState(defaultCurrency);

  useEffect(() => {
    let active = true;
    setCurrencySymbol(defaultCurrency);

    const loadCurrency = async () => {
      if (!user?.id) return;

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('countries')
        .eq('id', user.id)
        .maybeSingle();
      if (userError || !userData?.countries) return;

      const countryName = String(userData.countries).trim();
      const { data: arabicCountry } = await supabase
        .from('countries')
        .select('currency_symbol')
        .ilike('name_ar', countryName)
        .maybeSingle();
      if (arabicCountry?.currency_symbol) {
        if (active) setCurrencySymbol(arabicCountry.currency_symbol);
        return;
      }

      const { data: englishCountry } = await supabase
        .from('countries')
        .select('currency_symbol')
        .ilike('name_en', countryName)
        .maybeSingle();
      if (active && englishCountry?.currency_symbol) setCurrencySymbol(englishCountry.currency_symbol);
    };

    void loadCurrency();
    return () => { active = false; };
  }, [defaultCurrency, user?.id]);

  return { currencySymbol };
};