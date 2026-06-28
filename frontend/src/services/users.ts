import api from "./api";

export type UserProfile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  is_online: boolean;
};

export const getUserProfile = async (userId: string): Promise<UserProfile> => {
  const response = await api.get(`/api/users/${userId}/profile/`);
  return response.data;
};
