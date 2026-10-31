jest.mock('../src/services/apiClient', () => ({ apiFetch: jest.fn(), postJson: jest.fn() }));

import { apiFetch, postJson } from '../src/services/apiClient';

import {
  CONSENT_VERSION,
  connectExternalConsultant,
  disconnectExternalConsultant,
  listExternalConsultants,
  previewExternalConsultant,
  selectExternalDietPlan
} from '../src/services/externalConsultantService';

const mockApiFetch = apiFetch as jest.Mock;
const mockPostJson = postJson as jest.Mock;

describe('external consultant mobile bridge', () => {
  beforeEach(() => { mockApiFetch.mockReset(); mockPostJson.mockReset(); });

  it('previews without redeeming or persisting the PIN', async () => {
    mockPostJson.mockResolvedValue({ requested_scopes: ['PROFILE'] });
    await previewExternalConsultant('123456', 'session-token');
    expect(mockPostJson).toHaveBeenCalledWith('/v1/external-consultants/preview', { pin: '123456' }, { Authorization: 'Bearer session-token' });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('sends explicit consent and a replay-safe UUID without a client identity', async () => {
    mockPostJson.mockResolvedValue({ connection_id: 'connection-1' });
    await connectExternalConsultant('123456', ['PROFILE', 'DIET_PLANS'], 'session-token');
    const [, body] = mockPostJson.mock.calls[0];
    expect(body).toMatchObject({ pin: '123456', acceptedScopes: ['PROFILE', 'DIET_PLANS'], consentVersion: CONSENT_VERSION });
    expect(body.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(body.userId).toBeUndefined();
    expect(mockPostJson.mock.calls[0][2]).toEqual({ Authorization: 'Bearer session-token' });
  });

  it('keeps list and revocation connection-scoped', async () => {
    mockApiFetch.mockResolvedValue({ connections: [] });
    await listExternalConsultants('session-token');
    await disconnectExternalConsultant('connection A', 'session-token');
    expect(mockApiFetch).toHaveBeenNthCalledWith(1, '/v1/external-consultants', { headers: { Authorization: 'Bearer session-token' } });
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, '/v1/external-consultants/connection%20A', { method: 'DELETE', headers: { Authorization: 'Bearer session-token' } });
  });

  it('selects an active diet plan through its owning connection', async () => {
    mockApiFetch.mockResolvedValue({ publication_id: '6c556ac7-ea4c-4a91-b2f3-b477e693380b', active: true });
    await selectExternalDietPlan('connection A', '6c556ac7-ea4c-4a91-b2f3-b477e693380b', 'session-token');
    expect(mockApiFetch).toHaveBeenCalledWith('/v1/external-consultants/connection%20A/diet-plans/active', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ publicationId: '6c556ac7-ea4c-4a91-b2f3-b477e693380b' })
    }));
  });

  it('fails closed before making a consultant request without a login session', () => {
    expect(() => previewExternalConsultant('123456', '')).toThrow('Sign in to Fiteatsy');
    expect(mockPostJson).not.toHaveBeenCalled();
  });
});
