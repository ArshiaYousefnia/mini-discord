import api from "./api";
import type { Topic } from "../types/chat";

// ---------------------------------------------------------------------------
// Task #22 / #49 — Manage topics inside a channel
// ---------------------------------------------------------------------------

export async function getTopics(conversationId: string): Promise<Topic[]> {
  const response = await api.get(`/api/chat/channels/${conversationId}/topics/`);
  return response.data;
}

export async function createTopic(conversationId: string, name: string): Promise<Topic> {
  const response = await api.post(`/api/chat/channels/${conversationId}/topics/`, { name });
  return response.data;
}

export async function renameTopic(
  conversationId: string,
  topicId: string,
  name: string
): Promise<Topic> {
  const response = await api.patch(
    `/api/chat/channels/${conversationId}/topics/${topicId}/`,
    { name }
  );
  return response.data;
}

export async function deleteTopic(conversationId: string, topicId: string): Promise<void> {
  await api.delete(`/api/chat/channels/${conversationId}/topics/${topicId}/`);
}

// Message sending with an optional `topic_id` is handled directly by
// `sendConversationMessage` in chatService.ts (it now accepts a `topic_id`
// field on its payload and forwards it to
// `POST /api/chat/conversations/:conversationId/messages/`, which the
// backend's MessageViewSet.perform_create already reads).
