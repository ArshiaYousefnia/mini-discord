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
  event_type: 
    | "new_message" 
    | "member_left" 
    | "member_joined"
    | "message_deleted" 
    | "message_updated"
    | "channel_updated"
    | "role_updated"
    | "unread_updated"
    | "conversation_deleted"
    | "group_updated"
    | "user_updated";
  last_message?: MinimalMessage;
  user_id?: string;
  name?: string;
  description?: string;
  avatar_url?: string;
  avatar?: string;
  role_ids?: string[];
  action?: string;
  unread_count?: number;
  data?: any;
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

export interface UserUpdatePayload {
  user_id: string;
  display_name: string;
  avatar_url: string;
}

export interface ConversationMetadataPayload {
  conversation_id: string;
  name: string;
  description: string;
  avatar_url: string;
}

type ConversationUpdateCallback = (data: ConversationUpdatePayload) => void;
type NotificationCallback = (data: NotificationPayload) => void;
export type ConversationMessageCallback = (
  type: "new_message" | "message_updated" | "message_deleted", 
  data: any
) => void;
type UserUpdateCallback = (data: UserUpdatePayload) => void;
type ConversationMetadataCallback = (data: ConversationMetadataPayload) => void;

type SocketEnvelope =
  | { type: "conversation_update"; data: ConversationUpdatePayload }
  | { type: "notification"; data: NotificationPayload }
  | { type: "new_message"; data: any }
  | { type: "message_updated"; data: any }
  | { type: "message_deleted"; data: any }
  | { type: "user_updated"; data: UserUpdatePayload }
  | { type: "conversation_metadata_updated"; data: ConversationMetadataPayload }
  | { type: string; data?: any };

class RealtimeService {
  private userSocket: WebSocket | null = null;
  private conversationSocket: WebSocket | null = null;

  private updateCallbacks: Set<ConversationUpdateCallback> = new Set();
  private notificationCallbacks: Set<NotificationCallback> = new Set();
  private conversationCallbacks: Set<ConversationMessageCallback> = new Set();
  private userUpdateCallbacks: Set<UserUpdateCallback> = new Set();
  private conversationMetadataCallbacks: Set<ConversationMetadataCallback> = new Set();

  private activeConversationId: string | null = null;

  private reconnectInterval = 3000;

  private userReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private conversationReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private userManuallyClosed = false;
  private conversationManuallyClosed = false;

  private userConnectionSeq = 0;
  private conversationConnectionSeq = 0;

  // =========================
  // Subscription API
  // =========================

  public subscribeToUpdates(callback: ConversationUpdateCallback) {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  public subscribeToNotifications(callback: NotificationCallback) {
    this.notificationCallbacks.add(callback);
    return () => this.notificationCallbacks.delete(callback);
  }

  public subscribeToConversationMessages(callback: ConversationMessageCallback) {
    this.conversationCallbacks.add(callback);
    return () => this.conversationCallbacks.delete(callback);
  }

  subscribeToUserUpdates(callback: (data: any) => void) {
    return this.subscribeToUpdates((message) => {
      if (message.event_type === 'user_updated') {
        console.log('📨 Raw user_updated payload:', JSON.stringify(message, null, 2));
        callback(message.data);
      }
    });
  }


  public subscribeToConversationMetadata(callback: ConversationMetadataCallback) {
    this.conversationMetadataCallbacks.add(callback);
    return () => this.conversationMetadataCallbacks.delete(callback);
  }

  // =========================
  // Public connection helpers
  // =========================

  public connectUserSocket() {
    if (this.isSocketAlive(this.userSocket)) {
      return;
    }

    const token = this.getToken();
    if (!token) return;

    this.userManuallyClosed = false;
    this.clearTimer("user");

    const connectionId = ++this.userConnectionSeq;
    const wsUrl = this.buildWsUrl("/ws/user/", token);

    const socket = new WebSocket(wsUrl);
    this.userSocket = socket;

    socket.onmessage = (event) => {
      this.handleUserSocketMessage(event);
    };

    socket.onerror = () => {
      // Let onclose decide whether to reconnect
    };

    socket.onclose = (event) => {
      if (this.userSocket === socket) {
        this.userSocket = null;
      }

      if (connectionId !== this.userConnectionSeq) return;
      if (this.userManuallyClosed) return;
      if (event.code === 1000) return;

      this.scheduleUserReconnect(connectionId);
    };
  }

  public connectConversationSocket(conversationId: string) {
    if (!conversationId) return;

    if (
      this.activeConversationId === conversationId &&
      this.isSocketAlive(this.conversationSocket)
    ) {
      return;
    }

    this.disconnectConversationSocket(false);

    const token = this.getToken();
    if (!token) return;

    this.activeConversationId = conversationId;
    this.conversationManuallyClosed = false;
    this.clearTimer("conversation");

    const connectionId = ++this.conversationConnectionSeq;
    const wsUrl = this.buildWsUrl(`/ws/chat/${conversationId}/`, token);

    const socket = new WebSocket(wsUrl);
    this.conversationSocket = socket;

    socket.onmessage = (event) => {
      this.handleConversationSocketMessage(event);
    };

    socket.onerror = () => {
      // Let onclose decide whether to reconnect
    };

    socket.onclose = (event) => {
      if (this.conversationSocket === socket) {
        this.conversationSocket = null;
      }

      if (connectionId !== this.conversationConnectionSeq) return;
      if (this.conversationManuallyClosed) return;
      if (this.activeConversationId !== conversationId) return;
      if (event.code === 1000) return;

      this.scheduleConversationReconnect(conversationId, connectionId);
    };
  }

  public disconnectConversationSocket(manualClose = true) {
    if (manualClose) {
      this.conversationManuallyClosed = true;
    }

    this.clearTimer("conversation");

    const socket = this.conversationSocket;
    this.conversationSocket = null;
    this.activeConversationId = null;

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      try {
        socket.close(1000, "Component unmounted / Chat changed");
      } catch {
        // ignore close errors
      }
    }
  }

  public disconnectUserSocket() {
    this.userManuallyClosed = true;
    this.clearTimer("user");

    const socket = this.userSocket;
    this.userSocket = null;

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      try {
        socket.close(1000, "Application teardown");
      } catch {
        // ignore close errors
      }
    }
  }

  public disconnectAll() {
    this.disconnectConversationSocket(true);
    this.disconnectUserSocket();
  }

  public clearAllSubscribers() {
    this.updateCallbacks.clear();
    this.notificationCallbacks.clear();
    this.conversationCallbacks.clear();
    this.userUpdateCallbacks.clear();
    this.conversationMetadataCallbacks.clear();
  }

  public reset() {
    this.disconnectAll();
    this.activeConversationId = null;
    this.userSocket = null;
    this.conversationSocket = null;
    this.userConnectionSeq++;
    this.conversationConnectionSeq++;
    this.userManuallyClosed = true;
    this.conversationManuallyClosed = true;
  }

  // =========================
  // Internal message handling
  // =========================

  private handleUserSocketMessage(event: MessageEvent) {
    console.log('🔵 RAW user socket message:', event);
    try {
      const envelope = JSON.parse(event.data) as SocketEnvelope;

      if (envelope.type === "conversation_update") {
        if (envelope.data) {
          this.updateCallbacks.forEach((cb) => cb(envelope.data));
        }
        return;
      }

      if (envelope.type === "notification") {
        if (envelope.data) {
          this.notificationCallbacks.forEach((cb) => cb(envelope.data));
        }
        return;
      }

      if (envelope.type === "user_updated") {
        if (envelope.data) {
          this.userUpdateCallbacks.forEach((cb) => cb(envelope.data));
        }
        return;
      }
    } catch (err) {
      console.error("Error processing user socket message:", err);
    }
  }
  
  private handleConversationSocketMessage(event: MessageEvent) {
    try {
      const envelope = JSON.parse(event.data) as SocketEnvelope;

      if (["new_message", "message_updated", "message_deleted"].includes(envelope.type)) {
        this.conversationCallbacks.forEach((cb) => 
          cb(envelope.type as "new_message" | "message_updated" | "message_deleted", envelope.data)
        );
        return;
      }

      if (envelope.type === "user_updated") {
        if (envelope.data) {
          this.userUpdateCallbacks.forEach((cb) => cb(envelope.data));
        }
        return;
      }

      if (envelope.type === "conversation_metadata_updated") {
        if (envelope.data) {
          this.conversationMetadataCallbacks.forEach((cb) => cb(envelope.data));
        }
        return;
      }
    } catch (err) {
      console.error("Error processing conversation socket message:", err);
    }
  }

  // =========================
  // Reconnect logic
  // =========================

  private scheduleUserReconnect(connectionId: number) {
    this.clearTimer("user");

    this.userReconnectTimer = setTimeout(() => {
      if (connectionId !== this.userConnectionSeq) return;
      if (this.userManuallyClosed) return;

      this.connectUserSocket();
    }, this.reconnectInterval);
  }

  private scheduleConversationReconnect(
    conversationId: string,
    connectionId: number
  ) {
    this.clearTimer("conversation");

    this.conversationReconnectTimer = setTimeout(() => {
      if (connectionId !== this.conversationConnectionSeq) return;
      if (this.conversationManuallyClosed) return;
      if (this.activeConversationId !== conversationId) return;

      this.connectConversationSocket(conversationId);
    }, this.reconnectInterval);
  }

  // =========================
  // Utilities
  // =========================

  private clearTimer(kind: "user" | "conversation") {
    if (kind === "user" && this.userReconnectTimer) {
      clearTimeout(this.userReconnectTimer);
      this.userReconnectTimer = null;
    }

    if (kind === "conversation" && this.conversationReconnectTimer) {
      clearTimeout(this.conversationReconnectTimer);
      this.conversationReconnectTimer = null;
    }
  }

  private isSocketAlive(socket: WebSocket | null) {
    return (
      socket !== null &&
      (socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING)
    );
  }

  private getToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("accessToken");
  }

  private buildWsUrl(path: string, token: string) {
    if (typeof window === "undefined") {
      throw new Error("WebSocket URL requested on the server");
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;

    return `${protocol}//${host}${path}?token=${encodeURIComponent(token)}`;
  }
}

export const realtimeService = new RealtimeService();
