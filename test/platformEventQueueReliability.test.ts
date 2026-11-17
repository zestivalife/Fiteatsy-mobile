const mockStorage=new Map<string,string>();
const mockApiFetch=jest.fn();
jest.mock('@react-native-async-storage/async-storage',()=>({
  getItem:jest.fn((key:string)=>Promise.resolve(mockStorage.get(key)??null)),
  setItem:jest.fn((key:string,value:string)=>{mockStorage.set(key,value);return Promise.resolve();}),
  removeItem:jest.fn((key:string)=>{mockStorage.delete(key);return Promise.resolve();})
}));
jest.mock('../src/services/apiClient',()=>{
  class ApiClientError extends Error{code:string;constructor(code:string,message:string){super(message);this.code=code;}}
  return {ApiClientError,apiFetch:(...args:unknown[])=>mockApiFetch(...args)};
});

import {processPendingHealthEvents} from '../src/services/platformEventService';
import {enqueueSyncItem,getSyncQueue} from '../src/services/platformSyncService';
import {ApiClientError} from '../src/services/apiClient';
import type {SyncQueueItem} from '../src/types';

const identity={userId:'acct',clientId:'client'};
const item=():SyncQueueItem=>({id:'sync-event',entityType:'health_event',operation:'enqueue',status:'processing',attempts:0,maxAttempts:5,nextAttemptAtISO:null,createdAtISO:'2026-11-17T00:00:00.000Z',updatedAtISO:'2026-11-17T00:00:00.000Z',lastError:null,payload:{id:'event-1',eventType:'cycle_logged',eventSource:'mobile.cycle',userId:'acct',careCaseId:'local-care-case-1',occurredAtISO:'2026-11-17T00:00:00.000Z',eventPayload:{mood:'calm'},priority:'low',shouldCreateTimelineEntry:true,shouldEvaluateTicket:false,schemaVersion:1}});

describe('clinical event queue recovery',()=>{
  beforeEach(()=>{mockStorage.clear();mockApiFetch.mockReset();jest.clearAllMocks();});
  it('recovers a processing item, resolves the canonical care case, and acknowledges delivery',async()=>{
    await enqueueSyncItem(item(),identity);
    mockApiFetch.mockResolvedValueOnce({id:'server-case'}).mockResolvedValueOnce({accepted:true});
    await expect(processPendingHealthEvents(identity)).resolves.toBe(1);
    expect(mockApiFetch).toHaveBeenNthCalledWith(2,'/v1/platform/care-cases/server-case/events',expect.objectContaining({body:expect.stringContaining('server-case')}));
    await expect(getSyncQueue(identity)).resolves.toEqual([]);
  });
  it('preserves the item and retry budget when the session expired',async()=>{
    await enqueueSyncItem(item(),identity);
    mockApiFetch.mockRejectedValueOnce(new ApiClientError('UNAUTHORIZED','expired'));
    await expect(processPendingHealthEvents(identity)).resolves.toBe(0);
    await expect(getSyncQueue(identity)).resolves.toEqual([expect.objectContaining({status:'pending',attempts:0})]);
  });
});
