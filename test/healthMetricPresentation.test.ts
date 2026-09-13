import { buildPresentedHealthObservations } from '../src/services/healthMetricPresentation';
import type { HealthObservationDto } from '../src/services/healthSyncManager';

const row = (metricType:string,value:number,measuredAtISO:string,id:string):HealthObservationDto => ({
  id,fiteatsyClientId:'client-1',createdAtISO:measuredAtISO,metricType,value,
  unit:metricType==='sleep_minutes'?'min':'count',measuredAtISO,sourceProvider:'apple_health',sourceRecordId:id
});

describe('health metric presentation aggregation',()=>{
  test('device daily statistics override the latest cumulative source packet',()=>{
    const source=[row('steps',166,'2026-09-13T10:00:00.000Z','packet')];
    const daily=[{...row('steps',2175,'2026-09-13T12:30:00.000Z','daily'),sourceMetadata:{measurementMethod:'HEALTHKIT_DAILY_CUMULATIVE_STATISTIC'}}];
    expect(buildPresentedHealthObservations(source,daily,Date.parse('2026-09-13T12:31:00.000Z')).get('steps')?.value).toBe(2175);
  });

  test('latest sleep day is summed and future-dated samples cannot poison the card',()=>{
    const source=[
      row('sleep_minutes',120,'2026-09-12T05:00:00.000Z','sleep-1'),
      row('sleep_minutes',198,'2026-09-12T07:00:00.000Z','sleep-2'),
      row('sleep_minutes',999,'2027-05-01T07:00:00.000Z','future')
    ];
    expect(buildPresentedHealthObservations(source,[],Date.parse('2026-09-13T12:31:00.000Z')).get('sleep_minutes')?.value).toBe(318);
  });
});
