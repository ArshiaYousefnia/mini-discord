import api from "./api";
import type { UserProfile, UserSearchResult } from "../types/user";

/**
 * Search strictly by username.
 * Assumes backend supports:
 * GET /api/users/search/?username=<value>
 *
 * Kept for backwards compatibility with any other callers. New code (the
 * sidebar's global search) should prefer `searchGlobal` below, which also
 * understands channel public-ID results.
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

// ---------------------------------------------------------------------------
// Task #55 — Join a Channel with Public ID (global search bar)
// ---------------------------------------------------------------------------

export interface ChannelSearchResult {
  id: string;
  name: string;
  avatar_url?: string | null;
  description?: string | null;
  public_id: string;
  is_private?: boolean;
}

export type GlobalSearchResult =
  | { kind: "user"; data: UserSearchResult }
  | { kind: "channel"; data: ChannelSearchResult };

/**
 * Generalized global search used by the sidebar's "@..." search bar.
 *
 * The endpoint (`GET /api/users/search/`) stays the same and is shared
 * between user search and channel public-ID search per Task #55. The
 * previous implementation (`searchUserByUsername`) assumed every result was
 * a user and looked for a `username` field on it — which is exactly why
 * channel public-ID search was reported as always returning "not found":
 * a channel result has no `username` field, so it never matched.
 *
 * This function instead inspects each raw result and classifies it as a
 * "user" or "channel" result based on its shape:
 *   - user results have a `username` field
 *   - channel results have a `public_id` field (and no `username`)
 * If your backend actually tags results with an explicit `type` field,
 * this will also respect that.
 */
export async function searchGlobal(query: string): Promise<GlobalSearchResult[]> {
  const normalized = query.trim();
  if (!normalized) return [];

  const response = await api.get("/api/users/search/", {
    params: {
      username: normalized,
    },
  });

  const data = response.data;
  if (!data) return [];

  const rawResults: any[] = Array.isArray(data) ? data : [data];

  return rawResults.filter(Boolean).map((item: any): GlobalSearchResult => {
    const looksLikeChannel =
      item.public_id !== undefined ||
      item.type === "CHANNEL" ||
      (item.username === undefined && item.name !== undefined);

    if (looksLikeChannel) {
      return { kind: "channel", data: item as ChannelSearchResult };
    }
    return { kind: "user", data: item as UserSearchResult };
  });
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const response = await api.get(`/users/${userId}/profile/`);
  return response.data;
}
