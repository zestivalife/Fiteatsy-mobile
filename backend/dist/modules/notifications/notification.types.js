export class OtpDeliveryError extends Error {
    provider;
    providerResponseCode;
    providerRequestId;
    providerResponseBody;
    latencyMs;
    constructor(message, params) {
        super(message);
        this.name = 'OTP_DELIVERY_FAILED';
        this.provider = params.provider;
        this.providerResponseCode = params.providerResponseCode;
        this.providerRequestId = params.providerRequestId ?? null;
        this.providerResponseBody = params.providerResponseBody ?? null;
        this.latencyMs = params.latencyMs;
    }
}
