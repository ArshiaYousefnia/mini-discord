import type {
  ChannelMembers,
  ChannelPermissions,
  ChannelProfile,
  CreateChannelRequest,
  CreateChannelResponse,
} from "../types/chat";
import api from "./api";

export async function createChannel(
  payload: CreateChannelRequest,
): Promise<CreateChannelResponse> {
  const formData = new FormData();

  formData.append("name", payload.name);
  formData.append("description", payload.description ?? "");
  formData.append("is_private", String(payload.is_private ?? true));

  if (payload.avatar) {
    formData.append("avatar", payload.avatar);
  }

  if (payload.is_private === false && payload.public_id) {
    formData.append("public_id", payload.public_id);
  }

  const response = await api.post("/api/chat/channels/create/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

export async function getChannelProfile(id: string): Promise<ChannelProfile> {
  const response = await api.get(`/api/chat/channels/${id}/profile/`);
  return response.data;
}

export interface UpdateChannelRequest {
  name?: string;
  description?: string;
  avatar?: File | null;
}

export async function updateChannel(
  id: string,
  payload: UpdateChannelRequest
): Promise<ChannelProfile> {
  const formData = new FormData();

  if (payload.name) formData.append("name", payload.name);
  if (payload.description !== undefined) formData.append("description", payload.description);
  if (payload.avatar) formData.append("avatar", payload.avatar);

  const response = await api.patch(`/api/chat/channels/${id}/edit/`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

export async function getPermissions (id: string): Promise<ChannelPermissions>{
  const response = await api.get(`/api/chat/channels/${id}/my-permissions/`)
  return response.data;
}

export const joinChannelByInviteLink = async (token: string): Promise<any> => {
  const response = await api.post(`/api/chat/channels/join/${token}/`);
  return response.data;
};

export const deleteChannel = async (id: string): Promise<void> => {
  await api.delete(`api/chat/channels/${id}/delete/`);
}

export async function getChannelMembers(id: string): Promise<ChannelMembers> {
  const response = await api.get(`/api/chat/channels/${id}/members/`);
  return response.data;
}

// Add this to your exported functions in channelService.ts
export const removeChannelMember = async (channelId: string, userId: string): Promise<void> => {
  await api.delete(`/api/chat/channels/${channelId}/members/${userId}/`);
};


// Fetch all roles for a specific channel
export const getChannelRoles = async (channelId: string): Promise<any[]> => {
  const response = await api.get(`/channels/${channelId}/roles/`);
  return response.data;
};

// Create a new custom role
export const createChannelRole = async (channelId: string, name: string): Promise<any> => {
  const response = await api.post(`/channels/${channelId}/roles/`, { name });
  return response.data;
};
