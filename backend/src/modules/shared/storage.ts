export type StoredObjectMetadata = {
  contentType: string;
  byteLength: number;
  ownerClientId: string;
  originalFilename: string;
};

export type StoredObject = {
  objectRef: string;
  metadata: StoredObjectMetadata;
  createdAtISO: string;
};

export interface DocumentStorage {
  putObject(input: {
    bytes: Buffer;
    metadata: StoredObjectMetadata;
  }): Promise<StoredObject>;

  getObject(objectRef: string): Promise<{ bytes: Buffer; metadata: StoredObjectMetadata } | null>;

  deleteObject(objectRef: string): Promise<void>;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super('Secure document storage provider is not configured.');
    this.name = 'StorageNotConfiguredError';
  }
}
