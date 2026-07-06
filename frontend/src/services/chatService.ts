import type {
  Conversation,
  Message,
  SendConversationMessagePayload,
  SendDirectMessagePayload,
  UserProfile,
} from "../types/chat";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const LOCAL_MESSAGES_KEY = "mini_discord_demo_messages";

type RequestOptions = RequestInit & {
  body?: BodyInit | null;
};

function getCsrfToken() {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match?.[1] ?? "";
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(getCsrfToken() ? { "X-CSRFToken": getCsrfToken() } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = "Request failed";

    try {
      const data = await response.json();
      message = data.detail || data.error || data.message || message;
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

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

function getCurrentUsernameFallback() {
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

export const chatService = {
  getConversations: async (): Promise<Conversation[]> => {
    try {
      return await apiRequest<Conversation[]>("/api/chat/conversations/");
    } catch {
      return [];
    }
  },

  getConversationMessages: async (conversationId: string): Promise<Message[]> => {
    try {
      const messages = await apiRequest<Message[]>(
        `/api/chat/conversations/${conversationId}/messages/`
      );

      messages.forEach(upsertLocalMessage);
      return messages.filter((message) => !message.is_deleted);
    } catch {
      return getLocalConversationMessages(conversationId);
    }
  },

  getUserProfile: async (userId: string): Promise<UserProfile | null> => {
    try {
      return await apiRequest<UserProfile>(`/api/users/${userId}/profile/`);
    } catch {
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
      const message = await apiRequest<Message>("/api/chat/dm/", {
        method: "POST",
        body: JSON.stringify({ recipient_id, content, reply_to }),
      });

      upsertLocalMessage(message);
      return message;
    } catch {
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
      const message = await apiRequest<Message>(
        `/api/chat/conversations/${conversation_id}/messages/`,
        {
          method: "POST",
          body: JSON.stringify({ content, reply_to }),
        }
      );

      upsertLocalMessage(message);
      return message;
    } catch {
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
      const message = await apiRequest<Message>(
        `/api/chat/conversations/${conversationId}/messages/${messageId}/`,
        {
          method: "PATCH",
          body: JSON.stringify({ content }),
        }
      );

      upsertLocalMessage(message);
      return message;
    } catch {
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
      await apiRequest<void>(
        `/api/chat/conversations/${conversationId}/messages/${messageId}/`,
        { method: "DELETE" }
      );
    } catch {
      const messages = getLocalMessages();
      const updatedMessages = messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: null,
              is_deleted: true,
              updated_at: new Date().toISOString(),
            }
          : message
      );

      saveLocalMessages(updatedMessages);
    }
  },

  markConversationAsRead: async (conversationId: string): Promise<void> => {
    try {
      await apiRequest<void>(
        `/api/chat/conversations/${conversationId}/mark_read/`,
        { method: "POST" }
      );
    } catch {
    }
  },
};


export const {
  getConversations,
  getConversationMessages,
  getUserProfile,
  sendDirectMessage,
  sendConversationMessage,
  editMessage,
  deleteMessage,
  markConversationAsRead
} = chatService;

export const markConversationRead = markConversationAsRead;
export const createDirectMessage = sendDirectMessage;

