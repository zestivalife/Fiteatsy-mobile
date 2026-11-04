import fs from 'node:fs';
import path from 'node:path';

describe('external consultant food preference projection', () => {
  it('shares the canonical saved profile only under PROFILE consent', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'backend/src/modules/external-consultants/external-consultant-access.routes.ts'), 'utf8');
    expect(source).toContain("scopes.has('PROFILE') ? getFoodPreferenceProfile(context.profile.client.id) : Promise.resolve(null)");
    expect(source).toContain('foodPreferences,');
    expect(source).not.toContain("scopes.has('MEASUREMENTS') ? getFoodPreferenceProfile");
  });
});
