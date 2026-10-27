import {readPrivateJson} from '../../SynCare-be/src/security/private-files.cjs'
import { writeFileSync,existsSync } from "node:fs";
import { expect } from "@playwright/test";
const patients=(readPrivateJson(new URL("../../SynCare-be/data/local-demo-accounts.json",import.meta.url)) as {patients:{identifier:string;password:string}[]}).patients;
export async function asPatient<T>(index:number,action:(call:(path:string)=>Promise<Response>)=>Promise<T>){
  const account=patients[index]!;
  const login=await fetch("http://127.0.0.1:8080/api/v1/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({identifier:account.identifier,password:account.password})});expect(login.status).toBe(200);
  const grant=(await login.json()).data;
  const call=(path:string)=>fetch(`http://127.0.0.1:8080/api/v1/${path.replace("{patient}",grant.principal.patientId)}`,{headers:{authorization:`Bearer ${grant.sessionToken}`}});
  try{return await action(call);}finally{await fetch("http://127.0.0.1:8080/api/v1/auth/session",{method:"DELETE",headers:{authorization:`Bearer ${grant.sessionToken}`}});}
}
export async function pendingAlert(){return asPatient(0,async call=>{
  const result=await call("patients/{patient}/alerts?status=PENDING_REVIEW&limit=100");expect(result.status).toBe(200);
  const rows=(await result.json()).data as {id:string;source:{reason:string}}[];expect(rows.length,"A committed synthetic F2 source is required; no fabricated alert fixture").toBeGreaterThan(0);
  return rows[0]!;
});}
export function recordAlert(id:string){
  const file=new URL("../../SynCare-be/data/m07-browser-evidence.json",import.meta.url),prior=existsSync(file)?readPrivateJson(file):[];
  writeFileSync(file,JSON.stringify([...prior,{id,verifiedAt:new Date().toISOString(),actualStoredF2:true,lostResponseReconciled:true,staleConcurrentAckRejected:true,status:"RESOLVED",internalNotePrivate:true}],null,2));
}
export function existingOwnAlert(){return (readPrivateJson(new URL("../../SynCare-be/data/m07-source-evidence.json",import.meta.url)) as {ownAlertId:string}).ownAlertId;}
