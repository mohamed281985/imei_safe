// CountryCodeSelector.tsx
// مكون اختيار كود الدولة (مثال بسيط)
import React, { useState, useRef, useEffect } from 'react';
import { countries } from '@/data/countries';
import { useLanguage } from '@/contexts/LanguageContext';


interface Country {
  code: string;
  name: string;
  short: string;
  flag: string;
}

interface Props {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}

const CountryCodeSelector: React.FC<Props> = ({ value, onChange, disabled }) => {
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

  // جلب اسم الدولة المختارة
  const selectedCountry = (countries as Country[]).find(c => c.code === value);

  return (
    <div ref={containerRef} className="relative min-w-[100px] max-w-[180px]">
      <button
        type="button"
        className={`flex items-center justify-between w-full px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-800 shadow focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50'}`}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        tabIndex={0}
        style={{ direction: 'rtl' }}
      >
        <span className="flex items-center gap-2">
          <span className="text-base">{selectedCountry?.flag}</span>
          <span className="text-xs font-semibold">{selectedCountry?.name} <span className="text-gray-500">{selectedCountry?.code}</span></span>
        </span>
        <svg className={`w-3 h-3 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto animate-fade-in">
          <input
            type="text"
            className="w-full rounded-t-lg px-2 py-1.5 bg-gray-50 text-gray-800 border-b border-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-xs mb-0.5"
            placeholder={t('search_country_or_code')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={disabled}
            autoFocus
            style={{ direction: 'rtl' }}
          />
          <ul className="max-h-48 overflow-y-auto">
            {filteredCountries.length === 0 ? (
              <li className="px-3 py-2 text-gray-400 text-center select-none">{t('no_results')}</li>
            ) : (
              filteredCountries.map(country => (
                <li
                  key={country.code}
                  className={`flex items-center gap-1 px-3 py-2 cursor-pointer hover:bg-cyan-50 transition-colors rounded-lg ${country.code === value ? 'bg-cyan-100 text-cyan-700 font-semibold' : 'text-gray-800'}`}
                  onClick={() => {
                    onChange(country.code);
                    setOpen(false);
                  }}
                  tabIndex={0}
                  style={{ direction: 'rtl' }}
                >
                  <span className="text-base">{country.flag}</span>
                  <span className="text-xs">{country.name} <span className="text-gray-500">{country.code}</span></span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CountryCodeSelector;
