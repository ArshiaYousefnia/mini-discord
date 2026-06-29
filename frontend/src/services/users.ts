import type { UserEditProfile, UserProfile } from "../types/user";
import api from "./api";



export const getUserProfile = async (userId: string): Promise<UserProfile> => {
  const response = await api.get(`/api/users/${userId}/profile/`);
  return response.data;
};

export const getUserEditProfile = async (
  userId: string
): Promise<UserEditProfile> => {
  const response = await api.get<UserEditProfile>(
    `/api/users/${userId}/profile/update/`
  );

  return response.data;
};

export const updateUserProfile = async (
  userId: string,
  formData: FormData
): Promise<UserEditProfile> => {
  const response = await api.patch<UserEditProfile>(
    `/api/users/${userId}/profile/update/`,
    formData
  );

  return response.data;
};




