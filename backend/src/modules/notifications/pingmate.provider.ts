import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { OtpDeliveryError, type OtpDeliveryResult, type SendOtpInput, type WhatsappProvider } from './notification.types.js';
import { normalizeCanonicalPhoneNumber } from '../../utils/phone.js';

type FetchLike = typeof fetch;

const PINGMATE_PROVIDER_NAME = 'pingmate';

const PINGMATE_COPY_CODE_BUTTON_PAYLOAD_PREFIX = 'https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=otp';

const buildCopyCodePayload = (otp: string) => `${PINGMATE_COPY_CODE_BUTTON_PAYLOAD_PREFIX}${otp}`;

const providerRequestIdHeaders = [
  'x-request-id',
  'x-correlation-id',
  'x-pingmate-request-id',
  'cf-ray'
];

const getProviderRequestId = (response: Response) => {
  for (const header of providerRequestIdHeaders) {
    const value = response.headers.get(header);
    if (value) return value;
  }
  return null;
};

const sanitizeProviderBody = (body: string, input: SendOtpInput) => {
  const normalizedPhone = normalizeCanonicalPhoneNumber(input.mobileNumber);
  return body
    .replaceAll(input.otp, '[REDACTED_OTP]')
    .replaceAll(input.mobileNumber, '[REDACTED_PHONE]')
    .replaceAll(normalizedPhone, '[REDACTED_PHONE]');
};

const sanitizePayload = (payload: unknown, input: SendOtpInput) =>
  JSON.parse(sanitizeProviderBody(JSON.stringify(payload), input));

const parseProviderResponseSummary = (body: string) => {
  try {
    const parsed = JSON.parse(body) as {
      success?: boolean;
      status?: string;
      error?: { code?: string; message?: string };
      code?: string;
      message?: string;
    };
    return {
      status: parsed.status ?? (parsed.success === true ? 'success' : parsed.success === false ? 'failed' : undefined),
      error_code: parsed.error?.code ?? parsed.code,
      message: parsed.error?.message ?? parsed.message
    };
  } catch {
    return {
      status: undefined,
      error_code: undefined,
      message: body || undefined
    };
  }
};

const logPingMateRequest = (details: Record<string, unknown>) => {
  console.info('PingMate OTP request', details);
};

const logPingMateResponse = (details: Record<string, unknown>) => {
  console.info('PingMate OTP response', details);
};

const logPingMateFailure = (details: Record<string, unknown>) => {
  console.warn('PingMate OTP failure', details);
};

export class PingMateProvider implements WhatsappProvider {
  private readonly fetchFn: FetchLike;

  constructor(fetchFn: FetchLike = fetch) {
    this.fetchFn = fetchFn;
  }

  async sendOtp(input: SendOtpInput): Promise<OtpDeliveryResult> {
    const startedAt = Date.now();
    const correlationId = crypto.randomUUID();
    const apiKey = env.pingmateApiKey;
    const configuredBaseUrl = env.pingmateBaseUrl.replace(/\/+$/, '');
    const requestUrl = configuredBaseUrl.endsWith('/messages/send')
      ? configuredBaseUrl
      : `${configuredBaseUrl}/messages/send`;
    const normalizedRecipient = normalizeCanonicalPhoneNumber(input.mobileNumber);
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
      buttonPayloadShape: 'whatsapp_copy_code_url_with_otp',
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

    let response: Response;
    try {
      response = await this.fetchFn(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify(requestPayload)
      });
    } catch (error) {
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

export const createPingMateProvider = (fetchFn?: FetchLike) => new PingMateProvider(fetchFn);
