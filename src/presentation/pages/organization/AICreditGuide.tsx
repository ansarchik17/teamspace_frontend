import { useTranslation } from 'react-i18next'

/** Guidance from synthetic GPT-OSS-120B benchmarks; never used to authorize or bill calls. */
export function AICreditGuide() {
  const { t } = useTranslation('ai')

  return (
    <details className="group rounded-2xl border border-[#E6EAF1] bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-3.5 transition-colors hover:bg-[#FAFBFC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-action)] [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#EDF2FF] text-[#2458D3]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1 text-[15px] font-semibold leading-5 text-[#17202E]">{t('creditGuide.title')}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#586174" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 transition-transform duration-200 group-open:rotate-180">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <div className="flex flex-col gap-2 border-t border-[#EEF0F3] px-5 py-4">
        <div className="flex gap-2.5 rounded-xl border border-[#D6E2FF] bg-[#F5F8FF] px-4 py-3 text-[13px] leading-5 text-[#1F3F8F]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <p className="m-0">{t('creditGuide.chooseLimit')}</p>
        </div>
        <p className="m-0 px-1 text-[12px] leading-5 text-[#586174]">{t('creditGuide.variability')}</p>
      </div>
    </details>
  )
}
