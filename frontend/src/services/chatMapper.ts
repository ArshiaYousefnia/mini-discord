import type { ChatListItem, Conversation, Message } from "../types/chat";

const fallbackAvatarByType: Record<string, string> = {
  DM: "https://i.pravatar.cc/150?img=1",
  GROUP: "https://ui-avatars.com/api/?name=Group&background=6b7280&color=fff",
  CHANNEL: "https://ui-avatars.com/api/?name=Channel&background=2563eb&color=fff",
  SAVED: "https://ui-avatars.com/api/?name=Saved&background=16a34a&color=fff",
};

export function mapConversationToChatListItem(
  conversation: Conversation,
  messages: Message[]
): ChatListItem {
  const sortedMessages = [...messages].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const latest = sortedMessages[0];

  return {
    id: conversation.id,
    type: conversation.type,
    name:
      conversation.name ||
      (conversation.type === "DM"
        ? "Direct Message"
        : conversation.type === "SAVED"
        ? "Saved Messages"
        : "Unnamed Conversation"),
    avatar: fallbackAvatarByType[conversation.type],
    lastMessage: latest?.is_deleted
      ? "Message deleted"
      : latest?.content || "No messages yet",
    lastMessageAt: latest?.created_at || conversation.created_at,
    unreadCount: 0, // backend doesn't currently provide unread_count
  };
}

export function sortChatsByRecent(chats: ChatListItem[]) {
  return [...chats].sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });
}

export function formatChatTimestamp(dateString: string | null) {
  if (!dateString) return "";

  const date = new Date(dateString);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString();
}
