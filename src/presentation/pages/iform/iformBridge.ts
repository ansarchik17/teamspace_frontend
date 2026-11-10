export type IFormRequest={type:'iform:request';id:string;path:string;method:string;body?:unknown;form?:Array<[string,string|File]>;idempotencyKey?:string;expectedTenant?:string};
const allowed=/^\/(me|tenants|directory|processes|forms|requests|tasks|documents|files|materials|chat|proposals|notifications|audit-events|incidents|templates|calendars|connector-types|connections|approval-delegations|employee-chat|employee-chats|demo)(\/[A-Za-z0-9_-]+)*$/;
export function isIFormRequest(value:unknown):value is IFormRequest {
 if(!value||typeof value!=='object')return false;
 const v=value as IFormRequest;
 if(v.type!=='iform:request'||typeof v.id!=='string'||v.id.length>80||typeof v.path!=='string'||v.path.length>2048||!['GET','POST','PATCH','DELETE'].includes(v.method))return false;
 try {
  // Keep the original spelling: URL normalization must not legitimize traversal.
  const [path,query,...extra]=v.path.split('?');
  if(extra.length||!allowed.test(path)||path.includes('%'))return false;
  if(query!==undefined&&([...query].some(char=>char.charCodeAt(0)<=32)||/[#?]/.test(query)))return false;
  if(v.idempotencyKey!==undefined&&(typeof v.idempotencyKey!=='string'||v.idempotencyKey.length>200||/[\r\n]/.test(v.idempotencyKey)))return false;
  if(v.expectedTenant!==undefined&&(typeof v.expectedTenant!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v.expectedTenant)))return false;
  if(v.form!==undefined&&(!Array.isArray(v.form)||v.form.length>10||!v.form.every(row=>Array.isArray(row)&&row.length===2&&typeof row[0]==='string'&&(typeof row[1]==='string'||row[1] instanceof Blob))))return false;
  return true;
 }catch{return false;}
}
