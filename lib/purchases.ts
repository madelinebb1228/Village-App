// Web stub — react-native-purchases doesn't support web.
// Metro resolves purchases.native.ts for iOS/Android and this file for web.

type CustomerInfo = {
  entitlements: { active: Record<string, unknown> };
};

export const Purchases = {
  configure: (_config: { apiKey: string; appUserID?: string | null }) => {},
  setLogLevel: (_level: number) => {},
  getCustomerInfo: async (): Promise<CustomerInfo> => ({ entitlements: { active: {} } }),
  getOfferings: async () => ({ current: null as any }),
  purchasePackage: async (_pkg: unknown): Promise<never> => { throw { userCancelled: true }; },
  restorePurchases: async (): Promise<CustomerInfo> => ({ entitlements: { active: {} } }),
  addCustomerInfoUpdateListener: (_listener: (info: CustomerInfo) => void) => () => {},
};

export const LOG_LEVEL = { VERBOSE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4, SILENT: 5 };
