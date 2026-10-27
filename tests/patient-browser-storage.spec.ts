import {test,expect,type Page} from '@playwright/test';
import {readPrivateJson} from '../../SynCare-be/src/security/private-files.cjs';

test.use({trace:'off',screenshot:'off'});
const base='http://127.0.0.1:3001',key='FlutterSecureStorage.syncare_session_token';
const patients=readPrivateJson(new URL('../../SynCare-be/data/m10-fixtures-private.json',import.meta.url)).patients;
const semantics=async(page:Page)=>{
 const placeholder=page.locator('flt-semantics-placeholder');
 await placeholder.waitFor({state:'attached'});await placeholder.evaluate(element=>(element as HTMLElement).click());
};
const sees=async(page:Page,label:string)=>expect.poll(async()=>(await page.locator('body').ariaSnapshot()).includes(label),{timeout:30000}).toBe(true);
const edit=async(page:Page,label:string,value:string)=>{
 const field=page.getByRole('textbox',{name:label,exact:true});await field.click();
 await expect.poll(()=>field.evaluate(element=>document.activeElement===element)).toBe(true);
 await page.keyboard.press('Control+A');await page.keyboard.insertText(value);
};

test('patient browser migrates legacy storage; encrypted tab session restores without extending expiry, independent tab stays signed out, logout revokes',async({page,context})=>{
 test.setTimeout(180000);
 const patient=patients.find((value:{slot:string})=>value.slot==='high');
 const grants:string[]=[];let expiry:string|undefined;let writes=0;
 page.on('request',request=>{if(request.method()==='POST'&&/\/patients\/.+\/(checkins|bookings|questions)$/.test(new URL(request.url()).pathname))writes++;});
 page.on('response',async response=>{if(response.url().endsWith('/api/v1/auth/login')&&response.ok()){const grant=(await response.json()).data;grants.push(grant.sessionToken);expiry=grant.expiresAt;}});
 try{
  await page.addInitScript(({key})=>{if(!sessionStorage.getItem('m11_migration_seeded')){localStorage.setItem(key,'synthetic-legacy-ciphertext');localStorage.setItem('m11_unrelated','retain');sessionStorage.setItem('m11_migration_seeded','yes');}},{key});
  await page.goto(base);await semantics(page);await sees(page,'Masuk ke akun');
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('m11_unrelated'))).toBe('retain');
  await edit(page,'Identitas akun',patient.identifier);await edit(page,'Kata sandi',patient.password);
  await page.getByRole('button',{name:'Masuk',exact:true}).click();await sees(page,'Akun saya');
  await expect.poll(()=>grants.length).toBe(1);
  const stored=await page.evaluate(key=>({local:localStorage.getItem(key),tab:sessionStorage.getItem(key)}),key);
  expect(stored.local).toBeNull();expect(Boolean(stored.tab)).toBe(true);expect(stored.tab===grants[0]).toBe(false);
  const expiresAt=expiry;
  await page.reload();await semantics(page);await sees(page,'Akun saya');
  const session=await page.request.get(base+'/api/v1/auth/session',{headers:{Authorization:`Bearer ${grants[0]}`}});
  expect(session.status()).toBe(200);expect((await session.json()).data.expiresAt).toBe(expiresAt);
  const independent=await context.newPage();await independent.goto(base);await semantics(independent);await sees(independent,'Masuk ke akun');await independent.close();
  await page.getByRole('button',{name:'Keluar',exact:true}).click();await sees(page,'Masuk ke akun');
  await expect.poll(async()=>(await page.request.get(base+'/api/v1/auth/session',{headers:{Authorization:`Bearer ${grants[0]}`}})).status()).toBe(401);
  expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBeNull();expect(writes).toBe(0);
 }finally{
  for(const token of grants)await page.request.delete(base+'/api/v1/auth/session',{headers:{Authorization:`Bearer ${token}`,Origin:base}}).catch(()=>{});
 }
});
