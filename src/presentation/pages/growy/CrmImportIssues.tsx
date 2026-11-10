import { useTranslation } from 'react-i18next'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import type { ImportIssue } from './crmDataFormat'

export default function CrmImportIssues({ issues }: { issues: ImportIssue[] }) {
  const { t } = useTranslation('shell')
  return <div className="overflow-hidden rounded-xl border border-[#E6EAF1]">
    <div className="border-b border-[#E6EAF1] bg-[#FAFBFC] px-4 py-2.5 text-[13px] font-medium text-[#586174]">{t('crm.data.issues', { count: issues.length })}</div>
    <ul className="max-h-[320px] divide-y divide-[#EEF0F3] overflow-y-auto">
      {issues.map((issue, index) => {
        const error = issue.severity === 'error'
        const Icon = error ? CircleAlert : TriangleAlert
        return <li key={index} className="flex gap-3 px-4 py-3 text-[14px]">
          <Icon size={16} className={`mt-0.5 shrink-0 ${error ? 'text-[#C03437]' : 'text-[#946000]'}`} />
          <div className="min-w-0">
            <div className="text-[#17202E]"><span className="font-medium">{issue.row ? t('crm.data.row', { row: issue.row }) : t('crm.data.rowGeneral')}</span> · {issue.reason}</div>
            {issue.recommendation && <div className="mt-0.5 text-[13px] text-[#586174]">{issue.recommendation}</div>}
          </div>
        </li>
      })}
    </ul>
  </div>
}
