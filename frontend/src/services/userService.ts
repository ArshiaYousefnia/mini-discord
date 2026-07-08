import api from "./api";
import type { UserProfile, UserSearchResult } from "../types/user";

/**
 * Search strictly by username.
 * Assumes backend supports:
 * GET /api/users/search/?username=<value>
 */
export async function searchUserByUsername(username: string): Promise<UserSearchResult | null> {
  const normalized = username.trim();

  if (!normalized) return null;

  const response = await api.get("/api/users/search/", {
    params: {
      username: normalized,
    },
  });

  const data = response.data;

  /**
   * Because the schema is unclear, backend may return:
   * - one object
   * - array of users
   *
   * We normalize both cases.
   */
  if (!data) return null;

  if (Array.isArray(data)) {
    const match = data.find(
      (user) => user?.username?.toLowerCase() === normalized.toLowerCase()
    );
    return match ?? null;
  }

  if (
    data.username &&
    data.username.toLowerCase() === normalized.toLowerCase()
  ) {
    return data as UserSearchResult;
  }

  return null;
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const response = await api.get(`/users/${userId}/profile/`);
  return response.data;
}
