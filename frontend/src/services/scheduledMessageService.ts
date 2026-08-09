import api from "./api";
import type {
  CreateScheduledMessagePayload,
  ScheduledMessage,
} from "../types/chat";

export const scheduledMessageService = {
  createScheduledMessage: async ({
    conversation_id,
    content = "",
    scheduled_at,
    reply_to = null,
    topic_id = null,
    files = [],
  }: CreateScheduledMessagePayload): Promise<ScheduledMessage> => {
    if (!content.trim() && (!files || files.length === 0)) {
      throw new Error("Message or attachment cannot be empty.");
    }

    if (content.length > 2000) {
      throw new Error("Message exceeds the 2000 character limit.");
    }

    const formData = new FormData();
    if (content.trim()) formData.append("content", content.trim());
    formData.append("scheduled_at", scheduled_at);
    if (reply_to) formData.append("reply_to", reply_to);
    if (topic_id) formData.append("topic_id", topic_id);

    files.forEach((file) => {
      formData.append("uploaded_files", file);
    });

    try {
      const response = await api.post<ScheduledMessage>(
        `/api/chat/conversations/${conversation_id}/schedule/`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      return response.data;
    } catch (error) {
      console.error("Failed to schedule message", error);
      throw error;
    }
  },

  getScheduledMessages: async (): Promise<ScheduledMessage[]> => {
    try {
      const response = await api.get<ScheduledMessage[]>(
        "/api/chat/scheduled-messages/"
      );
      return response.data;
    } catch (error) {
      console.warn("Failed to fetch scheduled messages", error);
      return [];
    }
  },

  deleteScheduledMessage: async (id: string): Promise<void> => {
    await api.delete(`/api/chat/scheduled-messages/${id}/`);
  },

  cancelAllForConversation: async (
    conversationId: string
  ): Promise<{ detail: string }> => {
    const response = await api.delete<{ detail: string }>(
      `/api/chat/conversations/${conversationId}/schedule/cancel-all/`
    );
    return response.data;
  },

  retryScheduledMessage: async (
    id: string
  ): Promise<{ detail: string }> => {
    const response = await api.post<{ detail: string }>(
      `/api/chat/scheduled-messages/${id}/retry/`
    );
    return response.data;
  },
};

export const {
  createScheduledMessage,
  getScheduledMessages,
  deleteScheduledMessage,
  cancelAllForConversation,
  retryScheduledMessage,
} = scheduledMessageService;