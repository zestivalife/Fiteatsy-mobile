import { emitHealthSyncDiagnostic,setHealthSyncDiagnosticSink } from '../src/services/healthSyncObservability';

describe('privacy-safe health sync observability',()=>{
  afterEach(()=>setHealthSyncDiagnosticSink(null));
  it('emits bounded operational metadata without accepting raw health values or identity',()=>{
    const events:unknown[]=[];setHealthSyncDiagnosticSink(event=>events.push(event));
    emitHealthSyncDiagnostic({event:'UPLOAD_BATCH',correlationId:'hs-safe',provider:'APPLE_HEALTH',recordsRead:50,
      recordsAccepted:48,recordsUpdated:1,recordsDeleted:0,recordsRejected:1,durationMs:42});
    expect(events).toHaveLength(1);
    const encoded=JSON.stringify(events[0]);
    for(const forbidden of ['accessToken','otp','clientId','sourceRecordId','value','measuredAtISO'])expect(encoded).not.toContain(forbidden);
  });
});
