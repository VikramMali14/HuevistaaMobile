import type { UserProfile } from "@/api/types";

/**
 * The name this person gave, or null. An account made from a mobile number or a code
 * carries a stand-in name until they type one (`namePending`) — never greet them with it.
 */
export function givenName(profile: Pick<UserProfile, "name" | "namePending"> | null | undefined): string | null {
  if (!profile || profile.namePending) return null;
  return profile.name?.trim() || null;
}
