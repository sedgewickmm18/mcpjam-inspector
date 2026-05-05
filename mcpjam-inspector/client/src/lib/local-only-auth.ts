/**
 * Local-Only Auth Adapter
 *
 * A simplified auth adapter for local development that skips WorkOS entirely
 * and only uses guest authentication. This prevents the WorkOS token refresh
 * from failing with 400 and triggering unnecessary re-authentication cascades.
 *
 * Use this as the `useAuth` prop for `ConvexProviderWithAuthKit` when
 * `HOSTED_MODE = false`.
 */

import { useEffect, useMemo, useState } from "react";
import {
  getCachedGuestSession,
  getOrCreateGuestSession,
} from "@/lib/guest-session";

const GUEST_USER_PLACEHOLDER = {
  __guest: true as const,
  id: "__guest__",
};

/**
 * Local-only auth hook that only uses guest sessions.
 * This provides the same interface as `useWorkOSAuth` but without
 * any WorkOS dependency.
 */
export function useLocalOnlyAuth() {
  const [guestToken, setGuestToken] = useState<string | null>(
    () => getCachedGuestSession()?.token ?? null,
  );
  const [guestLoading, setGuestLoading] = useState(
    () => getCachedGuestSession()?.token == null,
  );

  // Fetch a guest token on mount if not already cached
  useEffect(() => {
    // If we already have a cached token, we're ready
    const cached = getCachedGuestSession();
    if (cached?.token) {
      console.log("[LocalOnlyAuth] Using cached guest token");
      return;
    }

    console.log("[LocalOnlyAuth] No cached token, fetching...");
    let cancelled = false;
    setGuestLoading(true);

    const resolveGuestSession = async () => {
      try {
        console.log("[LocalOnlyAuth] Calling getOrCreateGuestSession...");
        const session = await getOrCreateGuestSession();
        console.log("[LocalOnlyAuth] Guest session response:", session);
        if (!cancelled) {
          setGuestToken(session?.token ?? null);
          console.log("[LocalOnlyAuth] Guest token set:", !!session?.token);
        }
      } catch (error) {
        console.error("[LocalOnlyAuth] Failed to create guest session:", error);
      } finally {
        if (!cancelled) {
          setGuestLoading(false);
          console.log("[LocalOnlyAuth] Guest loading complete");
        }
      }
    };

    void resolveGuestSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    return {
      isLoading: guestLoading,
      user: guestToken ? GUEST_USER_PLACEHOLDER : null,
      getAccessToken: async (): Promise<string | null> => {
        // Prefer the latest in-memory cache
        const cached = getCachedGuestSession()?.token ?? guestToken;
        return cached ?? null;
      },
    };
  }, [guestToken, guestLoading]);
}