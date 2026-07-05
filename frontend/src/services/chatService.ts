// src/services/chatService.ts
import api from "./api"; // Adjust the path if your api.ts is located elsewhere
import type { Conversation, Message } from "../types/chat";

export async function getConversations(): Promise<Conversation[]> {
  const response = await api.get<Conversation[]>("/api/chat/conversations/");
  return response.data;
}

export async function getConversationMessages(
  conversationPk: string
): Promise<Message[]> {
  const response = await api.get<Message[]>(
    `/api/chat/conversations/${conversationPk}/messages/`
  );
  return response.data;
}

/**
 * Initiates a Direct Message conversation with another user.
 * POST /api/chat/dm/
 * Payload: { recipient_id: string, content: string }
 */
export async function createDirectMessage(
  recipientId: string,
  content: string
): Promise<Message> {
  const response = await api.post<Message>("/api/chat/dm/", {
    recipient_id: recipientId,
    content: content,
  });
  return response.data;
}
