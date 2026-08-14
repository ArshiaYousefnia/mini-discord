import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { realtimeService } from "../services/realtimeService";

export type NotificationType = "dm" | "reply" | "group_add";

export type AppNotification = {
  id: string;
  type: NotificationType;
  senderName: string;
  preview: string;
  unread: boolean;
  createdAt: string;
  conversationId?: string;
  groupId?: string;
};

type NotificationContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  markAllAsRead: () => void;
  markOneAsRead: (id: string) => void;
};

const NotificationContext =
  createContext<NotificationContextValue | null>(null);

export function NotificationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const unreadCount = useMemo(
    () =>
      notifications.filter((notification) => notification.unread).length,
    [notifications]
  );

  /*
   * Connect the user socket:
   * - immediately, if a token already exists
   * - after login or registration, when auth:changed is dispatched
   */
  useEffect(() => {
    const handleAuthChanged = () => {
      const token = localStorage.getItem("accessToken");

      if (token) {
        realtimeService.connectUserSocket();
      }
    };

    handleAuthChanged();

    window.addEventListener("auth:changed", handleAuthChanged);

    return () => {
      window.removeEventListener("auth:changed", handleAuthChanged);
    };
  }, []);

  /*
   * Subscribe to realtime notification events.
   *
   * Subscribing does not open the socket. The effect above is responsible
   * for establishing the socket connection.
   */
  useEffect(() => {
    const unsubscribe = realtimeService.subscribeToNotifications(
      (payload: any) => {
        const item: AppNotification = {
          id: payload.id ?? crypto.randomUUID(),

          type: (
            payload.notification_type ??
            payload.type ??
            "dm"
          ) as NotificationType,

          senderName:
            payload.sender_display_name ??
            payload.senderDisplayName ??
            payload.sender_name ??
            payload.senderName ??
            "Someone",

          preview:
            payload.message_preview ??
            payload.preview ??
            "",

          unread: true,

          createdAt:
            payload.created_at ??
            payload.createdAt ??
            new Date().toISOString(),

          conversationId:
            payload.conversation_id ??
            payload.conversationId,

          groupId:
            payload.group_id ??
            payload.groupId,
        };

        setNotifications((previous) => {
          const alreadyExists = previous.some(
            (notification) => notification.id === item.id
          );

          if (alreadyExists) {
            return previous;
          }

          return [item, ...previous];
        });

        void showBrowserNotification(item);
      }
    );

    return () => {
      unsubscribe();

      // Do not disconnect here if other pages/components also use
      // the same global user socket.
    };
  }, []);

  const markAllAsRead = () => {
    setNotifications((previous) =>
      previous.map((notification) => ({
        ...notification,
        unread: false,
      }))
    );
  };

  const markOneAsRead = (id: string) => {
    setNotifications((previous) =>
      previous.map((notification) =>
        notification.id === id
          ? {
              ...notification,
              unread: false,
            }
          : notification
      )
    );
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAllAsRead,
        markOneAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

async function showBrowserNotification(item: AppNotification) {
  if (!("Notification" in window)) {
    return;
  }

  let permission = Notification.permission;

  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch (error) {
      console.error("Notification permission request failed:", error);
      return;
    }
  }

  if (permission !== "granted") {
    return;
  }

  new Notification(item.senderName, {
    body: item.preview || "New message",
    tag: item.id,
  });
}

export function useNotifications() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error(
      "useNotifications must be used inside NotificationProvider"
    );
  }

  return context;
}
