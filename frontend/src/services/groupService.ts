// src/services/groupService.ts
import type { CreatedGroupResponse, CreateGroupPayload, GroupProfile } from "../types/chat";
import api from "./api";

export async function createGroup(
  payload: CreateGroupPayload
): Promise<CreatedGroupResponse> {
  const formData = new FormData();
  formData.append("name", payload.name);

  if (payload.description) {
    formData.append("description", payload.description);
  }

  if (payload.avatar) {
    formData.append("avatar", payload.avatar);
  }

  const response = await api.post("/api/chat/conversations/groups/create/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}


export const getUserProfile = async (groupId: string): Promise<GroupProfile> => {
  const response = await api.post(`/api/chat/conversations/${groupId}/profile/`);
  return response.data;
}
