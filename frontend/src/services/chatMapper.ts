import type { ChatListItem, Conversation} from "../types/chat";

export function mapConversationToChatListItem(
  conversation: Conversation
): ChatListItem {
  // Use backend-provided DM name/avatar (best & correct)
  const name =
    conversation.display_name ||
    (conversation.type === "DM" ? "Direct Message" : "Unnamed Chat");

  const avatar =
    conversation.avatar ||
    (conversation.type === "DM"
      ? "/avatars/default-user.png"
      : "/avatars/default-group.png");

  const lastMessage = conversation.last_message;

  const lastMessageText = lastMessage
    ? lastMessage.is_deleted
      ? "Message deleted"
      : lastMessage.content || "No content"
    : "No messages yet";

  const lastMessageAt = lastMessage ? lastMessage.created_at : null;

  return {
    id: conversation.id,
    type: conversation.type,
    name,
    avatar,
    lastMessage: lastMessageText,
    lastMessageAt,
    unreadCount: conversation.unread_count || 0,
    otherUserId: conversation.other_user_id, // <-- now accessible to UI
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
