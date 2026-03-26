import React, { useState } from 'react';
import PageContainer from '../components/PageContainer';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Info, Share2, MapPin, Globe, List, Target, Users, TrendingUp, CheckCircle2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

const CreateAdvertisement: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  return (
    <PageContainer>
      <div className="container mx-auto px-4 py-8 glass-bg" style={{ background: 'rgba(255, 255, 255, 0.18)' }}>
        <div className="flex justify-between items-center mb-8 mt-[50px]">
          <h1 className="text-2xl font-bold text-center" style={{ color: '#000000' }}>
            {t('create_advertisement')}
          </h1>
          <Button onClick={() => navigate('/myads')} variant="outline" className="flex items-center gap-2 border-imei-cyan text-imei-cyan hover:bg-imei-cyan/10">
            <List className="w-4 h-4" />
            {t('my_ads')}
          </Button>
        </div>

        <div className="flex justify-center">
          {/* Location-Based Ad Box */}
          <div className="bg-white rounded-2xl p-6 border border-imei-cyan/30 hover:border-imei-cyan/40 transition-all duration-300 mt-[50px] shadow-lg hover:shadow-xl w-full max-w-md" style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
            <div className="flex items-center justify-center mb-4">
              <MapPin className="w-10 h-10 text-imei-button-gradient-from/100" />
            </div>
            <h2 className="text-2xl font-bold mb-4 text-center text-imei-button-gradient-from/100">
              {t('website_commercial_ad')}
            </h2>
            <p className="text-gray-700 font-medium mb-8 text-center">
              {t('website_ad_description')}
            </p>

            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button onClick={() => setIsDetailsModalOpen(true)} variant="outline" className="flex items-center border-imei-cyan text-imei-cyan hover:bg-imei-cyan hover:text-white transition-colors duration-300 w-full sm:w-auto justify-center">
                <Info className="mr-2 h-4 w-4" />
                {t('details')}
              </Button>
              <Button
                onClick={() => navigate('/publish-ad')}
                className="flex items-center bg-gradient-to-r from-imei-cyan to-blue-600 text-white hover:from-imei-cyan/90 hover:to-blue-700 transition-colors duration-300 w-full sm:w-auto justify-center"
                style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)' }}
              >
                <Share2 className="mr-2 h-4 w-4" />
                {t('create_advertisement')}
              </Button>
            </div>
          </div>

        </div>
      </div>

      {/* Location Ad Details Modal */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="bg-imei-cyan/30 text-gray-800 w-[95%] max-w-2xl max-h-[90vh] border-2 border-imei-cyan/30 shadow-2xl rounded-2xl p-0 rtl mb-30 overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.9)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)', border: '1px solid rgba(0, 59, 70, 0.1)' }}>
          <DialogHeader className="p-6 pt-10 border-b border-imei-cyan/30 bg-gradient-to-r from-imei-cyan/10 to-blue-100/50 backdrop-blur-md" style={{ background: 'rgba(255, 255, 255, 0.95)', borderBottom: '1px solid rgba(0, 59, 70, 0.1)' }}>
            <DialogTitle className="flex items-center gap-3 text-2xl font-bold text-imei-cyan/70">
              <Info className="w-8 h-8" />
              {t('location_ad_details')}
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 h-[calc(90vh-200px)] overflow-y-auto space-y-6">
            {/* Main Features */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Feature 1: Targeting */}
              <div className="bg-white p-5 rounded-xl border border-imei-cyan/30 hover:border-imei-cyan/40 transition-all duration-300 hover:shadow-lg hover:shadow-imei-cyan/10 transform hover:-translate-y-1 backdrop-blur-sm" style={{ background: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(0, 59, 70, 0.1)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <Target className="w-8 h-8 text-imei-cyan flex-shrink-0" />
                  <h3 className="text-xl font-bold text-gray-800">{t('precise_customer_targeting')}</h3>
                </div>
                <p className="text-gray-600 leading-relaxed mb-3">
                  {t('precise_targeting_description')}
                </p>
                <div className="text-xs text-black mt-2 flex items-center gap-1 bg-imei-cyan/10 p-2 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-ime-cyan font-medium">{t('accuracy_50_meters')}</span>
                </div>
              </div>

              {/* Feature 2: Engagement */}
              <div className="bg-white p-5 rounded-xl border border-imei-cyan/30 hover:border-imei-cyan/40 transition-all duration-300 hover:shadow-lg hover:shadow-imei-cyan/10 transform hover:-translate-y-1 backdrop-blur-sm" style={{ background: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(0, 59, 70, 0.1)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <Users className="w-8 h-8 text-black flex-shrink-0" />
                  <h3 className="text-xl font-bold text-gray-800">{t('increase_customer_engagement')}</h3>
                </div>
                <p className="text-gray-600 leading-relaxed mb-3">
                  {t('engagement_increase_description')}
                </p>
                <div className="text-xs text-black mt-2 flex items-center gap-1 bg-imei-cyan/10 p-2 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-ime-cyan font-medium">{t('engagement_70_percent')}</span>
                </div>
              </div>

              {/* Feature 3: Results */}
              <div className="bg-white p-5 rounded-xl border border-imei-cyan/30 hover:border-imei-cyan/40 transition-all duration-300 hover:shadow-lg hover:shadow-imei-cyan/10 transform hover:-translate-y-1 col-span-1 md:col-span-2 backdrop-blur-sm" style={{ background: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(0, 59, 70, 0.1)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <TrendingUp className="w-8 h-8 text-black flex-shrink-0" />
                  <h3 className="text-xl font-bold text-gray-800">{t('guaranteed_results')}</h3>
                </div>
                <p className="text-gray-600 leading-relaxed mb-3">
                  {t('guaranteed_results_description')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="text-xs text-black flex items-center gap-1 bg-imei-cyan/10 p-3 rounded-lg backdrop-blur-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-ime-cyan font-medium">{t('achieve_90_percent_goals')}</span>
                  </div>
                  <div className="text-xs text-black flex items-center gap-1 bg-imei-cyan/10 p-3 rounded-lg backdrop-blur-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-ime-cyan font-medium">{t('save_40_percent_cost')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Box */}
            <div className="bg-white p-6 rounded-xl border border-imei-cyan/30 mt-6 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 backdrop-blur-sm" style={{ background: 'rgba(255, 255, 255, 0.95)', border: '1px solid rgba(0, 59, 70, 0.1)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-gradient-to-r from-imei-cyan to-blue-500"><CheckCircle2 className="w-6 h-6 text-white" /></div>
                <h3 className="text-xl font-bold text-gray-800">{t('why_choose_location_ad')}</h3>
              </div>
              <ul className="space-y-3 text-gray-700 pr-2">
                <li className="flex items-start gap-3 p-3 rounded-lg hover:bg-imei-cyan/5 transition-colors duration-200" style={{ border: '1px solid rgba(0, 59, 70, 0.05)' }}>
                  <CheckCircle2 className="w-5 h-5 text-imei-cyan mt-0.5 flex-shrink-0" />
                  <span className="text-base">{t('direct_reach_to_customers')}</span>
                </li>
                <li className="flex items-start gap-3 p-3 rounded-lg hover:bg-imei-cyan/5 transition-colors duration-200" style={{ border: '1px solid rgba(0, 59, 70, 0.05)' }}>
                  <CheckCircle2 className="w-5 h-5 text-imei-cyan mt-0.5 flex-shrink-0" />
                  <span className="text-base">{t('build_local_brand_awareness')}</span>
                </li>
                <li className="flex items-start gap-3 p-3 rounded-lg hover:bg-imei-cyan/5 transition-colors duration-200" style={{ border: '1px solid rgba(0, 59, 70, 0.05)' }}>
                  <CheckCircle2 className="w-5 h-5 text-imei-cyan mt-0.5 flex-shrink-0" />
                  <span className="text-base">{t('lower_cost_better_results')}</span>
                </li>
                <li className="flex items-start gap-3 p-3 rounded-lg hover:bg-imei-cyan/5 transition-colors duration-200" style={{ border: '1px solid rgba(0, 59, 70, 0.05)' }}>
                  <CheckCircle2 className="w-5 h-5 text-imei-cyan mt-0.5 flex-shrink-0" />
                  <span className="text-base">{t('high_flexibility_budget')}</span>
                </li>
              </ul>
              <div className="mt-4 pt-3 border-t border-imei-cyan/20 text-xs text-black flex items-center gap-2 justify-end">
                <TrendingUp className="w-4 h-4" />
                <span className="text-ime-cyan font-medium">{t('success_rate_85_percent')}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 bg-gradient-to-r from-imei-cyan/10 to-blue-100/50 border-t border-imei-cyan/30 flex flex-col sm:flex-row justify-end gap-3 backdrop-blur-md" style={{ background: 'rgba(255, 255, 255, 0.95)', borderTop: '1px solid rgba(0, 59, 70, 0.1)' }}>
            <Button onClick={() => setIsDetailsModalOpen(false)} variant="outline" className="border-amber-700 text-gray-700 hover:bg-amber-700 hover:text-white transition-colors shadow-md hover:shadow-amber-700/20 bg-imei-cyan" style={{ borderColor: 'rgba(180, 83, 9, 0.3)' }}>
              <X className="ml-2 w-4 h-4" />
              {t('close')}
            </Button>
            <Button onClick={() => { setIsDetailsModalOpen(false); navigate('/publish-ad'); }} className="bg-gradient-to-r from-imei-cyan to-blue-600 text-white hover:from-imei-cyan/90 hover:to-blue-700 transition-colors shadow-md hover:shadow-imei-cyan/20" style={{ background: 'linear-gradient(135deg, #003b46 0%, #008080 100%)' }}>
              <Share2 className="ml-2 w-4 h-4" />
              {t('create_ad_now')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
};

export default CreateAdvertisement;