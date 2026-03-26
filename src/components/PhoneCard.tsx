
import React from 'react';
import { Link } from 'react-router-dom';
import { PhoneReport } from '../services/mockData';
import { useLanguage } from '../contexts/LanguageContext';
import { Smartphone, MapPin, Calendar } from 'lucide-react';

interface PhoneCardProps {
  phone: PhoneReport;
}

const PhoneCard: React.FC<PhoneCardProps> = ({ phone }) => {
  const { t, language } = useLanguage();
  
  // Format date based on selected language
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    return date.toLocaleDateString(
      language === 'ar' ? 'ar-SA' : 
      language === 'fr' ? 'fr-FR' : 
      language === 'hi' ? 'hi-IN' : 'en-US', 
      options
    );
  };
  
  return (
    <Link to={`/phone/${phone.id}`} className="block no-underline">
      <div className="card-container hover:border-imei-cyan hover:border-opacity-40 transition-all duration-300">
        <div className="flex items-center mb-3">
          {phone.phoneImage ? (
            <div className="w-16 h-16 rounded-md overflow-hidden mr-3">
              <img 
                src={phone.phoneImage} 
                alt="Phone" 
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-md glass-bg flex items-center justify-center mr-3">
              <Smartphone className="text-imei-cyan" size={32} />
            </div>
          )}
          
          <div>
            <h3 className="text-white text-lg font-medium">{phone.ownerName}</h3>
            <p className="text-imei-cyan">
              IMEI: <span className="font-mono">{phone.imei}</span>
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 gap-2 text-sm">
          <div className="flex items-center text-gray-300">
            <MapPin size={16} className="mr-2 text-imei-cyan" />
            <span>{phone.lossLocation}</span>
          </div>
          
          <div className="flex items-center text-gray-300">
            <Calendar size={16} className="mr-2 text-imei-cyan" />
            <span>{formatDate(phone.lossTime)}</span>
          </div>
        </div>
        
        <div className="mt-3 flex justify-end">
          <div className={`text-xs font-semibold px-2 py-1 rounded-full ${
            phone.status === 'active' ? 'bg-green-900 text-green-200' : 
            phone.status === 'resolved' ? 'bg-blue-900 text-blue-200' : 
            'bg-yellow-900 text-yellow-200'
          }`}>
            {phone.status === 'active' ? t('active') : 
             phone.status === 'resolved' ? t('resolved') : 
             t('pending')}
          </div>
        </div>
      </div>
    </Link>
  );
};

export default PhoneCard;
