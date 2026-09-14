const mockSecureValues=new Map<string,string>();
const mockLegacyValues=new Map<string,string>();

jest.mock('expo-secure-store',()=>({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY:'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync:jest.fn(async(key:string)=>mockSecureValues.get(key)??null),
  setItemAsync:jest.fn(async(key:string,value:string)=>{mockSecureValues.set(key,value);}),
  deleteItemAsync:jest.fn(async(key:string)=>{mockSecureValues.delete(key);})
}));
jest.mock('@react-native-async-storage/async-storage',()=>({
  __esModule:true,default:{
    getItem:jest.fn(async(key:string)=>mockLegacyValues.get(key)??null),
    setItem:jest.fn(async(key:string,value:string)=>{mockLegacyValues.set(key,value);}),
    removeItem:jest.fn(async(key:string)=>{mockLegacyValues.delete(key);})
  }
}));

describe('hard-close secure session recreation',()=>{
  beforeEach(()=>{mockSecureValues.clear();mockLegacyValues.clear();jest.resetModules();});

  it('persists login, recreates the module with no in-memory auth, and restores the authenticated identity without remote work',async()=>{
    const session=JSON.stringify({sessionToken:'opaque-token',accountId:'account-a',user:{id:'account-a'},
      client:{fiteatsyClientId:'client-a'}});
    const firstRuntime=require('../src/services/authSessionStore') as typeof import('../src/services/authSessionStore');
    await firstRuntime.writePersistedAuthSession(session);

    jest.resetModules();
    const recreatedRuntime=require('../src/services/authSessionStore') as typeof import('../src/services/authSessionStore');
    await expect(recreatedRuntime.readPersistedAuthSession()).resolves.toBe(session);
    expect(JSON.parse((await recreatedRuntime.readPersistedAuthSession())!).accountId).toBe('account-a');
    expect(mockLegacyValues.size).toBe(0);
  });

  it('migrates a legacy session exactly once and removes the browser-readable copy',async()=>{
    mockLegacyValues.set('nuetra.auth','legacy-session');
    const runtime=require('../src/services/authSessionStore') as typeof import('../src/services/authSessionStore');
    await expect(runtime.readPersistedAuthSession()).resolves.toBe('legacy-session');
    expect(mockLegacyValues.has('nuetra.auth')).toBe(false);
    expect(mockSecureValues.get('fiteatsy.auth.session.v2')).toBe('legacy-session');
  });
});
