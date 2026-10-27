import {readPrivateJson,writePrivateJson} from '../../SynCare-be/src/security/private-files.cjs'
import {existsSync} from 'node:fs';
import {expect,type Page} from '@playwright/test';
import {mutationHeaders} from './local-accounts';
export interface M10Patient {slot:string;patientId:string;identifier:string;password:string;sources:{assessmentId:string;confirmation:{score:number;category:string}}[];uiReport:{key:string;message:string}}
export const patients=(readPrivateJson(new URL('../../SynCare-be/data/m10-fixtures-private.json',import.meta.url)) as {patients:M10Patient[]}).patients;
export const sdk=readPrivateJson(new URL('../../SynCare-be/data/m10-sdk-identity_commit-evidence.json',import.meta.url)) as {result:string;data:{reports:{id:string;patientId:string;urgent:boolean}[]}};
const file=new URL('../../SynCare-be/data/m10-cross-client-private.json',import.meta.url);
interface Intent {path:string;key:string;body:unknown}
export interface Scenario {id?:string;key?:string;body?:Record<string,unknown>;[key:string]:unknown}
interface Evidence {cases:Record<string,Scenario>;uiIntents:Intent[];checks:Record<string,unknown>}
export function evidence():Evidence{return existsSync(file)?readPrivateJson(file):{cases:{},uiIntents:[],checks:{}};}
export function saveCase(name:string,patch:Scenario){const state=evidence();state.cases[name]={...state.cases[name],...patch};writePrivateJson(file,state);return state.cases[name]!;}
export function recordCheck(name:string,value:unknown){const state=evidence();state.checks[name]=value;writePrivateJson(file,state);}
export type PatientCall=(path:string,method?:string,body?:unknown,key?:string)=>Promise<Response>;
export async function withPatient<T>(slot:string,action:(call:PatientCall,p:M10Patient)=>Promise<T>){
 const p=patients.find(p=>p.slot===slot)!;const login=await fetch('http://127.0.0.1:8080/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:p.identifier,password:p.password})});expect(login.status).toBe(200);const grant=(await login.json()).data;
 const call:PatientCall=(path,method='GET',body,key)=>fetch(`http://127.0.0.1:8080/api/v1/${path}`,{method,headers:{authorization:`Bearer ${grant.sessionToken}`,'content-type':'application/json',...(key?{'idempotency-key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{return await action(call,p);}finally{await call('auth/session','DELETE');}
}
export async function trackMutations(page:Page){await page.route('**/api/syncare/v1/**',async route=>{const req=route.request(),key=req.headers()['idempotency-key'];if(req.method()==='POST'&&key){const state=evidence();if(!state.uiIntents.some(i=>i.key===key)){state.uiIntents.push({path:new URL(req.url()).pathname,key,body:req.postDataJSON()});writePrivateJson(file,state);}}await route.continue();});}
export async function closeNurse(page:Page){const session=await page.request.get('/api/auth/session').catch(()=>null);if(session?.ok()){const value=await session.json();await page.request.delete('/api/auth/session',{headers:{Origin:'http://127.0.0.1:3101','X-CSRF-Token':value.data.csrfToken}}).catch(()=>{});}}
export async function replayOwnedDomainIntents(page:Page,kind:'bookings'|'alerts'){
 for(const intent of evidence().uiIntents.filter(i=>i.path.includes(`/v1/${kind}/`))){const result=await page.request.post(intent.path,{headers:{...await mutationHeaders(page.request),'Idempotency-Key':intent.key},data:intent.body});expect([200,409,422]).toContain(result.status());}
}
