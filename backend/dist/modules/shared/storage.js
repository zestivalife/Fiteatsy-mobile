export class StorageNotConfiguredError extends Error {
    constructor() {
        super('Secure document storage provider is not configured.');
        this.name = 'StorageNotConfiguredError';
    }
}
