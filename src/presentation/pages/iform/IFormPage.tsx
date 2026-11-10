import {useEffect,useRef,useState} from 'react'
import {authorizedFetch} from '../../../infrastructure/http/authorizedFetch'
import {LocalStorageAuthSessionStore} from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import {isIFormRequest} from './iformBridge'
import {CompanyAdministrationSkeleton} from '../../components/people/PeopleSkeletons'

const store=new LocalStorageAuthSessionStore()

export default function IFormPage(){
 const frame=useRef<HTMLIFrameElement>(null)
 const fallback=useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
 const [error,setError]=useState('')
 const [ready,setReady]=useState(false)
 const [appReady,setAppReady]=useState(false)
 useEffect(()=>{
  const controllers=new Map<string,AbortController>()
  let disposed=false
  const showApp=()=>{if(!disposed){if(fallback.current)clearTimeout(fallback.current);setAppReady(true)}}
  const receive=async(event:MessageEvent)=>{
   const child=frame.current?.contentWindow
   if(disposed||!child||event.source!==child||event.origin!==location.origin)return
   if(event.data?.type==='iform:cancel'){controllers.get(event.data.id)?.abort();return}
   if(!isIFormRequest(event.data)||controllers.has(event.data.id))return
   const message=event.data
   const controller=new AbortController();controllers.set(message.id,controller)
   try{
    let body:BodyInit|undefined
    const headers:Record<string,string>={}
    if(message.form){const form=new FormData();for(const [name,value] of message.form)form.append(name,value);body=form}
    else if(message.body!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(message.body)}
    if(message.idempotencyKey)headers['Idempotency-Key']=message.idempotencyKey
    if(message.expectedTenant)headers['X-IForm-Expected-Tenant']=message.expectedTenant
    const response=await authorizedFetch(store,'/api/v1/iform/api'+message.path,{method:message.method,headers,body,signal:controller.signal},{returnErrorResponse:true})
    if(response.status===403){
     const failure=await response.clone().json().catch(()=>({}))
     if(['iform_access_denied','WORKSPACE_ACCESS_DENIED'].includes(failure.code)){setReady(false);setError(failure.message||'Доступ к iForm отозван')}
    }
    const payload=await response.arrayBuffer()
    if(!disposed&&!controller.signal.aborted)child.postMessage({type:'iform:response',id:message.id,status:response.status,headers:{'Content-Type':response.headers.get('Content-Type')||'application/json','X-IForm-Tenant':response.headers.get('X-IForm-Tenant')||''},body:payload},location.origin,[payload])
   }catch(e){if(!disposed&&!controller.signal.aborted)child.postMessage({type:'iform:response',id:message.id,error:e instanceof Error?e.message:'Не удалось выполнить запрос iForm'},location.origin)}
   finally{controllers.delete(message.id);if(!controller.signal.aborted && controllers.size===0)showApp()}
  }
  window.addEventListener('message',receive)
  // Validate the current company before loading the application and private UI.
  const boot=new AbortController()
  void authorizedFetch(store,'/api/v1/iform/api/me',{signal:boot.signal}).then(()=>{if(!disposed)setReady(true)}).catch(e=>{if(!disposed)setError(e instanceof Error?e.message:'iForm недоступен')})
  return()=>{disposed=true;boot.abort();if(fallback.current)clearTimeout(fallback.current);window.removeEventListener('message',receive);controllers.forEach(c=>c.abort())}
 },[])
 if(error)return <main className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 text-center"><h1 className="text-lg font-semibold">Не удалось открыть iForm</h1><p className="max-w-xl text-sm text-slate-600">{error}</p><button className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={()=>location.reload()}>Повторить</button></main>
 return <div className="relative flex min-h-0 w-full flex-1 flex-col">
  {!appReady && <div className="absolute inset-0 z-10 overflow-auto bg-[#F6F7F9] px-4 py-6 md:px-6 xl:px-8"><CompanyAdministrationSkeleton label="Подключаем формы и процессы вашей компании…" /></div>}
  {ready && <iframe ref={frame} src="/iform-app/" title="iForm — формы и процессы компании" className="min-h-0 w-full flex-1 border-0" style={{height:'100%'}} onLoad={()=>{if(!appReady)fallback.current=setTimeout(()=>setAppReady(true),15000)}} />}
 </div>
}
