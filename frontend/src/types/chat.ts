export type ConversationType = "DM" | "GROUP" | "CHANNEL" | "SAVED";

export type BackendLastMessage = {
  id: string;
  content: string | null;
  is_deleted: boolean;
  created_at: string;
};

export type Conversation = {
  id: string;
  type: ConversationType;
  display_name: string | null;
  avatar: string | null;
  last_message: BackendLastMessage | null;
  unread_count: number;
  other_user_id: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  conversation: string;
  sender: string;
  sender_username: string;
  sender_display_name: string;
  content: string | null;
  reply_to: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type ChatListItem = {
  id: string;
  type: ConversationType;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
  otherUserId?: string | null; // <-- include it for DM use
};

export type UserProfile = {
  id: string;
  username: string;
  display_name?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;
};

export type SendDirectMessagePayload = {
  recipient_id: string;
  content: string;
  reply_to?: string | null;
};

export type SendConversationMessagePayload = {
  conversation_id: string;
  content: string;
  reply_to?: string | null;
  recipient_id?: string | null;
};
