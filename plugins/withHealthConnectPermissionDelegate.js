const { withMainActivity } = require('@expo/config-plugins');

const DELEGATE_IMPORT =
  'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const DELEGATE_REGISTRATION =
  'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

const withHealthConnectPermissionDelegate = config =>
  withMainActivity(config, modConfig => {
    if (modConfig.modResults.language !== 'kt') {
      throw new Error('Health Connect permission delegate requires MainActivity.kt');
    }

    let contents = modConfig.modResults.contents;

    if (!contents.includes(DELEGATE_IMPORT)) {
      const importAnchor =
        'import com.facebook.react.defaults.DefaultReactActivityDelegate';
      if (!contents.includes(importAnchor)) {
        throw new Error('Unable to locate the MainActivity import anchor');
      }
      contents = contents.replace(importAnchor, `${importAnchor}\n${DELEGATE_IMPORT}`);
    }

    if (!contents.includes(DELEGATE_REGISTRATION)) {
      const onCreateAnchor = 'super.onCreate(null)';
      if (!contents.includes(onCreateAnchor)) {
        throw new Error('Unable to locate MainActivity.onCreate initialization');
      }
      contents = contents.replace(
        onCreateAnchor,
        `${onCreateAnchor}\n    ${DELEGATE_REGISTRATION}`
      );
    }

    modConfig.modResults.contents = contents;
    return modConfig;
  });

module.exports = withHealthConnectPermissionDelegate;
