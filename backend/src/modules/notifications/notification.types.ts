export type OtpDeliveryStatus = 'sent' | 'skipped';

export type OtpDeliveryResult = {
  status: OtpDeliveryStatus;
  provider: string;
  providerResponseCode?: number;
  latencyMs: number;
  providerRequestId?: string | null;
};

export type SendOtpInput = {
  challengeId: string;
  userId?: string | null;
  mobileNumber: string;
  otp: string;
};

export interface WhatsappProvider {
  sendOtp(input: SendOtpInput): Promise<OtpDeliveryResult>;
}

export class OtpDeliveryError extends Error {
  provider: string;
  providerResponseCode?: number;
  providerRequestId?: string | null;
  providerResponseBody?: string | null;
  latencyMs: number;

  constructor(message: string, params: { provider: string; providerResponseCode?: number; providerRequestId?: string | null; providerResponseBody?: string | null; latencyMs: number }) {
    super(message);
    this.name = 'OTP_DELIVERY_FAILED';
    this.provider = params.provider;
    this.providerResponseCode = params.providerResponseCode;
    this.providerRequestId = params.providerRequestId ?? null;
    this.providerResponseBody = params.providerResponseBody ?? null;
    this.latencyMs = params.latencyMs;
  }
}
