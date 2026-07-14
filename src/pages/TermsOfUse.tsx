import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import PageContainer from '../components/PageContainer';

const TermsOfUse: React.FC = () => {
  const { t } = useLanguage();

  return (
    <PageContainer>
      <div className="px-4 py-6 max-w-5xl mx-auto">
        <div className="rounded-[36px] border border-imei-cyan/20 bg-gradient-to-r from-imei-cyan/20 via-blue-100 to-orange-100 p-8 shadow-2xl">
          <span className="inline-flex items-center rounded-full bg-imei-cyan/10 px-3 py-1 text-sm font-semibold text-imei-cyan">
            {t('legal_info')}
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            {t('terms_of_use')}
          </h1>
          <p className="mt-4 max-w-3xl text-slate-700 leading-8">
            {t('terms_of_use_intro')}
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_acceptance_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_acceptance_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_disclaimer_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_disclaimer_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_user_responsibility_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_user_responsibility_desc_1')}</p>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_user_responsibility_desc_2')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_false_reports_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_false_reports_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_warranty_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_warranty_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_liability_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_liability_desc_1')}</p>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_liability_desc_2')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_buy_sell_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_buy_sell_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_limits_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_limits_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_ip_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_ip_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_misuse_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_misuse_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_governing_law_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_governing_law_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_allowed_use_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_allowed_use_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_changes_title')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_changes_desc')}</p>
          </section>

          <section className="rounded-3xl border border-imei-cyan/10 bg-white/95 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-imei-cyan">{t('terms_contact')}</h2>
            <p className="mt-3 text-slate-700 leading-7">{t('terms_contact')}</p>
          </section>
        </div>
      </div>
    </PageContainer>
  );
};

export default TermsOfUse;
