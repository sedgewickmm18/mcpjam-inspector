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
import {
  useConvexAuth as useNullConvexAuth,
  useQuery as useNullQuery,
  useMutation as useNullMutation,
  useAction as useNullAction,
  useConvexClient as useNullConvexClient,
} from "./null-convex-provider";

// Export the correct hooks based on mode
export const useConvexAuth = HOSTED_MODE
  ? useWorkOsConvexAuth
  : useNullConvexAuth;
export const useConvex = HOSTED_MODE ? useRealConvex : useNullConvexClient;
export const useQuery = HOSTED_MODE ? useRealQuery : useNullQuery;
export const useMutation = HOSTED_MODE ? useRealMutation : useNullMutation;
export const useAction = HOSTED_MODE ? useRealAction : useNullAction;

// Note: useConvexClient is not exported from convex/react
// If needed in the future, use useContext(ConvexClientContext) directly in hosted mode
export const useConvexClient = useNullConvexClient;
