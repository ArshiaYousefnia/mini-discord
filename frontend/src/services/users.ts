import type { UserEditProfile, UserProfile } from "../types/user";
import api from "./api";



export const getUserProfile = async (userId: string): Promise<UserProfile> => {
  const response = await api.get(`/api/users/${userId}/profile/`);
  return response.data;
};

export const getUserEditProfile = async (userId: string): Promise<UserEditProfile> => {
  const response = await api.get(`/api/users/${userId}/profile/update/`);
  return response.data;
};


export async function updateUserProfile(
  userId: string,
  formData: FormData
  ) {
  const response = await api.patch(
    `/users/${userId}/profile/update/`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return response.data;
}
