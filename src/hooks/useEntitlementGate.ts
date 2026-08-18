import { useCallback, useState } from 'react';
import { RootStackParamList } from '../navigation/types';
import {
  EntitlementCode,
  PremiumSource,
  getCurrentSubscription,
  hasEntitlement
} from '../services/subscriptionService';

type Navigation = {
  navigate<RouteName extends keyof RootStackParamList>(
    ...args: undefined extends RootStackParamList[RouteName]
      ? [screen: RouteName] | [screen: RouteName, params: RootStackParamList[RouteName]]
      : [screen: RouteName, params: RootStackParamList[RouteName]]
  ): void;
};

export const useEntitlementGate = (navigation: Navigation) => {
  const [checkingEntitlement, setCheckingEntitlement] = useState(false);

  const requireEntitlement = useCallback(
    async ({
      source,
      entitlement,
      returnDestination,
      onAllowed
    }: {
      source: PremiumSource;
      entitlement: EntitlementCode;
      returnDestination: keyof RootStackParamList;
      onAllowed: () => void | Promise<void>;
    }) => {
      setCheckingEntitlement(true);
      try {
        const subscription = await getCurrentSubscription();
        if (hasEntitlement(subscription, entitlement)) {
          await onAllowed();
          return true;
        }
      } catch {
        // Network or auth failures should not open premium surfaces without server confirmation.
      } finally {
        setCheckingEntitlement(false);
      }

      navigation.navigate('SubscriptionPlans', {
        source,
        requiredEntitlement: entitlement,
        returnDestination
      });
      return false;
    },
    [navigation]
  );

  return { checkingEntitlement, requireEntitlement };
};
