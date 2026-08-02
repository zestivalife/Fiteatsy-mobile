import { env } from '../../config/env.js';
import { createPingMateProvider } from './pingmate.provider.js';
import { type OtpDeliveryResult, OtpDeliveryError, type SendOtpInput, type WhatsappProvider } from './notification.types.js';

const TEST_PROVIDER_NAME = 'test-noop';

let whatsappProvider: WhatsappProvider = createPingMateProvider();

export const setWhatsappProviderForTests = (provider: WhatsappProvider) => {
  whatsappProvider = provider;
};

export const resetWhatsappProviderForTests = () => {
  whatsappProvider = createPingMateProvider();
};

const shouldSkipExternalOtpDelivery = () => {
  const environment = env.environment.toLowerCase();
  return environment === 'test';
};

const logDeliveryResult = (challengeId: string, userId: string | null | undefined, result: OtpDeliveryResult) => {
  console.info('OTP delivery result', {
    challengeId,
    userId: userId ?? null,
    deliveryStatus: result.status,
    provider: result.provider,
    providerResponseCode: result.providerResponseCode ?? null,
    providerRequestId: result.providerRequestId ?? null,
    latencyMs: result.latencyMs
  });
};

const logDeliveryFailure = (challengeId: string, userId: string | null | undefined, error: OtpDeliveryError) => {
  console.warn('OTP delivery failed', {
    challengeId,
    userId: userId ?? null,
    deliveryStatus: 'failed',
    provider: error.provider,
    providerResponseCode: error.providerResponseCode ?? null,
    providerRequestId: error.providerRequestId ?? null,
    providerResponseBody: error.providerResponseBody ?? null,
    latencyMs: error.latencyMs
  });
};

export const NotificationService = {
  async sendOTP(input: SendOtpInput): Promise<OtpDeliveryResult> {
    if (shouldSkipExternalOtpDelivery()) {
      const result = {
        status: 'skipped',
        provider: TEST_PROVIDER_NAME,
        latencyMs: 0
      } satisfies OtpDeliveryResult;
      logDeliveryResult(input.challengeId, input.userId, result);
      return result;
    }

    try {
      const result = await whatsappProvider.sendOtp(input);
      logDeliveryResult(input.challengeId, input.userId, result);
      return result;
    } catch (error) {
      if (error instanceof OtpDeliveryError) {
        logDeliveryFailure(input.challengeId, input.userId, error);
        throw error;
      }
      const wrapped = new OtpDeliveryError('OTP delivery failed.', {
        provider: 'unknown',
        latencyMs: 0
      });
      logDeliveryFailure(input.challengeId, input.userId, wrapped);
      throw wrapped;
    }
  }
};
