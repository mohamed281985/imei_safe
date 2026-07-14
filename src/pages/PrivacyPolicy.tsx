import React from 'react';
import { useScrollToTop } from '../hooks/useScrollToTop';
import { useLanguage } from '../contexts/LanguageContext';
import PageContainer from '../components/PageContainer';

const PrivacyPolicy: React.FC = () => {
  useScrollToTop();
  const { t } = useLanguage();

  return (
    <PageContainer>
      <div className="px-4 py-6 max-w-5xl mx-auto">
        <div className="rounded-[36px] border border-imei-cyan/20 bg-gradient-to-r from-imei-cyan/20 via-blue-100 to-orange-100 p-8 shadow-2xl">
          <span className="inline-flex items-center rounded-full bg-imei-cyan/10 px-3 py-1 text-sm font-semibold text-imei-cyan">
            {t('legal_info')}
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            {t('privacy_policy')}
          </h1>
          <p className="mt-4 max-w-3xl text-slate-700 leading-8">
            {t('privacy_policy_intro')}
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-imei-cyan">{t('privacy_collection_title')}</h2>
                <p className="mt-2 text-slate-600 leading-7">{t('privacy_collection_desc')}</p>
              </div>
              <span className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-600">
                {t('privacy_collection_title')}
              </span>
            </div>
            <ul className="list-disc space-y-3 pl-5 text-slate-700">
              <li>{t('privacy_collection_item_account')}</li>
              <li>{t('privacy_collection_item_device')}</li>
              <li>{t('privacy_collection_item_ads')}</li>
              <li>{t('privacy_collection_item_payments')}</li>
              <li>{t('privacy_collection_item_support')}</li>
            </ul>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-imei-cyan">{t('privacy_usage_title')}</h2>
              <p className="mt-2 text-slate-600 leading-7">{t('privacy_usage_desc')}</p>
            </div>
            <ul className="list-disc space-y-3 pl-5 text-slate-700">
              <li>{t('privacy_usage_item_personalize')}</li>
              <li>{t('privacy_usage_item_service')}</li>
              <li>{t('privacy_usage_item_communication')}</li>
              <li>{t('privacy_usage_item_improvement')}</li>
            </ul>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('privacy_responsibility_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_responsibility_desc_1')}</p>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_responsibility_desc_2')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('privacy_security_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_security_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('privacy_data_protection_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_data_protection_desc')}</p>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_encryption_desc')}</p>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_https_desc')}</p>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_security_measures_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('privacy_sharing_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_sharing_desc_1')}</p>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_sharing_desc_2')}</p>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_sharing_policy_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('privacy_updates_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_updates_desc_1')}</p>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_updates_desc_2')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('privacy_deletion_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_deletion_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('privacy_user_rights_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_user_rights_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('privacy_contact')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('privacy_contact')}</p>
          </section>
        </div>
      </div>
    </PageContainer>
  );
};

export default PrivacyPolicy;
