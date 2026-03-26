import React, { createContext, useState, useContext, ReactNode } from 'react';

interface Advertisement {
  id: string;
  image_url: string;
  website_url?: string;
}

interface AdModalContextType {
  adToShow: Advertisement | null;
  showAd: (ad: Advertisement) => void;
  hideAd: () => void;
}

const AdModalContext = createContext<AdModalContextType | undefined>(undefined);

export const AdModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [adToShow, setAdToShow] = useState<Advertisement | null>(null);

  const showAd = (ad: Advertisement) => setAdToShow(ad);
  const hideAd = () => setAdToShow(null);

  return (
    <AdModalContext.Provider value={{ adToShow, showAd, hideAd }}>
      {children}
    </AdModalContext.Provider>
  );
};

export const useAdModal = () => {
  const context = useContext(AdModalContext);
  if (context === undefined) throw new Error('useAdModal must be used within an AdModalProvider');
  return context;
};