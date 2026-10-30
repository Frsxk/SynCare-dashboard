import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
const { queryMock }=vi.hoisted(()=>({queryMock:vi.fn()}));
vi.mock('@tanstack/react-query',()=>({useInfiniteQuery:queryMock}));
vi.mock('@/features/patients/session-data',()=>({PatientSessionData:({children}: {children: React.ReactNode})=>children,usePatientSession:()=>({key:(parts:unknown[])=>['account',...parts],api:{request:vi.fn()}})}));
import { AlertQueuePage } from '@/features/escalations/alert-queue';
beforeEach(()=>{queryMock.mockReturnValue({data:{pages:[{data:[{id:'alert-demo',patientName:'Patient demo',status:'PENDING_REVIEW',source:{type:'PATIENT_REQUEST',requestId:'alert-demo',action:'request_immediate_help',reason:'Synthetic urgent request',reportedAt:'2026-10-30T00:00:00.000Z',outcomeAt:'2026-10-30T00:00:00.000Z'}}],nextCursor:null}]},isFetching:false,isError:false,hasNextPage:false,refetch:vi.fn()})});
test('visible escalation queue polls every five seconds without background polling',()=>{
 renderToStaticMarkup(createElement(AlertQueuePage,{principalId:'nurse-demo',csrfToken:'csrf-demo'}));
 const options=queryMock.mock.calls[0][0];expect(options.refetchInterval).toBe(5000);expect(options.refetchIntervalInBackground).toBe(false);
});
test('new pending patient requests have an accessible visible nurse signal without dispatch claims',()=>{
 const html=renderToStaticMarkup(createElement(AlertQueuePage,{principalId:'nurse-demo',csrfToken:'csrf-demo'}));
 expect(html).toContain('aria-live="polite"');expect(html).toContain('1 permintaan bantuan pasien menunggu review');expect(html).toContain('otomatis setiap 5 detik');
 expect(html).not.toContain('Ambulans dikirim');
});
