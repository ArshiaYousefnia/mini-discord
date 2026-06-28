import { apiRequest } from "./api";
import type { UserProfile } from "../types/user";
import type { BackendUserProfile } from "../types/user";

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const data = await apiRequest<BackendUserProfile>(
    `/api/users/${userId}/profile/`
  );

  return {
    id: data.id,
    username: data.username,
    display_name: data.display_name,
    bio: data.bio,
    avatar: data.avatar_url,
    is_online: data.is_online,
  };
}
