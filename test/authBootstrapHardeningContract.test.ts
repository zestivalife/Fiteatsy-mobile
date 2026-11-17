import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('authentication bootstrap hardening contract', () => {
  it('preserves identity-scoped clinical data and pending queues across logout', () => {
    const context = read('src/state/AppContext.tsx');
    expect(context).toContain('Identity-scoped clinical data and pending queues survive logout/session expiry.');
    expect(context).not.toContain('void removeUserStorage(sessionToClear)');
    expect(context).toContain('void removeLegacyUserStorage()');
  });

  it('rejects stale asynchronous bootstrap writes after identity changes', () => {
    const context = read('src/state/AppContext.tsx');
    expect(context).toContain('sessionGenerationRef');
    expect(context).toContain('isCurrentBootstrap');
    expect(context).toContain('isCurrentAuthentication');
  });

  it('returns explicit terminal session reasons from backend middleware', () => {
    const repository = read('backend/src/modules/auth/auth.repository.ts');
    const middleware = read('backend/src/modules/auth/auth.middleware.ts');
    expect(repository).toContain("'SESSION_REVOKED' | 'SESSION_EXPIRED' | 'ACCOUNT_DISABLED' | 'INVALID_SESSION'");
    expect(repository).toContain("return 'SESSION_EXPIRED'");
    expect(repository).toContain("and upper(u.status) = 'ACTIVE'");
    expect(middleware).toContain('getSessionRejectionCodeByToken(token)');
  });
});
