import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FITEATSY_INTAKE_LEADS_QUERY,
  mapFiteatsyIntakeLead,
} from '../../backend/src/modules/admin/admin.repository.js';

test('lead query includes each unique end-user mobile identity even before a client record is materialized', () => {
  assert.match(FITEATSY_INTAKE_LEADS_QUERY, /left join fiteatsy_clients/i);
  assert.doesNotMatch(FITEATSY_INTAKE_LEADS_QUERY, /order by u\.created_at desc\s+limit\s+\d+/i);
  assert.match(FITEATSY_INTAKE_LEADS_QUERY, /lower\(coalesce\(u\.role, 'user'\)\) in \('user', 'client'\)/i);
  assert.doesNotMatch(FITEATSY_INTAKE_LEADS_QUERY, /mobile_verified_at is not null/i);
  assert.match(FITEATSY_INTAKE_LEADS_QUERY, /partition by verified_mobile_key/i);
  assert.match(FITEATSY_INTAKE_LEADS_QUERY, /mobile_identity_rank = 1/i);
});

test('a newly registered user without a client row remains a visible lead', () => {
  const lead = mapFiteatsyIntakeLead({
    user_id: 'user-new',
    fiteatsy_client_id: null,
    name: 'New user',
    email_normalized: null,
    mobile_number_normalized: '911234567890',
    created_at: '2026-10-28T06:00:00.000Z',
    status: 'active',
    has_login_pin: false,
    assignment_id: null,
    consultant_user_id: null,
    consultant_name: null,
    consultant_role: null,
  });

  assert.equal(lead.userId, 'user-new');
  assert.equal(lead.clientId, null);
  assert.equal(lead.leadStatus, 'NEW');
  assert.equal(lead.loginPinStatus, 'SETUP_REQUIRED');
});
