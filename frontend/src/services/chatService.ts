// src/services/chatService.ts
import api from "./api"; // Adjust the path if your api.ts is located elsewhere
import type { Conversation, Message } from "../types/chat";

export async function getConversations(): Promise<Conversation[]> {
  const response = await api.get<Conversation[]>("/api/chat/conversations/");
  console.log(response.data);
  
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

/**
 * Marks a conversation as read by setting the user's last_read_message.
 * POST /api/chat/conversations/<conversation_id>/mark_read/
 * Payload: { last_read_message_id: string }
 */
export async function markConversationRead(
  conversationId: string,
  lastReadMessageId: string
): Promise<void> {
  await api.post(`/api/chat/conversations/${conversationId}/mark_read/`, {
    last_read_message_id: lastReadMessageId,
  });
}

