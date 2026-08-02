import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { OtpDeliveryError } from './notification.types.js';
const PINGMATE_PROVIDER_NAME = 'pingmate';
const normalizeWhatsappRecipient = (mobileNumber) => mobileNumber.replace(/\D/g, '');
const buildCopyCodePayload = (otp) => `otp${otp}`;
const providerRequestIdHeaders = [
    'x-request-id',
    'x-correlation-id',
    'x-pingmate-request-id',
    'cf-ray'
];
const getProviderRequestId = (response) => {
    for (const header of providerRequestIdHeaders) {
        const value = response.headers.get(header);
        if (value)
            return value;
    }
    return null;
};
const sanitizeProviderBody = (body, input) => {
    const normalizedPhone = normalizeWhatsappRecipient(input.mobileNumber);
    return body
        .replaceAll(input.otp, '[REDACTED_OTP]')
        .replaceAll(input.mobileNumber, '[REDACTED_PHONE]')
        .replaceAll(normalizedPhone, '[REDACTED_PHONE]');
};
const sanitizePayload = (payload, input) => JSON.parse(sanitizeProviderBody(JSON.stringify(payload), input));
const logPingMateRequest = (details) => {
    console.info('PingMate OTP request', details);
};
const logPingMateResponse = (details) => {
    console.info('PingMate OTP response', details);
};
const logPingMateFailure = (details) => {
    console.warn('PingMate OTP failure', details);
};
export class PingMateProvider {
    fetchFn;
    constructor(fetchFn = fetch) {
        this.fetchFn = fetchFn;
    }
    async sendOtp(input) {
        const startedAt = Date.now();
        const correlationId = crypto.randomUUID();
        const apiKey = env.pingmateApiKey;
        const baseUrl = env.pingmateBaseUrl.replace(/\/+$/, '');
        const requestUrl = `${baseUrl}/messages/send`;
        const normalizedRecipient = normalizeWhatsappRecipient(input.mobileNumber);
        const requestPayload = {
            to: normalizedRecipient,
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
        };
        const requestSummary = {
            correlationId,
            requestUrl,
            httpMethod: 'POST',
            apiKeyConfigured: Boolean(apiKey),
            baseUrlConfigured: Boolean(env.pingmateBaseUrl),
            template: env.pingmateTemplate,
            language: env.pingmateLanguage,
            recipientFormat: 'digits_only',
            recipientLength: normalizedRecipient.length,
            bodyVariableCount: 1,
            buttonCount: 1,
            buttonType: 'url',
            buttonIndex: 0,
            buttonPayloadShape: 'otp[REDACTED_OTP]',
            outboundRequestBody: JSON.stringify(sanitizePayload(requestPayload, input))
        };
        logPingMateRequest(requestSummary);
        if (!apiKey) {
            logPingMateFailure({
                ...requestSummary,
                latencyMs: Date.now() - startedAt,
                failure: 'missing_api_key'
            });
            throw new OtpDeliveryError('PingMate API key is not configured.', {
                provider: PINGMATE_PROVIDER_NAME,
                latencyMs: Date.now() - startedAt
            });
        }
        let response;
        try {
            response = await this.fetchFn(requestUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                },
                body: JSON.stringify(requestPayload)
            });
        }
        catch (error) {
            const latencyMs = Date.now() - startedAt;
            logPingMateFailure({
                ...requestSummary,
                latencyMs,
                failure: 'network_or_fetch_error',
                errorMessage: error instanceof Error ? error.message : 'Unknown fetch error'
            });
            throw new OtpDeliveryError('PingMate delivery request failed.', {
                provider: PINGMATE_PROVIDER_NAME,
                latencyMs
            });
        }
        const latencyMs = Date.now() - startedAt;
        const providerRequestId = getProviderRequestId(response);
        const responseBody = await response.text();
        const sanitizedResponseBody = sanitizeProviderBody(responseBody, input);
        const responseSummary = {
            correlationId,
            requestUrl,
            httpMethod: 'POST',
            httpStatus: response.status,
            providerRequestId,
            providerResponseBody: sanitizedResponseBody,
            latencyMs
        };
        logPingMateResponse(responseSummary);
        if (!response.ok) {
            throw new OtpDeliveryError('PingMate rejected OTP delivery.', {
                provider: PINGMATE_PROVIDER_NAME,
                providerResponseCode: response.status,
                providerRequestId,
                providerResponseBody: sanitizedResponseBody,
                latencyMs
            });
        }
        return {
            status: 'sent',
            provider: PINGMATE_PROVIDER_NAME,
            providerResponseCode: response.status,
            providerRequestId,
            latencyMs
        };
    }
}
export const createPingMateProvider = (fetchFn) => new PingMateProvider(fetchFn);
