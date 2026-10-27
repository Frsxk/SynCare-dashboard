import { expect,test } from "vitest";
import { alertDetail,alertPage,followupForm,resolutionForm } from "@/features/escalations/contracts";
const now="2026-10-26T00:00:00.000Z";
const pending={id:"alert",patientId:"patient",patientName:"Pasien sintetis",source:{type:"F2",reportId:"report",attemptId:"attempt",action:"escalate_immediately",reason:"Alasan asli",reportedAt:now,outcomeAt:now},urgency:"acute",status:"PENDING_REVIEW",version:1,acknowledgedAt:null,resolvedAt:null,createdAt:now,updatedAt:now,timeline:[],timelineNextCursor:null};
test("four-state detail requires actual acknowledgment/closure evidence and rejects inferred urgency",()=>{
  expect(alertDetail.safeParse(pending).success).toBe(true);
  for(const patch of [{status:"ACKNOWLEDGED"},{status:"RESOLVED",acknowledgedAt:now},{status:"UNKNOWN"},{urgency:"HIGH"}])expect(alertDetail.safeParse({...pending,...patch}).success).toBe(false);
  expect(alertDetail.safeParse({...pending,status:"RESOLVED",version:4,acknowledgedAt:now,resolvedAt:now}).success).toBe(true);
});
test("follow-up requires explicit category/time/note; public summary is distinct and optional; closure summary required",()=>{
  const body={actionType:"contact_attempt",occurredAt:"2026-10-26T08:00",note:"Catatan internal",patientSummary:""};
  expect(followupForm.safeParse(body).success).toBe(true);
  for(const patch of [{actionType:""},{occurredAt:"2026-02-30T08:00"},{note:" "},{patientSummary:"x".repeat(4001)}])expect(followupForm.safeParse({...body,...patch}).success).toBe(false);
  expect(resolutionForm.safeParse({note:" ",patientSummary:"Public only"}).success).toBe(false);
  expect(resolutionForm.parse({note:"Internal closure",patientSummary:""}).patientSummary).toBe("");
});
test("queue has an actual bounded empty page; timeline cannot claim a future or duplicate version",()=>{
  expect(alertPage.parse({data:[],nextCursor:null,requestId:"test"}).data).toEqual([]);
  const event={id:"event",version:2,status:"ACKNOWLEDGED",recordedAt:now,patientSummary:null,action:"acknowledge",actorId:"nurse",occurredAt:now,actionType:null,internalNote:null};
  expect(alertDetail.safeParse({...pending,timeline:[event]}).success).toBe(false);
});
