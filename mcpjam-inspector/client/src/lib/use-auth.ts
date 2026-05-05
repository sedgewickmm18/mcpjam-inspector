/**
 * Conditional Auth Hook Export
 *
 * Exports the correct useAuth hook based on HOSTED_MODE:
 * - Local mode: useAuth from NullAuthKitProvider (no network requests)
 * - Hosted mode: useAuth from @workos-inc/authkit-react (real auth)
 */

import { HOSTED_MODE } from "./config";

// Import both implementations
import { useAuth as useWorkOsAuth } from "@workos-inc/authkit-react";
import { useAuth as useNullAuth } from "./null-authkit-provider";

// Export the correct one based on mode
export const useAuth = HOSTED_MODE ? useWorkOsAuth : useNullAuth;
