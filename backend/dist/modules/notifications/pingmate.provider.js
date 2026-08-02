import { env } from '../../config/env.js';
import { OtpDeliveryError } from './notification.types.js';
const PINGMATE_PROVIDER_NAME = 'pingmate';
const normalizeWhatsappRecipient = (mobileNumber) => mobileNumber.replace(/\D/g, '');
const buildCopyCodePayload = (otp) => `https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=otp${otp}`;
export class PingMateProvider {
    fetchFn;
    constructor(fetchFn = fetch) {
        this.fetchFn = fetchFn;
    }
    async sendOtp(input) {
        const startedAt = Date.now();
        const apiKey = env.pingmateApiKey;
        if (!apiKey) {
            throw new OtpDeliveryError('PingMate API key is not configured.', {
                provider: PINGMATE_PROVIDER_NAME,
                latencyMs: Date.now() - startedAt
            });
        }
        let response;
        try {
            response = await this.fetchFn(`${env.pingmateBaseUrl.replace(/\/+$/, '')}/messages/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                },
                body: JSON.stringify({
                    to: normalizeWhatsappRecipient(input.mobileNumber),
                    message: {
                        message_type: 'template',
                        template_name: env.pingmateTemplate,
                        template_language: env.pingmateLanguage,
                        body_variables: [input.otp],
                        buttons: [
                            {
                                button_type: 'url',
                                button_index: 0,
                                button_payload: buildCopyCodePayload(input.otp)
                            }
                        ]
                    }
                })
            });
        }
        catch {
            throw new OtpDeliveryError('PingMate delivery request failed.', {
                provider: PINGMATE_PROVIDER_NAME,
                latencyMs: Date.now() - startedAt
            });
        }
        const latencyMs = Date.now() - startedAt;
        if (!response.ok) {
            throw new OtpDeliveryError('PingMate rejected OTP delivery.', {
                provider: PINGMATE_PROVIDER_NAME,
                providerResponseCode: response.status,
                latencyMs
            });
        }
        return {
            status: 'sent',
            provider: PINGMATE_PROVIDER_NAME,
            providerResponseCode: response.status,
            latencyMs
        };
    }
}
export const createPingMateProvider = (fetchFn) => new PingMateProvider(fetchFn);
