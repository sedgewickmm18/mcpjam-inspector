/**
 * NullAuthKitProvider
 *
 * Provides a no-op WorkOS AuthKit context for local mode (HOSTED_MODE = false).
 *
 * This provider satisfies the useAuth() hook from @workos-inc/authkit-react
 * without making any network requests or connecting to WorkOS:
 *
 * - user: null
 * - isLoading: false
 * - getAccessToken: () => Promise.resolve(null)
 * - signIn: no-op function
 * - signOut: no-op function
 *
 * This eliminates:
 * - WorkOS 400 errors (token refresh failures)
 * - Network requests to api.mcpjam.com
 * - Auth state transitions that cause page vanishing
 */

import { createContext, useContext, type ReactNode } from "react";

/**
 * Null WorkOS User Object
 *
 * A minimal user object that satisfies the type expectations.
 */
const nullUser = null;

/**
 * Null WorkOS Auth Context
 *
 * Provides a no-op auth object that satisfies the WorkOS AuthKit
 * useAuth() hook interface without making any network requests.
 */
type NullAuthContextValue = {
  user: typeof nullUser;
  isLoading: boolean;
  isAuthenticated: boolean;
  getAccessToken: () => Promise<string | null>;
  signIn: () => void;
  signOut: () => void;
};

const NullAuthContext = createContext<NullAuthContextValue>({
  user: nullUser,
  isLoading: false,
  isAuthenticated: false,
  getAccessToken: () => Promise.resolve(null),
  signIn: () => {
    console.warn(
      "[NullAuthKit] signIn() called in local mode - this should not happen"
    );
  },
  signOut: () => {
    console.warn(
      "[NullAuthKit] signOut() called in local mode - this should not happen"
    );
  },
});

/**
 * NullAuthKitProvider Component
 *
 * Wrap your app with this provider in local mode to provide no-op
 * WorkOS AuthKit functionality without making network requests.
 */
export function NullAuthKitProvider({ children }: { children: ReactNode }) {
  return (
    <NullAuthContext.Provider
      value={{
        user: nullUser,
        isLoading: false,
        isAuthenticated: false,
        getAccessToken: () => Promise.resolve(null),
        signIn: () => {
          console.warn(
            "[NullAuthKit] signIn() called in local mode - this should not happen"
          );
        },
        signOut: () => {
          console.warn(
            "[NullAuthKit] signOut() called in local mode - this should not happen"
          );
        },
      }}
    >
      {children}
    </NullAuthContext.Provider>
  );
}

/**
 * Hook shim: useAuth
 *
 * Returns a no-op auth object that always indicates not authenticated.
 * This satisfies the WorkOS AuthKit useAuth() hook interface.
 */
export function useAuth() {
  return useContext(NullAuthContext);
}