import React from 'react';

interface LostPhoneCardProps {
  imei: string;
  phoneType: string;
  reportDate?: string;
  location?: string;
}

// عرض رقم IMEI كما هو (غير مشفَّر)

const LostPhoneCard: React.FC<LostPhoneCardProps> = ({ imei, phoneType, reportDate, location }) => {
  const normalizeDigitsOnly = (s: any) => {
    if (s === null || s === undefined) return '';
    try { return String(s).replace(/\D/g, ''); } catch (e) { return ''; }
  };

  const renderImei = (raw: any) => {
    if (!raw) return 'Unknown IMEI';

    // If the value is an object (e.g. { encryptedData, iv, authTag }) or a stringified JSON, treat as encrypted
    if (typeof raw === 'object') return '***************';
    const s = String(raw).trim();
    if (s.startsWith('{') || s.includes('encryptedData')) return '***************';

    // If it contains digits only, show first 6 then stars (15 total)
    const digits = normalizeDigitsOnly(s);
    if (digits && digits.length >= 6) {
      const shown = digits.slice(0, 6);
      const stars = '*'.repeat(Math.max(0, 15 - shown.length));
      return shown + stars;
    }

    // Fallback: mask entirely
    return '***************';
  };
  return (
    <div className="flex items-center justify-between w-full mt-2 mb-10 p-2 border rounded-lg shadow-sm" style={{ borderColor: "rgba(0, 0, 0, 0.1)", backgroundColor: "rgba(255, 255, 255, 0.8)" }}>
      <div className="flex items-center">
        <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow-md animate-pulse ml-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-black tracking-wider" >
          {phoneType || 'Unknown Phone'}
        </h3>
      </div>

      <div className="text-sm text-black font-bold tracking-[0.2em] transform hover:scale-105 transition-all duration-300" style={{ textShadow: "0 0 5px rgba(255, 255, 255, 0.3)", direction: "ltr" }}>
        {renderImei(imei)}
      </div>
    </div>
  );
};

export default LostPhoneCard;
