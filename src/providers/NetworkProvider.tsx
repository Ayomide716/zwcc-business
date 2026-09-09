/**
 * Connectivity, shared app-wide.
 *
 * Nigeria is the primary market and mobile data there is frequently slow or
 * absent. Without this, a failed request looks like a broken app rather than a
 * bad signal, and people retry, lose confidence, or abandon an application they
 * have already half filled in.
 *
 * `isInternetReachable` is deliberately preferred over `isConnected`: a phone
 * attached to a cell tower with no working data path reports connected but
 * cannot reach anything. It is tri-state, and null means "not yet determined" —
 * treated as online, because showing an offline warning during the first moment
 * of app start would be wrong far more often than right.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export interface NetworkStatus {
  /** False only when we are confident there is no usable connection. */
  isOnline: boolean;
  /** 'wifi', 'cellular', 'none', … — for copy that mentions mobile data. */
  connectionType: string | null;
  /**
   * True when the connection is one where large uploads should be discouraged.
   * NetInfo reports this on cellular; null elsewhere, and null means no.
   */
  isMetered: boolean;
}

const NetworkContext = createContext<NetworkStatus>({
  isOnline: true,
  connectionType: null,
  isMetered: false,
});

function toStatus(state: NetInfoState): NetworkStatus {
  return {
    isOnline: state.isInternetReachable !== false,
    connectionType: state.type ?? null,
    isMetered: state.type === 'cellular',
  };
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: true,
    connectionType: null,
    isMetered: false,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => setStatus(toStatus(state)));
    // The listener only fires on change, so the first state has to be fetched.
    void NetInfo.fetch().then((state) => setStatus(toStatus(state)));
    return unsubscribe;
  }, []);

  const value = useMemo(() => status, [status]);

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkStatus {
  return useContext(NetworkContext);
}
