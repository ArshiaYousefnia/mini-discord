// src/services/chatService.ts
import api from "./api"; // Uses your Axios instance with interceptors
import type {
  Conversation,
  Message,
  SendConversationMessagePayload,
  SendDirectMessagePayload,
  UserProfile,
} from "../types/chat";

const LOCAL_MESSAGES_KEY = "mini_discord_demo_messages";

// ==========================================
// Local Storage Fallback Helpers
// ==========================================

function getLocalMessages(): Message[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_MESSAGES_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveLocalMessages(messages: Message[]) {
  localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(messages));
}

function getCurrentUsernameFallback(): string {
  return (
    localStorage.getItem("username") ||
    localStorage.getItem("current_username") ||
    "me"
  );
}

function createLocalMessage(params: {
  conversationId: string;
  content: string;
  senderId?: string;
  senderUsername?: string;
  senderDisplayName?: string;
  replyTo?: string | null;
}): Message {
  const now = new Date().toISOString();
  const username = params.senderUsername ?? getCurrentUsernameFallback();

  return {
    id: `local-${crypto.randomUUID()}`,
    conversation: params.conversationId,
    sender: params.senderId ?? username,
    sender_username: username,
    sender_display_name: params.senderDisplayName ?? username,
    content: params.content,
    reply_to: params.replyTo ?? null,
    is_edited: false,
    is_deleted: false,
    created_at: now,
    updated_at: now,
  };
}

function upsertLocalMessage(message: Message) {
  const messages = getLocalMessages();
  const index = messages.findIndex((item) => item.id === message.id);

  if (index >= 0) {
    messages[index] = message;
  } else {
    messages.push(message);
  }

  saveLocalMessages(messages);
}

function getLocalConversationMessages(conversationId: string) {
  return getLocalMessages().filter(
    (message) => message.conversation === conversationId && !message.is_deleted
  );
}

// ==========================================
// Service Implementation
// ==========================================

export const chatService = {
  getConversations: async (): Promise<Conversation[]> => {
    try {
      const response = await api.get<Conversation[]>("/api/chat/conversations/");
      return response.data;
    } catch (error) {
      console.warn("Failed to fetch conversations from API, returning empty list", error);
      return [];
    }
  },

  getConversationMessages: async (conversationId: string): Promise<Message[]> => {
    try {
      const response = await api.get<Message[]>(
        `/api/chat/conversations/${conversationId}/messages/`
      );
      const messages = response.data;

      messages.forEach(upsertLocalMessage);
      return messages.filter((message) => !message.is_deleted);
    } catch (error) {
      console.warn(`Failed to fetch messages for conversation ${conversationId}, loading local cache`, error);
      return getLocalConversationMessages(conversationId);
    }
  },

  getUserProfile: async (userId: string): Promise<UserProfile | null> => {
    try {
      const response = await api.get<UserProfile>(`/api/users/${userId}/profile/`);
      return response.data;
    } catch (error) {
      console.warn(`Failed to fetch user profile for ${userId}`, error);
      return null;
    }
  },

  sendDirectMessage: async ({
    recipient_id,
    content,
    reply_to = null,
  }: SendDirectMessagePayload): Promise<Message> => {
    if (!content.trim()) {
      throw new Error("Message cannot be empty.");
    }

    if (content.length > 2000) {
      throw new Error("Message exceeds the 2000 character limit.");
    }

    try {
      const response = await api.post<Message>("/api/chat/dm/", {
        recipient_id,
        content,
        reply_to,
      });
      const message = response.data;

      upsertLocalMessage(message);
      return message;
    } catch (error) {
      console.warn("Failed to send direct message to API, storing locally", error);
      const localMessage = createLocalMessage({
        conversationId: `new-${recipient_id}`,
        content,
        replyTo: reply_to,
      });

      upsertLocalMessage(localMessage);
      return localMessage;
    }
  },

  sendConversationMessage: async ({
    conversation_id,
    content,
    reply_to = null,
  }: SendConversationMessagePayload): Promise<Message> => {
    if (!content.trim()) {
      throw new Error("Message cannot be empty.");
    }

    if (content.length > 2000) {
      throw new Error("Message exceeds the 2000 character limit.");
    }

    try {
      const response = await api.post<Message>(
        `/api/chat/conversations/${conversation_id}/messages/`,
        { content, reply_to }
      );
      const message = response.data;

      upsertLocalMessage(message);
      return message;
    } catch (error) {
      console.warn("Failed to send message to API, storing locally", error);
      const localMessage = createLocalMessage({
        conversationId: conversation_id,
        content,
        replyTo: reply_to,
      });

      upsertLocalMessage(localMessage);
      return localMessage;
    }
  },

  editMessage: async (
    conversationId: string,
    messageId: string,
    content: string
  ): Promise<Message> => {
    if (!content.trim()) {
      throw new Error("Message cannot be empty.");
    }

    if (content.length > 2000) {
      throw new Error("Message exceeds the 2000 character limit.");
    }

    try {
      const response = await api.patch<Message>(
        `/api/chat/conversations/${conversationId}/messages/${messageId}/`,
        { content }
      );
      const message = response.data;

      upsertLocalMessage(message);
      return message;
    } catch (error) {
      console.warn("Failed to edit message on server, updating local storage", error);
      const messages = getLocalMessages();
      const target = messages.find((message) => message.id === messageId);

      if (!target) {
        throw new Error("Message not found.");
      }

      const updatedMessage: Message = {
        ...target,
        content,
        is_edited: true,
        updated_at: new Date().toISOString(),
      };

      upsertLocalMessage(updatedMessage);
      return updatedMessage;
    }
  },

  deleteMessage: async (
    conversationId: string,
    messageId: string
  ): Promise<void> => {
    try {
      await api.delete(
        `/api/chat/conversations/${conversationId}/messages/${messageId}/`
      );
      
      // Update local cache state reflecting deletion
      const messages = getLocalMessages();
      const updatedMessages = messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: "",
              is_deleted: true,
              updated_at: new Date().toISOString(),
            }
          : message
      );
      saveLocalMessages(updatedMessages);
    } catch (error) {
      console.warn("Failed to delete message on server, deleting locally", error);
      const messages = getLocalMessages();
      const updatedMessages = messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: "",
              is_deleted: true,
              updated_at: new Date().toISOString(),
            }
          : message
      );

      saveLocalMessages(updatedMessages);
    }
  },

  markConversationAsRead: async (
    conversationId: string,
    lastReadMessageId?: string
  ): Promise<void> => {
    try {
      await api.post(`/api/chat/conversations/${conversationId}/mark_read/`, {
        last_read_message_id: lastReadMessageId,
      });
    } catch (error) {
      console.warn(`Failed to mark conversation ${conversationId} as read`, error);
    }
  },
};

// ==========================================
// Exports for compatibility with both versions
// ==========================================

export const {
  getConversations,
  getConversationMessages,
  getUserProfile,
  sendDirectMessage,
  sendConversationMessage,
  editMessage,
  deleteMessage,
  markConversationAsRead,
} = chatService;

// Backward-compatible named exports & aliases
// Replace: export const createDirectMessage = sendDirectMessage;
// With this wrapper:
export async function createDirectMessage(
  recipientId: string,
  content: string,
  replyTo: string | null = null
): Promise<Message> {
  return sendDirectMessage({
    recipient_id: recipientId,
    content: content,
    reply_to: replyTo,
  });
}

export const markConversationRead = markConversationAsRead;
