import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { meetingActionsApi, type TaskMeetingSource } from '../../../infrastructure/meet/meetingActionsApi'
import { meetingSourceURL } from '../../pages/meet/meetingActionsUtils'
import { formatOffset } from '../../pages/meet/meetTranscript'

export default function TaskMeetingSources({ taskId }: { taskId: string }) {
  const { t } = useTranslation('shell')
  const [result, setResult] = useState<{ taskId: string; sources: TaskMeetingSource[] }>({ taskId: '', sources: [] })
  const sources = result.taskId === taskId ? result.sources : []
  useEffect(() => {
    const controller = new AbortController()
    void meetingActionsApi.capabilities(controller.signal).then(async capability => {
      if (!capability.enabled || controller.signal.aborted) return
      const next = await meetingActionsApi.sources(taskId, controller.signal)
      if (!controller.signal.aborted) setResult({ taskId, sources: next })
    }).catch(() => { /* Source availability must not prevent ordinary task editing. */ })
    return () => controller.abort()
  }, [taskId])
  if (!sources.length) return null
  return <section className="mt-5 rounded-xl border border-[#E4E9F2] bg-[#F8FAFF] p-4">
    <h3 className="text-sm font-semibold">{t('meet.taskActions.sourceHeading')}</h3>
    {sources.map(source => <div key={source.proposal_id} className="mt-3 text-sm">
      <Link className="font-medium text-[#2458D3]" to={meetingSourceURL(source.meeting_id, source.evidence[0]?.start_ms, source.evidence[0]?.segment_id)}>{source.title || t('meet.meeting')}</Link>
      {source.evidence.slice(0, 3).map((evidence, index) => <blockquote key={index} className="mt-2 border-l-2 border-[#CCD9F3] pl-3 text-xs leading-5 text-[#586174]">
        <Link className="text-[#2458D3]" to={meetingSourceURL(source.meeting_id, evidence.start_ms, evidence.segment_id)}>{formatOffset(evidence.start_ms)} · {evidence.speaker}</Link>
        <p className="whitespace-pre-wrap">{evidence.quote}</p>
      </blockquote>)}
    </div>)}
  </section>
}
