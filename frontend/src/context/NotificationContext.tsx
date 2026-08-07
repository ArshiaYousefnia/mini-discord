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
    () => notifications.filter((notification) => notification.unread).length,
    [notifications]
  );

  useEffect(() => {
    const token = localStorage.getItem("accessToken");

    if (!token) {
      return;
    }

    // مهم: subscription به‌تنهایی socket را باز نمی‌کند
    realtimeService.connectUserSocket();

    const unsubscribe = realtimeService.subscribeToNotifications(
      (payload: any) => {
        const item: AppNotification = {
          id: payload.id ?? crypto.randomUUID(),
          type: payload.type ?? "dm",
          senderName:
            payload.sender_display_name ??
            payload.senderDisplayName ??
            "Someone",
          preview:
            payload.message_preview ??
            payload.preview ??
            "",
          unread: true,
          createdAt:
            payload.created_at ??
            new Date().toISOString(),
          conversationId:
            payload.conversation_id ??
            payload.conversationId,
          groupId:
            payload.group_id ??
            payload.groupId,
        };


        setNotifications((previous) => {
          // جلوگیری از ثبت دوباره یک notification
          if (previous.some((notification) => notification.id === item.id)) {
            return previous;
          }

          return [item, ...previous];
        });

        void showBrowserNotification(item);
      }
    );

    return () => {
      unsubscribe();

      // در حالت عادی اینجا disconnect نکنید؛
      // چون HomePage هم از همین user socket استفاده می‌کند.
      //
      // اگر NotificationProvider واقعاً در کل طول عمر اپ فقط یک‌بار mount
      // می‌شود، می‌توانید در آینده این را اضافه کنید:
      // realtimeService.disconnectUserSocket();
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
          ? { ...notification, unread: false }
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
    body: item.preview,
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
