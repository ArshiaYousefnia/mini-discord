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
  const response = await api.get(`/api/chat/channels/${channelId}/roles/`);
  return response.data;
};

// Create a new custom role
export const createChannelRole = async (channelId: string, name: string): Promise<any> => {
  const response = await api.post(`/api/chat/channels/${channelId}/roles/`, { name });
  return response.data;
};


export interface RolePermissions {
  can_send_messages: boolean;
  can_send_media: boolean;
  can_delete_messages: boolean;
  can_manage_members: boolean;
  can_manage_roles: boolean;
  can_view_invite_link: boolean;
  can_edit_channel_info: boolean;
  can_delete_channel: boolean;
  can_create_topic: boolean;
  can_manage_others_topics: boolean;
}

export interface ChannelRole extends RolePermissions {
  id: string;
  name: string;
}

// Update an existing role (permissions or name)
export const updateChannelRole = async (
  channelId: string, 
  roleId: string, 
  data: Partial<ChannelRole>
): Promise<ChannelRole> => {
  const response = await api.patch(`/api/chat/channels/${channelId}/roles/${roleId}/`, data);
  return response.data;
};

// Delete a custom role
export const deleteChannelRole = async (
  channelId: string, 
  roleId: string
): Promise<void> => {
  await api.delete(`/api/chat/channels/${channelId}/roles/${roleId}/`);
};

// ---------------------------------------------------------------------------
// Task #20 — Join a Channel with Invite Link (read-only preview)
// ---------------------------------------------------------------------------
export interface ChannelPreview {
  id: string;
  name: string;
  description: string;
  avatar_url: string;
  is_private: boolean;
  public_id: string | null;
}

export async function getChannelPreview(inviteCode: string): Promise<ChannelPreview> {
  const response = await api.get(`/api/chat/channels/preview/${inviteCode}/`);
  return response.data;
}

// ---------------------------------------------------------------------------
// Task #55 — Join a Channel with Public ID
// ---------------------------------------------------------------------------
export interface ChannelByPublicId {
  id: string;
  name: string;
  avatar_url: string;
  description: string;
  public_id: string;
}

export async function getChannelByPublicId(publicId: string): Promise<ChannelByPublicId> {
  const response = await api.get(`/api/chat/channels/public/${publicId}/`);
  return response.data;
}

export const joinChannelByPublicId = async (publicId: string): Promise<any> => {
  const response = await api.post(`/api/chat/channels/public/${publicId}/`);
  return response.data;
};

// ---------------------------------------------------------------------------
// Task #24 / #56 — Assign & remove roles from a channel member
// ---------------------------------------------------------------------------

/**
 * NOTE FOR THE TEAM: the backend endpoint behind this call
 * (`PATCH /channels/:id/members/:userId/role/`) currently *replaces* a member's
 * entire role set with the single role provided, via
 * `target_membership.roles.set([role])` in `ChannelMemberRoleUpdateView.patch`
 * (backend/chat/views.py). It does not add to the existing set.
 *
 * That means: if a member already has "Role A" and you assign "Role B", they
 * will end up with ONLY "Role B" — "Role A" gets silently removed. This
 * conflicts with Task #24's requirement to "assign one or multiple roles".
 *
 * Since the backend is locked for this project, this is implemented against
 * the endpoint as it currently exists. To properly support additive
 * multi-role assignment, the backend team should change that line to
 * `target_membership.roles.add(role)` (the *remove* endpoint below already
 * behaves correctly/additively, via `.roles.remove(role)`).
 */
export const assignMemberRole = async (
  channelId: string,
  userId: string,
  roleId: string
): Promise<{ detail: string }> => {
  const response = await api.patch(`/api/chat/channels/${channelId}/members/${userId}/role/`, {
    role_id: roleId,
  });
  return response.data;
};

export const removeMemberRole = async (
  channelId: string,
  userId: string,
  roleId: string
): Promise<{ detail: string }> => {
  const response = await api.delete(
    `/api/chat/channels/${channelId}/members/${userId}/roles/${roleId}/`
  );
  return response.data;
};
