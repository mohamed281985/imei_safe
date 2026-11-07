import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { APP_TOUR_STEPS } from '@/data/appTour';
import { completeAppTour, hasCompletedAppTour } from '@/services/appTourStorage';

interface AppTourProps {
  userId?: string | null;
  ready: boolean;
  blocked?: boolean;
  onTargetChange?: (target: string | null) => void;
}

interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PopoverPosition {
  top: number;
  left: number;
}

const VIEWPORT_GUTTER = 16;
const SPOTLIGHT_GUTTER = 8;

const AppTour: React.FC<AppTourProps> = ({ userId, ready, blocked = false, onTargetChange }) => {
  const { t, language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const checkedIdentity = useRef<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isRtl = language === 'ar';
  const currentStep = APP_TOUR_STEPS[stepIndex];
  const functionalStepCount = APP_TOUR_STEPS.length - 1;
  const isWelcome = Boolean(currentStep?.welcome);

  useEffect(() => {
    if (!ready || blocked) return;

    const identity = userId ? `user:${userId}` : 'device:guest';
    if (checkedIdentity.current === identity) return;
    checkedIdentity.current = identity;

    let active = true;
    void hasCompletedAppTour(userId).then((completed) => {
      if (active && !completed) {
        setStepIndex(0);
        setIsOpen(true);
      }
    });

    return () => {
      active = false;
    };
  }, [ready, blocked, userId]);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    let settleTimer: number | undefined;

    const measure = (scrollToTarget: boolean) => {
      const targetName = currentStep?.target;
      const target = targetName
        ? document.querySelector<HTMLElement>(`[data-tour="${targetName}"]`)
        : null;

      if (!target || !target.getClientRects().length) {
        setSpotlight(null);
        setPopoverPosition(null);
        if (popoverRef.current) {
          popoverRef.current.scrollTop = 0;
          popoverRef.current.style.maxHeight = '';
        }
        return;
      }

      if (scrollToTarget) {
        target.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      }

      window.requestAnimationFrame(() => {
        if (!active) return;
        const rect = target.getBoundingClientRect();
        const popover = popoverRef.current;
        if (popover) popover.scrollTop = 0;
        const naturalHeight = Math.min(popover?.scrollHeight || 300, window.innerHeight - VIEWPORT_GUTTER * 2);
        const spaceAbove = Math.max(0, rect.top - VIEWPORT_GUTTER * 2);
        const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - VIEWPORT_GUTTER * 2);
        const placeBelow = spaceBelow >= naturalHeight
          ? true
          : spaceAbove >= naturalHeight
            ? false
            : spaceBelow >= spaceAbove;
        const availableSpace = placeBelow ? spaceBelow : spaceAbove;
        const popoverHeight = Math.min(naturalHeight, Math.max(120, availableSpace));
        const nextSpotlight = {
          x: Math.max(4, rect.left - SPOTLIGHT_GUTTER),
          y: Math.max(4, rect.top - SPOTLIGHT_GUTTER),
          width: Math.min(window.innerWidth - 8, rect.width + SPOTLIGHT_GUTTER * 2),
          height: Math.min(window.innerHeight - 8, rect.height + SPOTLIGHT_GUTTER * 2),
        };
        setSpotlight(nextSpotlight);
        const popoverWidth = Math.min(380, window.innerWidth - VIEWPORT_GUTTER * 2);
        const top = placeBelow
          ? Math.min(window.innerHeight - popoverHeight - VIEWPORT_GUTTER, rect.bottom + VIEWPORT_GUTTER)
          : Math.max(VIEWPORT_GUTTER, rect.top - popoverHeight - VIEWPORT_GUTTER);
        const centeredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
        const left = Math.min(
          window.innerWidth - popoverWidth - VIEWPORT_GUTTER,
          Math.max(VIEWPORT_GUTTER, centeredLeft),
        );
        if (popover) {
          popover.style.maxHeight = `${popoverHeight}px`;
          popover.style.overflowY = 'hidden';
        }
        setPopoverPosition({ top, left });
      });
    };

    const initialMeasure = () => {
      measure(true);
      settleTimer = window.setTimeout(() => measure(false), 400);
    };

    initialMeasure();
    const handleViewportChange = () => measure(false);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('orientationchange', handleViewportChange);

    return () => {
      active = false;
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('orientationchange', handleViewportChange);
    };
  }, [isOpen, stepIndex, currentStep]);

  useEffect(() => {
    onTargetChange?.(isOpen ? currentStep?.target ?? null : null);
    return () => onTargetChange?.(null);
  }, [isOpen, currentStep, onTargetChange]);

  useEffect(() => {
    if (!isOpen) return;
    if (popoverRef.current) popoverRef.current.scrollTop = 0;
    const focusTimer = window.setTimeout(() => {
      popoverRef.current?.focus({ preventScroll: true });
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
        if (event.key === 'Tab') {
          event.preventDefault();
          popoverRef.current?.focus({ preventScroll: true });
        }
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        void finishTour();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, stepIndex, userId]);

  const finishTour = async () => {
    await completeAppTour(userId);
    setIsOpen(false);
    setSpotlight(null);
  };

  const goNext = () => {
    if (stepIndex === APP_TOUR_STEPS.length - 1) {
      void finishTour();
      return;
    }
    setStepIndex((current) => current + 1);
  };

  const goPrevious = () => setStepIndex((current) => Math.max(0, current - 1));

  if (!isOpen || !currentStep || typeof document === 'undefined') return null;

  const progress = isWelcome ? null : stepIndex;
  const positionStyle = popoverPosition
    ? { top: `${popoverPosition.top}px`, left: `${popoverPosition.left}px` }
    : undefined;

  return createPortal(
    <>
      <svg
        aria-hidden="true"
        className="pointer-events-auto fixed inset-0 z-[10000] h-full w-full"
        viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
        preserveAspectRatio="none"
      >
        <defs>
          <mask id="imei-app-tour-mask" x="0" y="0" width="100%" height="100%" maskUnits="userSpaceOnUse">
            <rect width={window.innerWidth} height={window.innerHeight} fill="white" />
            {spotlight && (
              <rect
                x={spotlight.x}
                y={spotlight.y}
                width={spotlight.width}
                height={spotlight.height}
                rx="14"
                fill="black"
              />
            )}
          </mask>
          <filter id="imei-app-tour-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect
          width={window.innerWidth}
          height={window.innerHeight}
          fill="rgba(10, 22, 43, 0.72)"
          mask="url(#imei-app-tour-mask)"
        />
        {spotlight && (
          <rect
            x={spotlight.x}
            y={spotlight.y}
            width={spotlight.width}
            height={spotlight.height}
            rx="14"
            fill="none"
            stroke="#36BCEB"
            strokeWidth="3"
            filter="url(#imei-app-tour-glow)"
          />
        )}
      </svg>

      <div
        className="fixed inset-0 z-[10001] bg-transparent"
        aria-hidden="true"
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
        onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
        onTouchMove={(event) => event.preventDefault()}
      />

      <section
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-tour-title"
        dir={isRtl ? 'rtl' : 'ltr'}
        style={positionStyle}
        tabIndex={-1}
        className={`fixed z-[10002] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[380px] overflow-hidden rounded-2xl border border-white/70 bg-white/90 p-5 text-[#172B55] shadow-[0_24px_80px_rgba(5,20,45,0.3)] backdrop-blur-xl max-[600px]:p-3.5 sm:p-6 ${positionStyle ? '' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'}`}
      >
        <div className="mb-4 flex items-center justify-between gap-4 max-[600px]:mb-2.5 max-[600px]:gap-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#F79432]" />
            <span className="text-xs font-bold tracking-normal text-[#53677d] max-[600px]:text-[10px]">{t('app_tour_label')}</span>
          </div>
          {progress !== null && (
            <span className="rounded-full bg-[#eaf7fc] px-3 py-1 text-xs font-bold text-[#176b91] max-[600px]:px-2 max-[600px]:py-0.5 max-[600px]:text-[10px]">
              {t('app_tour_progress', { current: progress, total: functionalStepCount })}
            </span>
          )}
          <button
            type="button"
            aria-label={t('app_tour_skip')}
            onClick={() => void finishTour()}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-[#172B55] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36BCEB] max-[600px]:size-7"
          >
            <X className="size-4" />
          </button>
        </div>

        {progress !== null && (
          <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-100 max-[600px]:mb-2.5" aria-hidden="true">
            <div className="h-full rounded-full bg-[#36BCEB] transition-all duration-300" style={{ width: `${(progress / functionalStepCount) * 100}%` }} />
          </div>
        )}

        <h2 id="app-tour-title" className="text-xl font-extrabold leading-8 text-[#172B55] max-[600px]:text-base max-[600px]:leading-6 sm:text-2xl">
          {t(currentStep.titleKey)}
        </h2>
        <p className="mt-2 text-sm leading-7 text-slate-600 max-[600px]:mt-1 max-[600px]:text-xs max-[600px]:leading-5 sm:text-base">
          {t(currentStep.descriptionKey)}
        </p>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200/80 pt-4 max-[600px]:mt-3 max-[600px]:gap-1.5 max-[600px]:pt-2.5">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={goPrevious}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-[#172B55] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36BCEB] max-[600px]:h-9 max-[600px]:px-2 max-[600px]:text-xs"
            >
              {isRtl ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />}
              {t('app_tour_previous')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void finishTour()}
              className="h-10 rounded-lg px-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-[#172B55] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36BCEB] max-[600px]:h-9 max-[600px]:px-2 max-[600px]:text-xs"
            >
              {t('app_tour_skip')}
            </button>
          )}

          <button
            type="button"
            data-tour-action
            onClick={goNext}
            className="inline-flex h-11 min-w-32 items-center justify-center gap-2 rounded-lg bg-[#172B55] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#213d73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36BCEB] focus-visible:ring-offset-2 max-[600px]:h-9 max-[600px]:min-w-24 max-[600px]:px-3 max-[600px]:text-xs"
          >
            {t(stepIndex === APP_TOUR_STEPS.length - 1 ? 'app_tour_finish' : isWelcome ? 'app_tour_start' : 'app_tour_next')}
            {isRtl ? <ArrowLeft className="size-4" /> : <ArrowRight className="size-4" />}
          </button>
        </div>
      </section>
    </>,
    document.body,
  );
};

export default AppTour;