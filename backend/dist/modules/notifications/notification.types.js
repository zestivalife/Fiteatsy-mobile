export class OtpDeliveryError extends Error {
    provider;
    providerResponseCode;
    latencyMs;
    constructor(message, params) {
        super(message);
        this.name = 'OTP_DELIVERY_FAILED';
        this.provider = params.provider;
        this.providerResponseCode = params.providerResponseCode;
        this.latencyMs = params.latencyMs;
    }
}
