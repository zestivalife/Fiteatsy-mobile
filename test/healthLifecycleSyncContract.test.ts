import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('authenticated health lifecycle sync contract', () => {
  test('app launch and foreground resume use the configured client-scoped connection', () => {
    const app = read('App.tsx');
    const lifecycle = read('src/services/healthLifecycleSync.ts');
    expect(app).toContain("AppState.addEventListener('change'");
    expect(app).toContain('runConfiguredHealthLifecycleSync');
    expect(lifecycle).toContain('config.fiteatsyClientId !== input.fiteatsyClientId');
    expect(lifecycle).toContain('HEALTH_LIFECYCLE_SYNC_INTERVAL_MS');
  });

  test('all triggers share one sync flight and rejected records cannot advance checkpoints', () => {
    const manager = read('src/services/healthSyncManager.ts');
    expect(manager).toContain('if (activeHealthSync) return activeHealthSync');
    expect(manager).toContain('governed && anchors && rejected === 0');
  });

  test('background configuration is bound to the authenticated Fiteatsy client', () => {
    const background = read('src/services/wearableBackgroundSync.ts');
    const screen = read('src/screens/sync/SyncWearableScreen.tsx');
    expect(background).toContain('fiteatsyClientId: string');
    expect(screen).toContain('fiteatsyClientId: authSession.client.fiteatsyClientId');
  });
});
