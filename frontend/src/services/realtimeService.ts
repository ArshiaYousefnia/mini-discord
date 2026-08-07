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
  event_type: "new_message" | "member_left" | "message_deleted" | "message_updated";
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
export type ConversationMessageCallback = (
  type: "new_message" | "message_updated" | "message_deleted", 
  data: any
) => void;


type SocketEnvelope =
  | { type: "conversation_update"; data: ConversationUpdatePayload }
  | { type: "notification"; data: NotificationPayload }
  | { type: "new_message"; data: any }
  | { type: string; data?: any };

class RealtimeService {
  private userSocket: WebSocket | null = null;
  private conversationSocket: WebSocket | null = null;

  private updateCallbacks: Set<ConversationUpdateCallback> = new Set();
  private notificationCallbacks: Set<NotificationCallback> = new Set();
  private conversationCallbacks: Set<ConversationMessageCallback> = new Set();

  private activeConversationId: string | null = null;

  private reconnectInterval = 3000;

  private userReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private conversationReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private userManuallyClosed = false;
  private conversationManuallyClosed = false;

  /**
   * Incrementing ids prevent stale onclose handlers / delayed reconnect timers
   * from resurrecting old sockets after a newer one has been created.
   */
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

  // =========================
  // Public connection helpers
  // =========================

  /**
   * Ensure the global user socket exists.
   * Safe to call multiple times.
   */
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

      // Ignore stale closes from an old socket instance
      if (connectionId !== this.userConnectionSeq) return;

      // Don't reconnect on intentional close
      if (this.userManuallyClosed) return;

      // Normal close code should not trigger reconnect
      if (event.code === 1000) return;

      this.scheduleUserReconnect(connectionId);
    };
  }

  /**
   * Ensure the conversation socket is connected to the given conversation.
   * Safe to call repeatedly.
   */
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

      // Ignore stale closes from an old socket instance
      if (connectionId !== this.conversationConnectionSeq) return;

      // If we already switched to another conversation or intentionally closed, do nothing
      if (this.conversationManuallyClosed) return;

      // If the user changed the active conversation, don't reconnect this one
      if (this.activeConversationId !== conversationId) return;

      // Normal close code should not trigger reconnect
      if (event.code === 1000) return;

      this.scheduleConversationReconnect(conversationId, connectionId);
    };
  }

  /**
   * Close only the conversation socket.
   * Does NOT clear callbacks.
   */
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

  /**
   * Close only the user socket.
   */
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

  /**
   * Close everything intentionally.
   */
  public disconnectAll() {
    this.disconnectConversationSocket(true);
    this.disconnectUserSocket();
  }

  /**
   * Optional helper if you want to clear all subscribers too.
   * Usually not needed in app runtime.
   */
  public clearAllSubscribers() {
    this.updateCallbacks.clear();
    this.notificationCallbacks.clear();
    this.conversationCallbacks.clear();
  }

  /**
   * Optional helper for logout:
   * - closes sockets
   * - clears timers
   * - resets internal connection state
   */
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
    } catch (err) {
      console.error("Error processing user socket message:", err);
    }
  }
  
  private handleConversationSocketMessage(event: MessageEvent) {
    try {
      const envelope = JSON.parse(event.data) as SocketEnvelope;

      // Check if the type is one of the allowed message events
      if (["new_message", "message_updated", "message_deleted"].includes(envelope.type)) {
        this.conversationCallbacks.forEach((cb) => 
          // Cast the type to satisfy TypeScript
          cb(envelope.type as "new_message" | "message_updated" | "message_deleted", envelope.data)
        );
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
      // Don't reconnect if a newer socket was created in the meantime
      if (connectionId !== this.userConnectionSeq) return;

      // Don't reconnect after manual shutdown
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
      // Don't reconnect if a newer socket was created in the meantime
      if (connectionId !== this.conversationConnectionSeq) return;

      // Don't reconnect after manual shutdown
      if (this.conversationManuallyClosed) return;

      // Don't reconnect if user switched conversations
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
