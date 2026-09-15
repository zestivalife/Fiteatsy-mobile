import fs from 'fs';
import path from 'path';

const read=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),'utf8');

describe('grievance, profile photo and home presentation contracts',()=>{
  test('mobile grievance flow is authenticated, account-scoped and idempotent',()=>{
    const service=read('src/services/grievanceService.ts');const screen=read('src/screens/profile/GrievanceFormScreen.tsx');
    expect(service).toContain("getIdentityScopedStorageKey('fiteatsy.grievance.draft.v1'");
    expect(service).toContain("apiResponse('/v1/grievances'");
    expect(service).toContain('clientRequestId');
    expect(screen).toContain('saved as a draft');
    expect(screen).toContain('Reference:');
  });

  test('backend persists grievances, audit events and profile photo ownership',()=>{
    const migration=read('backend/src/db/migrations/0076_grievances_and_profile_photos.sql');const routes=read('backend/src/modules/grievances/grievances.routes.ts');
    expect(migration).toContain('unique(user_id, client_request_id)');
    expect(migration).toContain('create table if not exists grievance_events');
    expect(migration).toContain('profile_photo_assets');
    expect(routes).toContain('requireAuthenticatedAccount');
    expect(routes).toContain("['admin','super_admin','platform_owner']");
    expect(routes).toContain("limits:{fileSize:5*1024*1024");
  });

  test('profile photos are compressed, uploaded and cached by authenticated identity',()=>{
    const screen=read('src/screens/profile/MyProfileScreen.tsx');const profile=read('src/screens/home/ProfileScreen.tsx');const service=read('src/services/profilePhotoService.ts');
    expect(screen).toContain('ImageManipulator.manipulateAsync');
    expect(screen).toContain('width:720,height:720');
    expect(service).toContain("getIdentityScopedStorageKey('fiteatsy.profile.photo.v1'");
    expect(service).toContain("apiResponse('/v1/profile/photo'");
    expect(profile).toContain('hydrateProfilePhoto');
  });

  test('Star Orb contains exactly five non-cycle domains and actions cannot overlap it',()=>{
    const home=read('src/screens/home/HomeScreen.tsx');
    expect(home).not.toContain("key: 'cycleWellness'");
    expect(home).not.toContain("position: 'bottomCenter'");
    expect(home).toContain("key: 'recovery'");expect(home).toContain("key: 'activity'");expect(home).toContain("key: 'nourishment'");expect(home).toContain("key: 'calm'");expect(home).toContain("key: 'sleep'");
    expect(home).toContain('marginTop: 8');
  });

  test('diagnostics always binds semantic text colors',()=>{
    const source=read('src/screens/sync/CanonicalHealthSyncDebugScreen.tsx');
    expect(source).toContain('color:colors.textSecondary');
    expect(source).toContain('color:colors.textPrimary');
  });

  test('subscriptions remain backend-catalogue driven with no screenshot pricing',()=>{
    const screen=read('src/screens/home/MySubscriptionScreen.tsx');const service=read('src/services/subscriptionService.ts');
    expect(service).toContain("apiFetch<{ plans: SubscriptionPlan[] }>('/v1/subscriptions/plans')");
    expect(screen).toContain('getMySubscription()');
    for(const literal of ['₹2,999','₹4,999','₹5,999','₹14,999','₹24,999'])expect(screen).not.toContain(literal);
  });
});
