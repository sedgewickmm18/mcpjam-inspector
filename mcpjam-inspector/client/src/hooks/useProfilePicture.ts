import { useAuth } from "@/lib/use-auth";
import { useQuery } from "@/lib/use-convex";

/**
 * Centralized hook for getting the current user's profile picture URL.
 * Uses custom uploaded picture from Convex if available, otherwise falls back to WorkOS.
 */
export function useProfilePicture() {
  const { user } = useAuth();
  const convexUser = useQuery("users:getCurrentUser" as any);

  // Priority: Custom uploaded picture > WorkOS picture > undefined
  const profilePictureUrl =
    convexUser?.profilePictureUrl || user?.profilePictureUrl || undefined;

  return {
    profilePictureUrl,
    isLoading: convexUser === undefined,
  };
}
