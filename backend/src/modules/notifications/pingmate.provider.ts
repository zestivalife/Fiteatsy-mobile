import { env } from '../../config/env.js';
import { OtpDeliveryError, type OtpDeliveryResult, type SendOtpInput, type WhatsappProvider } from './notification.types.js';

type FetchLike = typeof fetch;

const PINGMATE_PROVIDER_NAME = 'pingmate';

const normalizeWhatsappRecipient = (mobileNumber: string) => mobileNumber.replace(/\D/g, '');

const buildCopyCodePayload = (otp: string) =>
  `https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=otp${otp}`;

export class PingMateProvider implements WhatsappProvider {
  private readonly fetchFn: FetchLike;

  constructor(fetchFn: FetchLike = fetch) {
    this.fetchFn = fetchFn;
  }

  async sendOtp(input: SendOtpInput): Promise<OtpDeliveryResult> {
    const startedAt = Date.now();
    const apiKey = env.pingmateApiKey;
    if (!apiKey) {
      throw new OtpDeliveryError('PingMate API key is not configured.', {
        provider: PINGMATE_PROVIDER_NAME,
        latencyMs: Date.now() - startedAt
      });
    }

    let response: Response;
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
    } catch {
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

export const createPingMateProvider = (fetchFn?: FetchLike) => new PingMateProvider(fetchFn);
