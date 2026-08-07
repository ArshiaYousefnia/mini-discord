// src/services/realtimeService.ts

export interface MinimalMessage {
  id: string;
  content: string;
  sender_display_name: string;
  created_at: string;
  attachments_count: number;
}

export interface ConversationUpdatePayload {
  conversation_id: string;
  event_type: "new_message" | "member_left" | string;
  last_message?: MinimalMessage;
  user_id?: string; // present on member_left
}

export interface NotificationPayload {
  id: string;
  type: string;
  message_preview: string;
  conversation_id: string;
  message_id: string;
  sender_display_name: string;
  sender_avatar?: string;
}

type ConversationUpdateCallback = (data: ConversationUpdatePayload) => void;
type NotificationCallback = (data: NotificationPayload) => void;

class RealtimeService {
  private userSocket: WebSocket | null = null;
  private conversationSocket: WebSocket | null = null;
  private conversationCallbacks: Set<(msg: any) => void> = new Set();
  private updateCallbacks: Set<ConversationUpdateCallback> = new Set();
  private notificationCallbacks: Set<NotificationCallback> = new Set();
  private reconnectInterval = 3000;
  private activeConversationId: string | null = null;

  // Global socket listener registration
  public subscribeToUpdates(callback: ConversationUpdateCallback) {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  public subscribeToNotifications(callback: NotificationCallback) {
    this.notificationCallbacks.add(callback);
    return () => this.notificationCallbacks.delete(callback);
  }

  // Active chat listener registration
  public subscribeToConversationMessages(callback: (msg: any) => void) {
    this.conversationCallbacks.add(callback);
    return () => this.conversationCallbacks.delete(callback);
  }

  /**
   * Connects to the global user channel: ws/user/
   */
  public connectUserSocket() {
    if (this.userSocket && (this.userSocket.readyState === WebSocket.OPEN || this.userSocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    // Pass token as a query param for ASGI scope authentication middlewares
    const wsUrl = `${protocol}//${host}/ws/user/?token=${encodeURIComponent(token)}`;

    this.userSocket = new WebSocket(wsUrl);

    this.userSocket.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data);
        if (envelope.type === "conversation_update") {
          this.updateCallbacks.forEach((cb) => cb(envelope.data));
        } else if (envelope.type === "notification") {
          this.notificationCallbacks.forEach((cb) => cb(envelope.data));
        }
      } catch (err) {
        console.error("Error processing user socket message:", err);
      }
    };

    this.userSocket.onclose = () => {
      setTimeout(() => this.connectUserSocket(), this.reconnectInterval);
    };
  }

  /**
   * Connects to a specific conversation channel: ws/chat/<conversation_id>/
   */
  public connectConversationSocket(conversationId: string) {
    // If already connected to this conversation, do nothing
    if (this.activeConversationId === conversationId && this.conversationSocket) {
      return;
    }

    this.disconnectConversationSocket();
    this.activeConversationId = conversationId;

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/chat/${conversationId}/?token=${encodeURIComponent(token)}`;

    this.conversationSocket = new WebSocket(wsUrl);

    this.conversationSocket.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data);
        if (envelope.type === "new_message") {
          this.conversationCallbacks.forEach((cb) => cb(envelope.data));
        }
      } catch (err) {
        console.error("Error processing conversation socket message:", err);
      }
    };

    this.conversationSocket.onclose = (event) => {
      // Reconnect only if the active chat target has not changed during disconnect
      if (this.activeConversationId === conversationId && event.code !== 1000) {
        setTimeout(() => {
          if (this.activeConversationId === conversationId) {
            this.connectConversationSocket(conversationId);
          }
        }, this.reconnectInterval);
      }
    };
  }

  public disconnectConversationSocket() {
    this.conversationCallbacks.clear();
    if (this.conversationSocket) {
      this.conversationSocket.close(1000, "Component unmounted / Chat changed");
      this.conversationSocket = null;
    }
    this.activeConversationId = null;
  }

  public disconnectAll() {
    this.disconnectConversationSocket();
    if (this.userSocket) {
      this.userSocket.close(1000, "Log out / Application teardown");
      this.userSocket = null;
    }
  }
}

export const realtimeService = new RealtimeService();
