const mockStorage=new Map<string,string>();const mockApiFetch=jest.fn();
jest.mock('@react-native-async-storage/async-storage',()=>({getItem:jest.fn((key:string)=>Promise.resolve(mockStorage.get(key)??null)),setItem:jest.fn((key:string,value:string)=>{mockStorage.set(key,value);return Promise.resolve();}),removeItem:jest.fn((key:string)=>{mockStorage.delete(key);return Promise.resolve();})}));
jest.mock('../src/services/apiClient',()=>{class ApiClientError extends Error{code:string;constructor(code:string,message:string){super(message);this.code=code;}}return{ApiClientError,apiFetch:(...args:unknown[])=>mockApiFetch(...args)};});
import{recordLifestyleHabit,LIFESTYLE_HABIT_CONTRACT_VERSION}from'../src/services/lifestyleHabitService';
import{getSyncQueue}from'../src/services/platformSyncService';
import{ApiClientError}from'../src/services/apiClient';

test('explicit lifestyle entry is identity scoped, versioned and survives recoverable authentication failure',async()=>{mockStorage.clear();mockApiFetch.mockRejectedValue(new ApiClientError('UNAUTHORIZED','expired'));
 await recordLifestyleHabit({userId:'account-1',clientId:'client-1',onboarding:null,healthDay:'2026-11-18',habitType:'recovery_rest_practice',completed:false,revision:3});
 await new Promise(resolve=>setTimeout(resolve,0));const queue=await getSyncQueue({userId:'account-1',clientId:'client-1'});expect(queue).toHaveLength(1);expect(queue[0]).toEqual(expect.objectContaining({entityType:'health_event',status:'pending',attempts:0}));expect(queue[0].payload).toEqual(expect.objectContaining({eventType:'lifestyle_habit_recorded',eventSource:'mobile.tracker',eventPayload:expect.objectContaining({contractVersion:LIFESTYLE_HABIT_CONTRACT_VERSION,healthDay:'2026-11-18',habitType:'recovery_rest_practice',completed:false,revision:3,recordStatus:'active'})}));
 expect(await getSyncQueue({userId:'account-2',clientId:'client-2'})).toEqual([]);
});
