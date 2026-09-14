import {aggregateCanonicalHealthObservations,canonicalHealthDay,HEALTH_AGGREGATION_VERSION} from '@fiteatsy/health-intelligence';

const observation=(metricType:string,value:number,measuredAtISO:string,extra:Record<string,unknown>={})=>({
  metricType,value,unit:metricType==='steps'?'count':'min',measuredAtISO,sourceProvider:'apple_health',
  sourceRecordId:`${metricType}-${value}-${measuredAtISO}`,...extra
});

describe('canonical health aggregation',()=>{
  it('sums cumulative packets for one health day instead of displaying a latest packet',()=>{
    const rows=aggregateCanonicalHealthObservations([
      observation('steps',400,'2026-09-13T06:00:00.000Z'),observation('steps',800,'2026-09-13T10:00:00.000Z')
    ],{fallbackOffsetMinutes:330,nowMs:Date.parse('2026-09-13T12:00:00.000Z')});
    expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({value:1200,method:'DAILY_SUM',aggregateVersion:HEALTH_AGGREGATION_VERSION});
  });

  it('uses the explicit platform cumulative statistic instead of double-counting raw sources',()=>{
    const rows=aggregateCanonicalHealthObservations([
      observation('steps',400,'2026-09-13T06:00:00.000Z'),observation('steps',800,'2026-09-13T10:00:00.000Z'),
      observation('steps',2175,'2026-09-13T11:00:00.000Z',{sourceProvider:'platform_aggregate',sourceMetadata:{measurementMethod:'HEALTHKIT_DAILY_CUMULATIVE_STATISTIC'}})
    ],{fallbackOffsetMinutes:330,nowMs:Date.parse('2026-09-13T12:00:00.000Z')});
    expect(rows[0].value).toBe(2175);expect(rows[0].sourcePriority).toBe(600);
  });

  it('deduplicates stable identities and rejects future samples',()=>{
    const duplicate={...observation('steps',100,'2026-09-13T06:00:00.000Z'),syncKey:'same'};
    const rows=aggregateCanonicalHealthObservations([duplicate,duplicate,observation('steps',999,'2026-09-14T00:00:00.000Z')],
      {fallbackOffsetMinutes:0,nowMs:Date.parse('2026-09-13T08:00:00.000Z')});
    expect(rows[0].value).toBe(100);
  });

  it('attributes sleep to its wake day and merges overlapping session intervals',()=>{
    const sleep=observation('sleep_minutes',300,'2026-09-12T18:30:00.000Z',{startAtISO:'2026-09-12T18:30:00.000Z',endAtISO:'2026-09-13T00:30:00.000Z'});
    expect(canonicalHealthDay(sleep,330)).toBe('2026-09-13');
    const rows=aggregateCanonicalHealthObservations([sleep,observation('sleep_minutes',120,'2026-09-12T22:30:00.000Z',{startAtISO:'2026-09-12T22:30:00.000Z',endAtISO:'2026-09-13T00:30:00.000Z'})],
      {fallbackOffsetMinutes:330,nowMs:Date.parse('2026-09-13T12:00:00.000Z')});
    expect(rows[0].value).toBe(360);
  });
});
