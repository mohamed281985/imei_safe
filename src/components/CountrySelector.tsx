import React, { useState, useRef, useEffect } from 'react';
import { countries } from '@/data/countries';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChevronDown, Search } from 'lucide-react';

interface Country {
  code: string;
  name: string;
  short: string;
  flag: string;
}

interface Props {
  value: string; // اسم الدولة المختار
  onChange: (countryName: string) => void;
  disabled?: boolean;
}

const CountrySelector: React.FC<Props> = ({ value, onChange, disabled }) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // تصفية الدول بناءً على البحث
  const filteredCountries = (countries as Country[]).filter(
    (country) =>
      country.name.toLowerCase().includes(search.toLowerCase()) ||
      country.code.includes(search)
  );

  // إغلاق القائمة عند الضغط خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // جلب بيانات الدولة المختارة
  const selectedCountry = (countries as Country[]).find(c => c.name === value);

  return (
    <div ref={containerRef} className="relative w-full max-w-[280px]">
      <button
        type="button"
        className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border-2 border-imei-cyan/30 bg-imei-darker/60 text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-imei-cyan transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-imei-darker/80'}`}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
      >
        <span className="flex items-center gap-3">
          <span className="text-xl">{selectedCountry?.flag || '🌍'}</span>
          <span className="text-sm font-bold">{selectedCountry?.name || (t('select_country') || 'اختر البلد')}</span>
        </span>
        <ChevronDown className={`w-5 h-5 text-imei-cyan transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      
      {open && (
        <div className="absolute z-[110] mt-2 w-full bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-72 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="p-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              className="flex-1 bg-transparent text-gray-800 focus:outline-none text-sm py-1"
              placeholder={t('search_country_or_code') || 'بحث عن دولة...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <ul className="overflow-y-auto flex-1 py-1">
            {filteredCountries.length === 0 ? (
              <li className="px-4 py-3 text-gray-400 text-center text-sm">{t('no_results')}</li>
            ) : (
              filteredCountries.map(country => (
                <li
                  key={country.code}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-imei-cyan/10 transition-colors ${country.name === value ? 'bg-imei-cyan/20 text-blue-900 font-bold' : 'text-gray-700'}`}
                  onClick={() => {
                    onChange(country.name);
                    setOpen(false);
                  }}
                >
                  <span className="text-xl">{country.flag}</span>
                  <span className="text-sm">{country.name}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CountrySelector;