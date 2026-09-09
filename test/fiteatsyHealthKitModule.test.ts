const loadBridge = (platform: 'ios' | 'android', native: Record<string, jest.Mock> | null) => {
  jest.resetModules();
  const requireOptionalNativeModule = jest.fn(() => native);
  jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
  jest.doMock('expo-modules-core', () => ({ requireOptionalNativeModule }));
  let bridge: typeof import('../modules/fiteatsy-healthkit');
  jest.isolateModules(() => { bridge = require('../modules/fiteatsy-healthkit'); });
  return { bridge: bridge!, requireOptionalNativeModule };
};

const availableNative = () => ({
  isAvailable: jest.fn().mockResolvedValue(true),
  requestAuthorization: jest.fn().mockResolvedValue({ grantedScopes: ['steps'] }),
  readChanges: jest.fn().mockResolvedValue({ samples: [], deletedIds: [], anchor: '' }),
  enableBackgroundDelivery: jest.fn().mockResolvedValue(true),
});

describe('FiteatsyHealthKit bridge startup safety', () => {
  afterEach(() => jest.clearAllMocks());

  it('never resolves the HealthKit native module during Android bootstrap', async () => {
    const { bridge, requireOptionalNativeModule } = loadBridge('android', availableNative());
    expect(requireOptionalNativeModule).not.toHaveBeenCalled();
    await expect(bridge.isHealthKitAvailable()).resolves.toBe(false);
    expect(requireOptionalNativeModule).not.toHaveBeenCalled();
  });

  it('keeps iOS bootstrap alive when the native module is unavailable', async () => {
    const { bridge } = loadBridge('ios', null);
    await expect(bridge.isHealthKitAvailable()).resolves.toBe(false);
    await expect(bridge.enableHealthKitBackgroundDelivery(['steps'])).resolves.toBe(false);
  });

  it('resolves the exact native identity without requesting permission at bootstrap', async () => {
    const native = availableNative();
    const { bridge, requireOptionalNativeModule } = loadBridge('ios', native);
    expect(native.requestAuthorization).not.toHaveBeenCalled();
    await expect(bridge.isHealthKitAvailable()).resolves.toBe(true);
    expect(requireOptionalNativeModule).toHaveBeenCalledWith('FiteatsyHealthKit');
    expect(native.requestAuthorization).not.toHaveBeenCalled();
    await expect(bridge.requestHealthKitAuthorization(['steps'])).resolves.toEqual({ grantedScopes: ['steps'] });
    expect(native.requestAuthorization).toHaveBeenCalledTimes(1);
  });

  it('fails permission requests explicitly without crashing when unavailable', async () => {
    const { bridge } = loadBridge('ios', null);
    await expect(bridge.requestHealthKitAuthorization(['steps']))
      .rejects.toThrow('FITEATSY_HEALTHKIT_NATIVE_MODULE_MISSING');
  });
});
