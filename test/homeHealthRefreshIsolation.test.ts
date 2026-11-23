jest.mock('../src/services/apiClient',()=>({
  ApiClientError:class ApiClientError extends Error{
    code:string;status?:number;
    constructor(code:string,message:string,status?:number){super(message);this.code=code;this.status=status;}
  },
  apiFetch:jest.fn(),apiBaseUrl:'https://example.test'
}));
jest.mock('@react-native-async-storage/async-storage',()=>({getItem:jest.fn(),setItem:jest.fn(),removeItem:jest.fn(),multiGet:jest.fn(),multiSet:jest.fn()}));
jest.mock('@react-native-community/netinfo',()=>({addEventListener:jest.fn(()=>()=>{}),fetch:jest.fn()}));
jest.mock('expo-background-task',()=>({registerTaskAsync:jest.fn(),unregisterTaskAsync:jest.fn(),BackgroundTaskResult:{Success:'Success',Failed:'Failed'}}),{virtual:true});
jest.mock('expo-task-manager',()=>({defineTask:jest.fn(),isTaskDefined:jest.fn(()=>false),isTaskRegisteredAsync:jest.fn()}),{virtual:true});

import {ApiClientError} from '../src/services/apiClient';
import {refreshHomeHealthResponses} from '../src/services/canonicalHealthSyncCoordinator';

const candidate=(score=81)=>({days:[{activity:{score}}]}) as any;
const canonical={scores:{activity:{score:null,status:'METHODOLOGY_PENDING'}}} as any;
const requests=(overrides:Record<string,()=>Promise<unknown>>={})=>({
  syncStatus:async()=>({fiteatsyClientId:'client'} as any),
  latestObservations:async()=>({items:[]} as any),
  syncActivity:async()=>({items:[]} as any),
  canonicalIntelligence:async()=>canonical,
  starOrb:async()=>candidate(),
  ...overrides
}) as any;
const handlers=()=>({
  syncStatus:jest.fn(),latestObservations:jest.fn(),syncActivity:jest.fn(),canonicalIntelligence:jest.fn(),starOrb:jest.fn()
});

test('all Home refresh responses update their independent state consumers',async()=>{
  const next=handlers();
  await refreshHomeHealthResponses(requests(),next);
  Object.values(next).forEach(handler=>expect(handler).toHaveBeenCalledTimes(1));
  expect(next.starOrb).toHaveBeenCalledWith(candidate());
});

test('an unrelated request failure cannot discard a successful 81 Star Orb response',async()=>{
  const next=handlers();
  const warn=jest.spyOn(console,'warn').mockImplementation(()=>undefined);
  await refreshHomeHealthResponses(requests({syncActivity:async()=>{throw new ApiClientError('SERVER_ERROR','failed',503);}}),next);
  expect(next.syncActivity).not.toHaveBeenCalled();
  expect(next.starOrb).toHaveBeenCalledWith(candidate(81));
  expect(warn).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({endpoint:'syncActivity',status:503,errorCategory:'SERVER_ERROR',starOrbSucceeded:true}));
  warn.mockRestore();
});

test('a Star Orb failure is recorded while successful unrelated state is preserved',async()=>{
  const next=handlers();
  const warn=jest.spyOn(console,'warn').mockImplementation(()=>undefined);
  await refreshHomeHealthResponses(requests({starOrb:async()=>{throw new ApiClientError('CONFLICT','unavailable',409);}}),next);
  expect(next.starOrb).not.toHaveBeenCalled();
  expect(next.syncStatus).toHaveBeenCalledTimes(1);
  expect(next.canonicalIntelligence).toHaveBeenCalledWith(canonical);
  expect(warn).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({endpoint:'starOrb',status:409,errorCategory:'CONFLICT',starOrbSucceeded:false}));
  warn.mockRestore();
});

test('a later Star Orb response updates as soon as it resolves, independent of completion order',async()=>{
  let resolveStarOrb!:(value:any)=>void;
  const lateStarOrb=new Promise<any>(resolve=>{resolveStarOrb=resolve;});
  const next=handlers();
  const refresh=refreshHomeHealthResponses(requests({starOrb:()=>lateStarOrb}),next);
  await Promise.resolve();
  expect(next.syncStatus).toHaveBeenCalledTimes(1);
  expect(next.starOrb).not.toHaveBeenCalled();
  resolveStarOrb(candidate(81));
  await refresh;
  expect(next.starOrb).toHaveBeenCalledWith(candidate(81));
});

test('post-upload recovery path explicitly refreshes the independent Star Orb projection',()=>{
  const source=require('fs').readFileSync(require('path').join(process.cwd(),'src/services/canonicalHealthSyncCoordinator.ts'),'utf8');
  expect(source).toContain('if (error instanceof HealthSyncPostUploadRefreshError) {');
  expect(source).toContain('void refreshRemoteSnapshot();');
});

test('concurrent Home refreshes apply callbacks only from the latest generation',()=>{
  const source=require('fs').readFileSync(require('path').join(process.cwd(),'src/services/canonicalHealthSyncCoordinator.ts'),'utf8');
  expect(source).toContain('const generation = ++remoteRefreshGeneration.current;');
  expect(source).toContain('generation === remoteRefreshGeneration.current');
  expect(source).toContain('if (!appliesToCurrentGeneration()) return;');
});

test('account hydration restarts the authoritative refresh after invalidating the prior generation',()=>{
  const source=require('fs').readFileSync(require('path').join(process.cwd(),'src/services/canonicalHealthSyncCoordinator.ts'),'utf8');
  const accountTransition=source.slice(source.indexOf('remoteRefreshGeneration.current += 1;'),source.indexOf('if (!localHydrated || !localScope) return;'));
  expect(accountTransition).toContain('setLocalHydrated(true);');
  expect(accountTransition.match(/void refreshRemoteSnapshot\(\);/g)).toHaveLength(2);
  expect(accountTransition.indexOf('remoteRefreshGeneration.current += 1;')).toBeLessThan(accountTransition.indexOf('void refreshRemoteSnapshot();'));
});
