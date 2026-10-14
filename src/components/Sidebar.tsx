import React from 'react';
import { Link } from 'react-router-dom';
import { Search, RefreshCw, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Sidebar: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      <Link to="/imei-check" className="flex items-center gap-3 text-white hover:text-imei-cyan transition-colors">
        <Search className="w-5 h-5" />
        <span>{t('imei_check') || 'فحص IMEI'}</span>
      </Link>
      <Link to="/ownership-transfer" className="flex items-center gap-3 text-white hover:text-imei-cyan transition-colors">
        <RefreshCw className="w-5 h-5" />
        <span>{t('ownership_transfer') || 'نقل الملكية'}</span>
      </Link>
      <Link to="/transfer-history" className="flex items-center gap-3 text-white hover:text-imei-cyan transition-colors">
        <History className="w-5 h-5" />
        <span>{t('transfer_history') || 'سجل النقل'}</span>
      </Link>
      <Link to="/blacklist" className="flex items-center gap-3 text-white hover:text-imei-cyan transition-colors">
        {/* Add the rest of the Link component */}
      </Link>
    </div>
  );
};

export default Sidebar; 