import type {
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
