import { buildPresentedHealthObservations } from '../src/services/healthMetricPresentation';
import type { HealthObservationDto } from '../src/services/healthSyncManager';
import type { CanonicalDailyAggregate } from '@fiteatsy/health-intelligence';

const row = (metricType:string,value:number,measuredAtISO:string,id:string):HealthObservationDto => ({
  id,fiteatsyClientId:'client-1',createdAtISO:measuredAtISO,metricType,value,
  unit:metricType==='sleep_minutes'?'min':'count',measuredAtISO,sourceProvider:'apple_health',sourceRecordId:id
});

describe('health metric presentation aggregation',()=>{
  test('device daily statistics override the latest cumulative source packet',()=>{
    const source=[row('steps',166,'2026-09-13T10:00:00.000Z','packet')];
    const daily=[{...row('steps',2175,'2026-09-13T12:30:00.000Z','daily'),sourceMetadata:{measurementMethod:'HEALTHKIT_DAILY_CUMULATIVE_STATISTIC'}}];
    expect(buildPresentedHealthObservations(source,daily,[],Date.parse('2026-09-13T12:31:00.000Z'),0).get('steps')?.value).toBe(2175);
  });

  test('current wake-day sleep is summed and future-dated samples cannot poison the card',()=>{
    const source=[
      row('sleep_minutes',120,'2026-09-12T05:00:00.000Z','sleep-1'),
      row('sleep_minutes',198,'2026-09-12T07:00:00.000Z','sleep-2'),
      row('sleep_minutes',999,'2027-05-01T07:00:00.000Z','future')
    ];
    expect(buildPresentedHealthObservations(source,[],[],Date.parse('2026-09-12T12:31:00.000Z'),0).get('sleep_minutes')?.value).toBe(318);
  });

  test('never presents a historical daily total as the current-day value',()=>{
    const historical=[row('steps',1750,'2026-08-04T13:49:00.000Z','old-total')];
    expect(buildPresentedHealthObservations(historical,[],[],Date.parse('2026-09-20T12:31:00.000Z'),0).has('steps')).toBe(false);
  });

  test('durable aggregates remain presentable when bounded in-memory lineage is absent',()=>{
    const aggregate:CanonicalDailyAggregate={healthDay:'2026-09-20',metricType:'steps',value:513,unit:'count',method:'DAILY_SUM',latest:513,
      average:513,minimum:513,maximum:513,sourceObservationIds:['apple-health-row'],sourceProvider:'apple_health',sourcePriority:600,
      aggregateVersion:'HEALTH_AGGREGATION_V2',lineageHash:'hash-513',latestMeasuredAtISO:'2026-09-20T06:27:00.000Z',
      calculatedAtISO:'2026-09-20T06:28:00.000Z',aggregateSource:'HEALTHKIT_STATISTICS',rawLineageAvailable:true};
    const presented=buildPresentedHealthObservations([],[],[aggregate],Date.parse('2026-09-20T06:29:00.000Z'),0).get('steps');
    expect(presented?.value).toBe(513);
    expect(presented?.id).toBe('aggregate:hash-513');
  });
});
