import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { OtpDeliveryError } from './notification.types.js';
import { normalizeCanonicalPhoneNumber } from '../../utils/phone.js';
const PINGMATE_PROVIDER_NAME = 'pingmate';
const buildCopyCodePayload = (otp) => otp;
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
    const normalizedPhone = normalizeCanonicalPhoneNumber(input.mobileNumber);
    return body
        .replaceAll(input.otp, '[REDACTED_OTP]')
        .replaceAll(input.mobileNumber, '[REDACTED_PHONE]')
        .replaceAll(normalizedPhone, '[REDACTED_PHONE]');
};
const sanitizePayload = (payload, input) => JSON.parse(sanitizeProviderBody(JSON.stringify(payload), input));
const parseProviderResponseSummary = (body) => {
    try {
        const parsed = JSON.parse(body);
        return {
            status: parsed.status ?? (parsed.success === true ? 'success' : parsed.success === false ? 'failed' : undefined),
            error_code: parsed.error?.code ?? parsed.code,
            message: parsed.error?.message ?? parsed.message
        };
    }
    catch {
        return {
            status: undefined,
            error_code: undefined,
            message: body || undefined
        };
    }
};
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
        const configuredBaseUrl = env.pingmateBaseUrl.replace(/\/+$/, '');
        const requestUrl = configuredBaseUrl.endsWith('/messages/send')
            ? configuredBaseUrl
            : `${configuredBaseUrl}/messages/send`;
        const normalizedRecipient = normalizeCanonicalPhoneNumber(input.mobileNumber);
        if (!/^[0-9]+$/.test(normalizedRecipient)) {
            throw new OtpDeliveryError('OTP recipient must use the canonical digits-only phone format.', {
                provider: PINGMATE_PROVIDER_NAME,
                latencyMs: Date.now() - startedAt
            });
        }
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
        const sanitizedOutgoingPayload = {
            to: '[REDACTED_PHONE]',
            template_name: requestPayload.message.template_name,
            template_language: requestPayload.message.template_language,
            body_variables_count: requestPayload.message.body_variables.length,
            buttons_present: requestPayload.message.buttons.length > 0
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
            buttonPayloadShape: 'otp_digits_only',
            sanitizedOutgoingPayload,
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
        const providerResponse = parseProviderResponseSummary(sanitizedResponseBody);
        const responseSummary = {
            correlationId,
            requestUrl,
            httpMethod: 'POST',
            httpStatus: response.status,
            status: providerResponse.status,
            error_code: providerResponse.error_code,
            message: providerResponse.message,
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
