export type OtpDeliveryStatus = 'sent' | 'skipped';

export type OtpDeliveryResult = {
  status: OtpDeliveryStatus;
  provider: string;
  providerResponseCode?: number;
  latencyMs: number;
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
  latencyMs: number;

  constructor(message: string, params: { provider: string; providerResponseCode?: number; latencyMs: number }) {
    super(message);
    this.name = 'OTP_DELIVERY_FAILED';
    this.provider = params.provider;
    this.providerResponseCode = params.providerResponseCode;
    this.latencyMs = params.latencyMs;
  }
}
