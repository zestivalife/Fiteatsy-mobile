import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../backend/src/server.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';

export type TestServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

export const startTestServer = async (): Promise<TestServer> => {
  const app = createApp();
  const server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
};

export const resetTestState = () => {
  resetBackendStateForTests();
};
