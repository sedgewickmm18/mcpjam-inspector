/**
 * NullConvexProvider
 *
 * Provides a no-op Convex context for local mode (HOSTED_MODE = false).
 *
 * This provider satisfies all Convex React hooks without making any
 * network requests or connecting to a Convex server:
 *
 * - useConvexAuth() → { isAuthenticated: false, isLoading: false }
 * - useQuery() → always returns undefined
 * - useMutation() → returns no-op function
 * - useConvexClient() → returns a client that never connects
 *
 * This eliminates:
 * - Convex server errors (e.g., billing:getCreditBalance)
 * - Network requests to Convex
 * - Page vanishing due to auth/loading states
 */

import { createContext, useContext, type ReactNode } from "react";

/**
 * Null Convex Auth Context
 *
 * Provides a no-op auth object that satisfies the useConvexAuth hook
 * interface without making any network requests.
 */
const NullConvexAuthContext = createContext({
  isAuthenticated: false,
  isLoading: false,
});

/**
 * Null Convex Client
 *
 * A mock client object that satisfies the Convex client interface
 * but does nothing. This prevents components from crashing when they
 * try to access client methods.
 */
const nullConvexClient = {
  // Stub methods - these should never be called in local mode
  query: () => {
    console.warn(
      "[NullConvexClient] Query called in local mode - this should not happen"
    );
    return undefined;
  },
  mutation: () => {
    console.warn(
      "[NullConvexClient] Mutation called in local mode - this should not happen"
    );
    return () => Promise.resolve(undefined);
  },
  action: () => {
    console.warn(
      "[NullConvexClient] Action called in local mode - this should not happen"
    );
    return undefined;
  },
};

/**
 * Null Convex Context
 *
 * Provides the null client and auth context to all child components.
 */
type NullConvexContextValue = {
  client: typeof nullConvexClient;
  auth: { isAuthenticated: boolean; isLoading: false };
};

const NullConvexContext = createContext<NullConvexContextValue>({
  client: nullConvexClient,
  auth: { isAuthenticated: false, isLoading: false },
});

/**
 * NullConvexProvider Component
 *
 * Wrap your app with this provider in local mode to provide no-op
 * Convex functionality without making network requests.
 */
export function NullConvexProvider({ children }: { children: ReactNode }) {
  return (
    <NullConvexContext.Provider
      value={{
        client: nullConvexClient,
        auth: { isAuthenticated: false, isLoading: false },
      }}
    >
      <NullConvexAuthContext.Provider
        value={{ isAuthenticated: false, isLoading: false }}
      >
        {children}
      </NullConvexAuthContext.Provider>
    </NullConvexContext.Provider>
  );
}

/**
 * Custom hook to access the null Convex context
 * This is used internally by the hook shims below
 */
function useNullConvexContext() {
  const context = useContext(NullConvexContext);
  if (!context) {
    throw new Error(
      "useNullConvexContext must be used within a NullConvexProvider"
    );
  }
  return context;
}

/**
 * Hook shim: useConvexClient
 *
 * Returns the null client. Components that need the client for
 * operations won't crash, but won't do anything useful either.
 */
export function useConvexClient() {
  return nullConvexClient;
}

/**
 * Hook shim: useConvexAuth
 *
 * Returns a no-op auth object that always indicates not authenticated.
 */
export function useConvexAuth() {
  return useContext(NullConvexAuthContext);
}

/**
 * Hook shim: useQuery
 *
 * Always returns undefined for any query. Components should handle
 * this gracefully by checking for undefined before rendering.
 */
export function useQuery<T = unknown>(
  _name: any,
  _args?: any,
  _options?: any
): T | undefined {
  // Return undefined to indicate "no data available"
  return undefined as any;
}

/**
 * Hook shim: useMutation
 *
 * Returns a no-op mutation function that matches the real Convex signature.
 * In real Convex, useMutation takes a FunctionReference and returns a callable.
 * In null mode, we accept any type and return a no-op function.
 */
export function useMutation(_name: any): any {
  // Return a no-op function that can be called with any arguments
  const mutation = (..._args: any[]) => {
    console.warn(
      `[NullConvexClient] Mutation called in local mode - returning no-op`
    );
    return Promise.resolve(undefined);
  };
  return mutation;
}

/**
 * Hook shim: useAction
 *
 * Always returns undefined for any action.
 */
export function useAction<T = unknown>(
  _name: string,
  _args?: any
): T | undefined {
  return undefined as any;
}