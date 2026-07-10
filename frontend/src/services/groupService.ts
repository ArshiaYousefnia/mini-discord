// src/services/groupService.ts
import api from "./api";

export type CreateGroupPayload = {
  name: string;
  description?: string;
  avatar?: File | null;
};

export type CreatedGroupResponse = {
  id: string;
  name: string;
  description?: string;
  avatar?: string | null;
};

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
