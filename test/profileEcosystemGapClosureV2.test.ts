import fs from 'fs';
import path from 'path';

const read=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),'utf8');

describe('profile ecosystem gap closure v2 contracts',()=>{
  test('profile saves through the authenticated canonical server route without resetting onboarding',()=>{
    const route=read('backend/src/modules/profile/profile.routes.ts');
    const screen=read('src/screens/profile/MyProfileScreen.tsx');
    expect(route).toContain("profileRouter.patch('/'");
    expect(route).toContain('personalSchema');
    expect(route).toContain('healthSchema');
    expect(route).toContain('health_profile_measurement_history');
    expect(route).toContain("update users set name");
    expect(route).toContain('update health_profiles');
    expect(screen).toContain("section:'PERSONAL'");
    expect(screen).toContain("section:'HEALTH'");
    expect(screen).toContain('await saveProfile(');
    expect(screen).toContain('Your edits remain on this screen');
    expect(screen).not.toContain('onboardingComplete:false');
  });

  test('notification preferences are versioned, preserve child choices and expose OS delivery state',()=>{
    const migration=read('backend/src/db/migrations/0077_profile_preferences_and_consents.sql');
    const repository=read('backend/src/modules/preferences/preferences.repository.ts');
    const service=read('src/services/profilePreferenceService.ts');
    const routes=read('backend/src/modules/preferences/preferences.routes.ts');
    expect(migration).toContain('create table if not exists notification_preferences');
    expect(repository).toContain('version=version+1');
    expect(routes).toContain('PREFERENCE_VERSION_CONFLICT');
    expect(service).toContain('APP_ENABLED_OS_ALLOWED');
    expect(service).toContain('APP_ENABLED_OS_DENIED');
    expect(service).toContain('OS_NOT_DETERMINED');
  });

  test('consultant health projections fail closed unless account consent is granted',()=>{
    const server=read('backend/src/server.ts');
    const repository=read('backend/src/modules/preferences/preferences.repository.ts');
    expect(server).toContain(
      "'/v1/consultants/clients/:clientId',requireAuthenticatedAccount,requireConsultantClientAssignment,requireGrantedConsultantAccess"
    );
    expect(server).toContain(
      "'/v1/clients/:clientId',requireAuthenticatedAccount,requireConsultantClientAssignment,requireGrantedConsultantAccess"
    );
    expect(repository).toContain("status='GRANTED'");
  });

  test('grievance history is account scoped, cached and excludes internal notes',()=>{
    const service=read('src/services/grievanceService.ts');
    const routes=read('backend/src/modules/grievances/grievances.routes.ts');
    const navigation=read('src/navigation/AppNavigation.tsx');
    expect(service).toContain('getIdentityScopedStorageKey(`fiteatsy.grievances.${suffix}.v1`');
    expect(routes).toContain('getUserVisibleEvents');
    expect(routes).not.toContain('events:await getGrievanceEvents');
    expect(navigation).toContain('name="MyIssues"');
    expect(navigation).toContain('name="MyIssueDetail"');
  });

  test('profile photo updates publish through one account-keyed observable store',()=>{
    const service=read('src/services/profilePhotoService.ts');
    const hook=read('src/hooks/useProfilePhoto.ts');
    const home=read('src/screens/home/HomeScreen.tsx');
    expect(service).toContain('const current=new Map<string,string|null>()');
    expect(service).toContain('listeners.forEach');
    expect(hook).toContain('useSyncExternalStore');
    expect(home).toContain("useProfilePhoto(authSession?.accountId ?? '')");
  });

  test('admin mutation audit distinguishes assignment lifecycle and priority changes',()=>{
    const repository=read('backend/src/modules/grievances/grievances.repository.ts');
    expect(repository).toContain("?'UNASSIGNED'");
    expect(repository).toContain("?'ASSIGNED':'REASSIGNED'");
    expect(repository).toContain("'PRIORITY_CHANGED'");
  });
});
