import { Linking, PermissionsAndroid, Platform, type Permission } from 'react-native';

export type WearablePermissionResult = {
  granted: boolean;
  deniedPermissions: string[];
};

const androidWearablePermissions = [
  PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
  PermissionsAndroid.PERMISSIONS.BODY_SENSORS,
  PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
].filter((value): value is Permission => typeof value === 'string');

export const requestWearablePermissions = async (): Promise<WearablePermissionResult> => {
  if (Platform.OS !== 'android') {
    return { granted: true, deniedPermissions: [] };
  }

  const result = await PermissionsAndroid.requestMultiple(androidWearablePermissions);
  const deniedPermissions = Object.entries(result)
    .filter(([, status]) => status !== PermissionsAndroid.RESULTS.GRANTED)
    .map(([permission]) => permission);

  return {
    granted: deniedPermissions.length === 0,
    deniedPermissions
  };
};

export const openSystemAppSettings = async (): Promise<void> => {
  await Linking.openSettings();
};
