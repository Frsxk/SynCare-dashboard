import { describe,expect,it } from "vitest";
import { reviewSchema,reviewLabels,draftForm } from "@/features/plans/contracts";
const base={id:"review-a",patientId:"patient-a",draftId:"draft-a",state:"WAITING_FOR_HUMAN",version:4,upstreamStatus:"suspended",gate:{requestId:"actual-gate",options:[{actionId:"approve",label:"Approve"},{actionId:"request_changes",label:"Request Changes"}]},decision:null,revisedDraftId:null,failureCode:null,createdAt:"2026-10-26T03:00:00.000Z",updatedAt:"2026-10-26T03:00:01.000Z"};
describe("M08 review contract",()=>{
  it("keeps only actual gate options and rejects missing gate, private upstream identity or fabricated version",()=>{
    expect(reviewSchema.parse(base).gate?.options).toHaveLength(2);
    for(const patch of [{gate:null},{upstreamJobId:"untrusted"},{version:0}])expect(reviewSchema.safeParse({...base,...patch}).success).toBe(false);
  });
  it("does not label decision acceptance, revision, uncertainty or escalation as approved",()=>{
    for(const state of ["DECISION_PENDING","DECISION_UNKNOWN","REVISION_DRAFT","ESCALATED","FAILED","EXPIRED"] as const)expect(reviewLabels[state]).not.toBe(reviewLabels.APPROVED);
    expect(draftForm.safeParse({assessmentId:"trusted",followupDate:"2026-11-02",hotline:""}).success).toBe(false);
  });
});
