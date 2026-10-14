import React from 'react';
import { Link } from 'react-router-dom';
import PageContainer from '../components/PageContainer';
import Logo from '../components/Logo';
import { useLanguage } from '../contexts/LanguageContext';
import { Home } from 'lucide-react';

const NotFound: React.FC = () => {
  const { t } = useLanguage();
  
  return (
    <PageContainer>
      <div className="flex flex-col items-center justify-center h-full min-h-screen">
        <Logo size="lg" />
        
        <div className="mt-8 text-center">
          <h2 className="text-white text-6xl font-bold mb-2">404</h2>
          <p className="text-gray-300 mb-6">{t('page_not_found')}</p>
          
          <div className="flex justify-center">
            <Link to="/" className="glowing-button inline-flex items-center">
              <Home size={18} className="mr-2" /> {t('go_home')}
            </Link>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default NotFound;
