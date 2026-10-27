import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {expect,test,type Page} from '@playwright/test';
import {loginNurse,mutationHeaders} from './local-accounts';
import {closeNurse,evidence,patients,recordCheck,saveCase,trackMutations,withPatient,type Scenario,type M10Patient} from './m10-fixtures';
import type {Draft,Review} from '../src/features/plans/contracts';
interface PlanCase extends Scenario {draftId?:string;reviewId?:string;revisionReviewId?:string;revisedDraftId?:string;decisionKey?:string;decisionBody?:Record<string,unknown>;lostReplyInjected?:boolean;replayObserved?:boolean}
const get=(name:string)=>evidence().cases[name] as PlanCase|undefined,save=(name:string,value:PlanCase)=>saveCase(name,value) as PlanCase;
const high=patients.find(p=>p.slot==='high')!,low=patients.find(p=>p.slot==='low')!;
async function readReview(page:Page,id:string){const r=await page.request.get(`/api/syncare/v1/reviews/${id}`);expect(r.status()).toBe(200);return(await r.json()).data as Review;}
async function waitReview(page:Page,id:string,state:Review['state']){let value=await readReview(page,id);for(let i=0;i<180&&value.state!==state;i++){if(['FAILED','INVALID','UNKNOWN','START_UNKNOWN','DECISION_UNKNOWN','EXPIRED'].includes(value.state))break;await page.waitForTimeout(400);value=await readReview(page,id);}expect(value.state).toBe(state);return value;}
async function post(page:Page,path:string,body:unknown,key:string){const response=await page.request.post(`/api/syncare/v1/${path}`,{headers:{...await mutationHeaders(page.request),'Idempotency-Key':key},data:body,timeout:100000});expect(response.status()).toBe(202);return(await response.json()).data;}
function canonical(id:string){const result=execFileSync(process.env.SYNCARE_TEST_BUN??'C:/Users/User/AppData/Local/Temp/syncare-npm-cache/_npx/9ec17c29a94a501f/node_modules/bun/bin/bun.exe',['run','scripts/verify-m10-canonical.ts',id],{cwd:fileURLToPath(new URL('../../SynCare-be/',import.meta.url)),encoding:'utf8',timeout:30000});expect(JSON.parse(result).result).toBe('PASS');}
async function registryCase(page:Page,name:string,p:M10Patient){let c=get(name);if(!c)c=save(name,{key:crypto.randomUUID(),startKey:crypto.randomUUID(),body:{assessmentId:p.sources.at(-1)!.assessmentId,followupDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10),hotline:`Kontak simulasi M10 ${name}, tidak menerima panggilan`}});if(!c.draftId){const result=await post(page,`patients/${p.patientId}/care-plan-drafts`,c.body,c.key!);expect(result.resource.state).toBe('DRAFT');c=save(name,{draftId:result.resource.id});}if(!c.reviewId){const result=await post(page,`care-plan-drafts/${c.draftId}/reviews`,{},c.startKey as string);c=save(name,{reviewId:result.resource.id});}return c;}
test.use({trace:'off',screenshot:'off'});test.afterEach(async({page})=>{await closeNurse(page);});

test('AT10_AT12 actual guarded F3, human gate, UI closure, lost resume and canonical approval',async({page},info)=>{
 test.setTimeout(240000);await loginNurse(page);await trackMutations(page);expect(JSON.parse(readFileSync(new URL('../../SynCare-be/data/m10-f3-guard-evidence.json',import.meta.url),'utf8')).guardVerified).toBe(true);
 const missing=await page.request.post(`/api/syncare/v1/patients/${high.patientId}/care-plan-drafts`,{headers:await mutationHeaders(page.request),data:{assessmentId:high.sources.at(-1)!.assessmentId,followupDate:'2026-11-02'}});expect(missing.status()).toBe(422);
 const stale=await page.request.post(`/api/syncare/v1/patients/${high.patientId}/care-plan-drafts`,{headers:await mutationHeaders(page.request),data:{assessmentId:high.sources[0]!.assessmentId,followupDate:'2026-11-02',hotline:'Kontak sintetis M10'}});expect(stale.status()).toBe(409);
 let c=get('plan_ui_approve');if(!c)c=save('plan_ui_approve',{body:{assessmentId:high.sources.at(-1)!.assessmentId,followupDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10),hotline:'Kontak simulasi M10 UI approval, tidak menerima panggilan'}});
 if(!c.draftId){
  const prior=evidence().uiIntents.find(i=>i.path===`/api/syncare/v1/patients/${high.patientId}/care-plan-drafts`&&(i.body as {hotline?:string}).hotline===c!.body!.hotline);
  if(prior){const result=await post(page,`patients/${high.patientId}/care-plan-drafts`,prior.body,prior.key);expect(result.resource.state).toBe('DRAFT');c=save('plan_ui_approve',{draftId:result.resource.id});}
  else{await page.goto(`/patients/${high.patientId}/care-plan`);await page.getByRole('combobox',{name:'Hasil F1 terkonfirmasi',exact:true}).selectOption(high.sources.at(-1)!.assessmentId);await page.getByLabel('Tanggal tindak lanjut rutin',{exact:true}).fill(c.body!.followupDate as string);await page.getByLabel('Kontak rutin dari petugas',{exact:true}).fill(c.body!.hotline as string);const result=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(`/patients/${high.patientId}/care-plan-drafts`),{timeout:100000});await page.getByRole('button',{name:'Buat draf F3 baru',exact:true}).click();const response=await result;expect(response.status()).toBe(202);const draft=(await response.json()).data.resource as Draft;expect(draft.state).toBe('DRAFT');c=save('plan_ui_approve',{draftId:draft.id});}
 }
 if(!c.reviewId){
  const prior=evidence().uiIntents.find(i=>i.path===`/api/syncare/v1/care-plan-drafts/${c!.draftId}/reviews`);
  if(prior){const result=await post(page,`care-plan-drafts/${c.draftId}/reviews`,{},prior.key);c=save('plan_ui_approve',{reviewId:result.resource.id});}
  else{await page.goto(`/patients/${high.patientId}/care-plan?draftId=${c.draftId}`);await expect(page.getByText(/^Status draf: DRAFT\./)).toBeVisible();const result=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(`/care-plan-drafts/${c!.draftId}/reviews`),{timeout:90000});await page.getByRole('button',{name:'Ajukan draf ini untuk review',exact:true}).click();const response=await result;expect(response.status()).toBe(202);c=save('plan_ui_approve',{reviewId:(await response.json()).data.resource.id});}
 }
 let review=await readReview(page,c.reviewId!);
 if(review.state!=='APPROVED'){
  if(c.decisionKey){await post(page,`reviews/${review.id}/decisions`,c.decisionBody,c.decisionKey);review=await waitReview(page,review.id,'APPROVED');}
  else{
   review=await waitReview(page,review.id,'WAITING_FOR_HUMAN');expect(review.gate!.options.map(o=>o.actionId).sort()).toEqual(['approve','escalate','fallback','request_changes']);
   await withPatient('high',async call=>{const plans=await call(`patients/${high.patientId}/care-plans`);expect((await plans.json()).data).toHaveLength(0);expect((await call(`reviews/${review.id}`)).status).toBe(403);});
   await page.goto('/workspace');await page.goto(`/patients/${high.patientId}/care-plan`);await page.getByRole('button',{name:/^Menunggu keputusan perawat ·/}).first().click();await expect(page.getByText('Status review: Menunggu keputusan perawat',{exact:true})).toBeVisible();recordCheck('uiClosedAtGateRecovered',true);
   await page.getByLabel('Catatan peninjau (opsional)',{exact:true}).fill('INTERNAL M10: persetujuan workflow sintetis, tidak ada tindakan medis nyata.');const keys:string[]=[];let drop=true;
   await page.route(`**/api/syncare/v1/reviews/${review.id}/decisions`,async route=>{const request=route.request(),key=request.headers()['idempotency-key']!;keys.push(key);if(drop){drop=false;save('plan_ui_approve',{decisionKey:key,decisionBody:request.postDataJSON()});const response=await route.fetch();expect(response.status()).toBe(202);await route.abort();save('plan_ui_approve',{lostReplyInjected:true});}else{save('plan_ui_approve',{replayObserved:key===get('plan_ui_approve')!.decisionKey});await route.continue();}});
   await page.getByRole('button',{name:'Kirim keputusan Approve',exact:true}).click();await expect(page.getByRole('button',{name:'Periksa permintaan yang sama',exact:true})).toBeVisible();await page.getByRole('button',{name:'Periksa permintaan yang sama',exact:true}).click();await expect(page.getByText('Status review: Persetujuan terverifikasi',{exact:true})).toBeVisible({timeout:75000});expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);await page.unroute(`**/api/syncare/v1/reviews/${review.id}/decisions`);review=await waitReview(page,review.id,'APPROVED');
  }
 }
 canonical(review.id);await page.goto(`/patients/${high.patientId}/care-plan?reviewId=${review.id}&draftId=${review.draftId}`);await expect(page.getByText('Status review: Persetujuan terverifikasi',{exact:true})).toBeVisible();await page.reload();await expect(page.getByText('Status review: Persetujuan terverifikasi',{exact:true})).toBeVisible();
 await withPatient('high',async call=>{const result=await call(`patients/${high.patientId}/care-plans`);expect(result.status).toBe(200);const value=await result.json();expect(value.data).toHaveLength(1);expect(value.data[0].reviewId).toBe(review.id);expect(JSON.stringify(value)).not.toContain('INTERNAL M10');expect(JSON.stringify(value)).not.toContain('source_input');});
 await page.screenshot({path:info.outputPath('m10-canonical-approved.png'),fullPage:true});recordCheck('AT10_AT12',{verifiedAt:new Date().toISOString(),reviewId:review.id,draftId:review.draftId,canonicalMatched:true,sourceGuard:true,uiClosedAtGate:true,lostReply:get('plan_ui_approve')!.lostReplyInjected,sameKey:get('plan_ui_approve')!.replayObserved});
});

test('AT11 actual RequestChanges creates DRAFT and new explicit gate; escalate and fallback stay nonapproval',async({page},info)=>{
 test.setTimeout(300000);await loginNurse(page);await trackMutations(page);const beforeAlerts=(await(await page.request.get(`/api/syncare/v1/patients/${low.patientId}/alerts?status=all&limit=100`)).json()).data.map((a:{id:string})=>a.id).sort();
 const c=await registryCase(page,'plan_request_changes',low);let review=await readReview(page,c.reviewId!);
 if(review.state!=='REVISION_DRAFT'){
  review=await waitReview(page,review.id,'WAITING_FOR_HUMAN');await page.goto(`/patients/${low.patientId}/care-plan?reviewId=${review.id}&draftId=${review.draftId}`);const label=review.gate!.options.find(o=>o.actionId==='request_changes')!.label;await page.getByLabel('Catatan peninjau (opsional)',{exact:true}).fill('INTERNAL M10: minta revisi sintetis tanpa perubahan dosis atau tindakan medis.');await page.getByRole('button',{name:`Kirim keputusan ${label}`,exact:true}).click();review=await waitReview(page,review.id,'REVISION_DRAFT');
 }
 expect(review.revisedDraftId).toBeTruthy();save('plan_request_changes',{revisedDraftId:review.revisedDraftId!});const revised=(await(await page.request.get(`/api/syncare/v1/care-plan-drafts/${review.revisedDraftId}`)).json()).data as Draft;expect(revised.state).toBe('DRAFT');expect(revised.parentDraftId).toBe(review.draftId);expect(revised.sourceReviewId).toBe(review.id);
 let nextId=get('plan_request_changes')!.revisionReviewId;
 if(!nextId){
  const list=(await(await page.request.get(`/api/syncare/v1/reviews?patientId=${low.patientId}&limit=100`)).json()).data as Review[];const existing=list.find(r=>r.draftId===revised.id);
  if(existing){nextId=existing.id;save('plan_request_changes',{revisionReviewId:nextId});}
  else{recordCheck('revisionNotAutoStarted',true);await page.goto(`/patients/${low.patientId}/care-plan?draftId=${revised.id}`);await expect(page.getByText(/^Status draf: DRAFT\./)).toBeVisible();const result=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(`/care-plan-drafts/${revised.id}/reviews`),{timeout:90000});await page.getByRole('button',{name:'Ajukan draf ini untuk review',exact:true}).click();const response=await result;expect(response.status()).toBe(202);nextId=(await response.json()).data.resource.id;save('plan_request_changes',{revisionReviewId:nextId});}
 }
 let next=await readReview(page,nextId!);expect(next.id).not.toBe(review.id);
 if(next.state!=='ESCALATED'){next=await waitReview(page,next.id,'WAITING_FOR_HUMAN');expect(next.decision).toBeNull();await page.goto(`/patients/${low.patientId}/care-plan?reviewId=${next.id}&draftId=${next.draftId}`);const label=next.gate!.options.find(o=>o.actionId==='escalate')!.label;await page.getByRole('button',{name:`Kirim keputusan ${label}`,exact:true}).click();next=await waitReview(page,next.id,'ESCALATED');}
 const fallback=await registryCase(page,'plan_fallback',low);let fallbackReview=await readReview(page,fallback.reviewId!);
 if(fallbackReview.state!=='ESCALATED'){fallbackReview=await waitReview(page,fallbackReview.id,'WAITING_FOR_HUMAN');await page.goto(`/patients/${low.patientId}/care-plan?reviewId=${fallbackReview.id}&draftId=${fallbackReview.draftId}`);const label=fallbackReview.gate!.options.find(o=>o.actionId==='fallback')!.label;await page.getByRole('button',{name:`Kirim keputusan ${label}`,exact:true}).click();fallbackReview=await waitReview(page,fallbackReview.id,'ESCALATED');}
 await page.goto(`/patients/${low.patientId}/care-plan?reviewId=${fallbackReview.id}&draftId=${fallbackReview.draftId}`);await expect(page.getByText('Status review: Rencana perlu perhatian klinisi',{exact:true})).toBeVisible();await expect(page.getByText(/Status ini tidak membuat alert darurat pasien/)).toBeVisible();
 const afterAlerts=(await(await page.request.get(`/api/syncare/v1/patients/${low.patientId}/alerts?status=all&limit=100`)).json()).data.map((a:{id:string})=>a.id).sort();expect(afterAlerts).toEqual(beforeAlerts);
 await withPatient('low',async call=>{const result=await call(`patients/${low.patientId}/care-plans`);expect((await result.json()).data).toHaveLength(0);});await page.screenshot({path:info.outputPath('m10-review-fallback.png'),fullPage:true});recordCheck('AT11',{verifiedAt:new Date().toISOString(),reviewId:review.id,revisedDraftId:revised.id,newGateReviewId:next.id,escalate:next.state,fallback:fallbackReview.state,noAcuteAlertCreated:true});
});

test('AT14 actual F5 approved citations, original refusals and urgent no-plan outcome',async()=>{
 test.setTimeout(180000);const refusal='Maaf, pertanyaan itu di luar cakupan rencana Anda. Silakan tanyakan ke perawat Anda atau hubungi hotline.';
 await withPatient('high',async(call,p)=>{
  for(const [name,query] of [['approved','Apa aktivitas tindak lanjut rutin pada rencana saya?'],['outside_scope','Apa nama satelit alami planet Jupiter?']]){const response=await call(`patients/${p.patientId}/questions`,'POST',{query});expect(response.status).toBe(200);const body=await response.json();saveCase(`F5_${name}`,{body});if(name==='approved'){expect(body.data.kind).toBe('answer');expect(body.data.citations.length).toBeGreaterThan(0);for(const citation of body.data.citations){expect(body.data.text).toContain(`[${citation.id} | ${citation.label}]`);expect(body.data.text).toContain(citation.quote);expect(['approved_plan','unapproved_education']).toContain(citation.provenance);if(citation.provenance==='approved_plan')expect(citation.id.startsWith(`${p.patientId}:`)).toBe(true);}}else{expect(body.data.kind).toBe('refusal');expect(body.data.text).toBe(refusal);}}
 });
 await withPatient('low',async(call,p)=>{for(const [name,query] of [['no_plan','Apa rencana perawatan saya?'],['urgent','Saya mengalami nyeri dada yang berat.']]){const response=await call(`patients/${p.patientId}/questions`,'POST',{query});expect(response.status).toBe(200);const body=await response.json();saveCase(`F5_${name}`,{body});if(name==='urgent'){expect(body.data.kind).toBe('emergency');expect(body.data.reason).toBe(query);expect(body.data.alert).toBeUndefined();}else{expect(body.data.kind).toBe('refusal');expect(body.data.text).toBe(refusal);}}});recordCheck('AT14',{verifiedAt:new Date().toISOString(),actualF5:true,cases:4,allCitations:true,originalRefusal:true,noPlanUrgent:true});
});

test('AT13 staged actual pending gate preserves identity across owned backend restart',async({page},info)=>{
 test.setTimeout(150000);await loginNurse(page);await trackMutations(page);const c=await registryCase(page,'plan_recovery_probe',low);let review=await readReview(page,c.reviewId!);
 if(process.env.M10_RECOVERY_PHASE!=='verify'&&review.state!=='ESCALATED'){
  review=await waitReview(page,review.id,'WAITING_FOR_HUMAN');save('plan_recovery_probe',{pendingGate:review.gate,preparedVersion:review.version});await page.goto(`/patients/${low.patientId}/care-plan?reviewId=${review.id}&draftId=${review.draftId}`);await expect(page.getByText('Status review: Menunggu keputusan perawat',{exact:true})).toBeVisible();await page.goto('/workspace');recordCheck('AT13prepared',{at:new Date().toISOString(),reviewId:review.id,noDecision:true});return;
 }
 const dependency=JSON.parse(readFileSync(new URL('../../SynCare-be/data/m10-review-dependency-evidence.json',import.meta.url),'utf8'));expect(dependency.result).toBe('PASS');expect(dependency.reviewId).toBe(review.id);
 const restarted=JSON.parse(readFileSync(new URL('../../SynCare-be/data/m10-review-restart-evidence.json',import.meta.url),'utf8'));expect(restarted.verifiedAt).toBeTruthy();
 if(review.state!=='ESCALATED'){
  review=await waitReview(page,review.id,'WAITING_FOR_HUMAN');expect(review.gate).toEqual(c.pendingGate);expect(review.decision).toBeNull();await page.goto(`/patients/${low.patientId}/care-plan?reviewId=${review.id}&draftId=${review.draftId}`);await expect(page.getByText('Status review: Menunggu keputusan perawat',{exact:true})).toBeVisible();const label=review.gate!.options.find(o=>o.actionId==='fallback')!.label;await page.getByRole('button',{name:`Kirim keputusan ${label}`,exact:true}).click();review=await waitReview(page,review.id,'ESCALATED');
 }
 await page.goto(`/patients/${low.patientId}/care-plan?reviewId=${review.id}&draftId=${review.draftId}`);await expect(page.getByText('Status review: Rencana perlu perhatian klinisi',{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('m10-recovered-gate-closed.png'),fullPage:true});recordCheck('AT13',{verifiedAt:new Date().toISOString(),reviewId:review.id,actualBackendRestart:true,sameGate:true,noAutomaticDecision:true,isolatedDependencyUnknown:true,explicitFallbackClosed:true});
});

test('AT12 actual UI closes before receiving gate; saved discovery and original start key recover one job',async({page,context})=>{
 test.setTimeout(150000);await loginNurse(page);let c=get('plan_close_before_gate');if(!c)c=save('plan_close_before_gate',{key:crypto.randomUUID(),body:{assessmentId:low.sources.at(-1)!.assessmentId,followupDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10),hotline:'Kontak simulasi M10 closed UI, tidak menerima panggilan'}});
 if(!c.draftId){const result=await post(page,`patients/${low.patientId}/care-plan-drafts`,c.body,c.key!);expect(result.resource.state).toBe('DRAFT');c=save('plan_close_before_gate',{draftId:result.resource.id});}
 if(!c.reviewId){
  const closing=await context.newPage();let reached!:()=>void,release!:()=>void;const committed=new Promise<void>(resolve=>{reached=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
  try{
   await closing.goto(`/patients/${low.patientId}/care-plan?draftId=${c.draftId}`);await expect(closing.getByText(/^Status draf: DRAFT\./)).toBeVisible();
   await closing.route(`**/api/syncare/v1/care-plan-drafts/${c.draftId}/reviews`,async route=>{const key=route.request().headers()['idempotency-key']!;save('plan_close_before_gate',{startKey:key});const response=await route.fetch();expect(response.status()).toBe(202);save('plan_close_before_gate',{reviewId:(await response.json()).data.resource.id});reached();await held;await route.abort().catch(()=>{});});
   await closing.getByRole('button',{name:'Ajukan draf ini untuk review',exact:true}).click();await committed;expect(await closing.getByText('Status review: Menunggu keputusan perawat',{exact:true}).count()).toBe(0);await closing.close();save('plan_close_before_gate',{closedBeforeClientGate:true});
  }finally{release();await closing.close().catch(()=>{});}
  c=get('plan_close_before_gate')!;
 }
 let review=await readReview(page,c.reviewId!);if(review.state!=='ESCALATED'){
  review=await waitReview(page,review.id,'WAITING_FOR_HUMAN');expect(review.decision).toBeNull();await page.goto(`/patients/${low.patientId}/care-plan`);await page.getByRole('button',{name:/^Menunggu keputusan perawat ·/}).first().click();await expect(page.getByText('Status review: Menunggu keputusan perawat',{exact:true})).toBeVisible();const label=review.gate!.options.find(o=>o.actionId==='fallback')!.label;await page.getByRole('button',{name:`Kirim keputusan ${label}`,exact:true}).click();review=await waitReview(page,review.id,'ESCALATED');
 }
 const replay=await post(page,`care-plan-drafts/${c.draftId}/reviews`,{},c.startKey as string);expect(replay.replayed).toBe(true);expect(replay.resource.id).toBe(review.id);const list=(await(await page.request.get(`/api/syncare/v1/reviews?patientId=${low.patientId}&limit=100`)).json()).data as Review[];expect(list.filter(r=>r.draftId===c!.draftId)).toHaveLength(1);recordCheck('AT12beforeGate',{verifiedAt:new Date().toISOString(),reviewId:review.id,closedBeforeClientGate:c.closedBeforeClientGate,savedDiscovery:true,sameStartKey:true,oneJob:true,explicitFallbackClosed:true});
});
