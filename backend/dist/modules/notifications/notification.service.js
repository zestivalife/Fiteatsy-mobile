import { env, isOtpDebugResponseEnabled } from '../../config/env.js';
import { createPingMateProvider } from './pingmate.provider.js';
import { OtpDeliveryError } from './notification.types.js';
const LOCAL_PROVIDER_NAME = 'local-debug';
let whatsappProvider = createPingMateProvider();
export const setWhatsappProviderForTests = (provider) => {
    whatsappProvider = provider;
};
export const resetWhatsappProviderForTests = () => {
    whatsappProvider = createPingMateProvider();
};
const shouldSkipExternalOtpDelivery = () => {
    const environment = env.environment.toLowerCase();
    return environment === 'test' || isOtpDebugResponseEnabled();
};
const logDeliveryResult = (challengeId, userId, result) => {
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
const logDeliveryFailure = (challengeId, userId, error) => {
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
    async sendOTP(input) {
        if (shouldSkipExternalOtpDelivery()) {
            const result = {
                status: 'skipped',
                provider: LOCAL_PROVIDER_NAME,
                latencyMs: 0
            };
            logDeliveryResult(input.challengeId, input.userId, result);
            return result;
        }
        try {
            const result = await whatsappProvider.sendOtp(input);
            logDeliveryResult(input.challengeId, input.userId, result);
            return result;
        }
        catch (error) {
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
