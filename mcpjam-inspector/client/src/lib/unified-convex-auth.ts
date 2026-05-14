import { useEffect, useMemo, useState } from "react";
import { useAuth as useWorkOSAuth } from "@/lib/use-auth";
import { NON_PROD_LOCKDOWN } from "@/lib/config";
import {
  forceRefreshGuestSession,
  getCachedGuestSession,
  getOrCreateGuestSession,
} from "@/lib/guest-session";

// Track retry attempts globally to avoid cascading retries across remounts
let globalRetryCount = 0;
let lastRetryTime = 0;

/**
 * Stable hook fed to `<ConvexProviderWithAuthKit useAuth={...}>`.
 *
 * Returns the same shape as `@workos-inc/authkit-react`'s `useAuth`, but
 * substitutes a guest token + placeholder user when there is no signed-in
 * WorkOS user. This makes Convex authenticate guests through the same
 * provider chain as authed users — no separate `<GuestConvexAuthBridge>`,
 * no `client.setAuth` race, no guest-specific code paths in feature
 * surfaces.
 *
 * The Convex/workos adapter (`@convex-dev/workos`) only inspects `!!user`
 * to decide `isAuthenticated` and calls `getAccessToken()` to fetch the
 * bearer. `GUEST_USER_PLACEHOLDER` exists solely to satisfy that check
 * for guests; nothing reads its fields.
 */

const GUEST_USER_PLACEHOLDER = {
  __guest: true as const,
  id: "__guest__",
};

const GUEST_SESSION_BOOTSTRAP_RETRY_DELAYS_MS: readonly number[] = [500, 1500, 3000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useUnifiedConvexAuth() {
  const workos = useWorkOSAuth();
  const [guestToken, setGuestToken] = useState<string | null>(
    () => getCachedGuestSession()?.token ?? null,
  );
  const [guestLoading, setGuestLoading] = useState(
    () => getCachedGuestSession()?.token == null,
  );

  // Fetch a guest token whenever there is no signed-in WorkOS user. Reset
  // when a user does sign in so subsequent renders favor the WorkOS path.
  useEffect(() => {
    if (workos.isLoading) {
      return;
    }
    if (workos.user) {
      // Only clear guest token if we actually have a valid WorkOS user
      // This prevents the transition from guest → null → guest that causes flicker
      if (guestToken !== null) {
        console.log("[UnifiedAuth] WorkOS user signed in, clearing guest token");
        setGuestToken(null);
        setGuestLoading(false);
      }
      return;
    }

    // If we already have a guest token, don't clear it when WorkOS fails to refresh
    // This prevents the 400 error from causing a state transition
    if (guestToken && !getCachedGuestSession()?.token) {
      console.log("[UnifiedAuth] Restoring guest token from state (WorkOS refresh failed)");
      // Keep the existing guest token
      return;
    }
    // Non-prod lockdown blocks guest sessions: the gate will show "logged-out"
    // and any retry would just spam 403s. Settle as unauthenticated immediately.
    if (NON_PROD_LOCKDOWN) {
      setGuestToken(null);
      setGuestLoading(false);
      return;
    }

    let cancelled = false;
    // Only flip to loading if we have no cached token; if we do, the async
    // call will resolve immediately and setting true→false would cause the
    // very flicker the lazy initializer was designed to prevent.
    if (!getCachedGuestSession()?.token) {
      setGuestLoading(true);
    }

    const resolveGuestSession = async () => {
      for (
        let attempt = 0;
        attempt <= GUEST_SESSION_BOOTSTRAP_RETRY_DELAYS_MS.length;
        attempt += 1
      ) {
        let session: Awaited<ReturnType<typeof getOrCreateGuestSession>> =
          null;
        let isError429 = false;
        
        try {
          session = await getOrCreateGuestSession();
          // Reset global retry count on success
          globalRetryCount = 0;
          lastRetryTime = 0;
        } catch (error: unknown) {
          session = null;
          // Check if this is a 429 error
          isError429 = error instanceof Error && 
            error.message.includes("429") &&
            error.message.includes("Too Many Requests");
        }

        if (cancelled) return;
        if (
          session ||
          attempt === GUEST_SESSION_BOOTSTRAP_RETRY_DELAYS_MS.length
        ) {
          setGuestToken(session?.token ?? null);
          setGuestLoading(false);
          return;
        }

        // Calculate delay: use exponential backoff for 429 errors
        let delayMs = GUEST_SESSION_BOOTSTRAP_RETRY_DELAYS_MS[attempt];
        if (isError429) {
          globalRetryCount += 1;
          lastRetryTime = Date.now();
          // Exponential backoff: 2^attempt * 1000ms, but cap at 10 seconds
          delayMs = Math.min(Math.pow(2, attempt) * 1000, 10000);
          console.log(
            `[UnifiedAuth] 429 error detected, using exponential backoff: ${delayMs}ms (attempt ${attempt + 1})`
          );
        }

        await delay(delayMs);
        if (cancelled) return;
      }
    };

    void resolveGuestSession();

    return () => {
      cancelled = true;
    };
  }, [workos.isLoading, workos.user, guestToken]);

  return useMemo(() => {
    if (workos.user) {
      return {
        isLoading: workos.isLoading,
        user: workos.user,
        getAccessToken: workos.getAccessToken,
      };
    }

    return {
      isLoading: workos.isLoading || guestLoading,
      user: guestToken ? GUEST_USER_PLACEHOLDER : null,
      getAccessToken: async (
        opts?: { forceRefreshToken?: boolean },
      ): Promise<string | null> => {
        if (opts?.forceRefreshToken) {
          const refreshed = await forceRefreshGuestSession();
          setGuestToken(refreshed);
          return refreshed;
        }
        // Prefer the latest in-memory cache so a fresh token is used even
        // if React hasn't yet re-rendered with the new state.
        const cached = getCachedGuestSession()?.token ?? guestToken;
        return cached ?? null;
      },
    };
  }, [
    workos.isLoading,
    workos.user,
    workos.getAccessToken,
    guestToken,
    guestLoading,
  ]);
}
