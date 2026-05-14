/**
 * Conditional Convex Hook Export
 *
 * Exports the correct Convex hooks based on HOSTED_MODE:
 * - Local mode: hooks from NullConvexProvider (no network requests)
 * - Hosted mode: hooks from convex/react (real Convex)
 */

import { HOSTED_MODE } from "./config";

// Import both implementations
import {
  useConvexAuth as useWorkOsConvexAuth,
  useConvex as useRealConvex,
  useQuery as useRealQuery,
  useMutation as useRealMutation,
  useAction as useRealAction,
} from "convex/react";
import { ConvexError as RealConvexError } from "convex/values";
import {
  useConvexAuth as useNullConvexAuth,
  useQuery as useNullQuery,
  useMutation as useNullMutation,
  useAction as useNullAction,
  useConvexClient as useNullConvexClient,
} from "./null-convex-provider";

// Stub ConvexError for local mode (no network)
// Note: Real ConvexError accepts data first, then optional message override
class NullConvexError extends Error {
  data?: unknown;
  constructor(data: unknown, message?: string) {
    const dataMessage = typeof data === "string" ? data : undefined;
    super(message ?? dataMessage ?? "ConvexError");
    this.name = "ConvexError";
    this.data = data;
  }
}

// Export the correct hooks based on mode
// Note: Type assertions are used to ensure compatibility between real and null implementations
export const useConvexAuth = HOSTED_MODE
  ? useWorkOsConvexAuth
  : useNullConvexAuth;
export const useConvex = HOSTED_MODE ? useRealConvex : useNullConvexClient;
export const useQuery = HOSTED_MODE ? useRealQuery : useNullQuery;
export const useMutation = HOSTED_MODE ? useRealMutation : useNullMutation;
export const useAction = HOSTED_MODE ? useRealAction : useNullAction as any;

// Note: useConvexClient is not exported from convex/react
// If needed in the future, use useContext(ConvexClientContext) directly in hosted mode
export const useConvexClient = useNullConvexClient;

// Export ConvexError conditionally
export const ConvexError = HOSTED_MODE ? RealConvexError : NullConvexError;
