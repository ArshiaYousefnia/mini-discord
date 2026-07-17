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
  other_user_id?: string | null; // <-- include it for DM use
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

export type CreateGroupPayload = {
  name: string;
  description?: string;
  avatar?: File | null;
};

export type CreatedGroupResponse = {
  id: string;
  name: string;
  description?: string;
  avatar?: string | null;
};

export type GroupProfile = {
  id: string;
  type: string;
  name: string;
  description: string;
  avatar_url: string;
  owner_id: string;
  owner_display_name: string;
  created_at: string;
  invite_token: string; 
  member_count: Number;
}

export type GroupMember = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_online: boolean;
  role_name: string;
};

export type GroupMembers = GroupMember[];

export type CreateChannelRequest = {
  name: string;
  description?: string;
  avatar?: File;
  is_private?: boolean;
  public_id?: string | null;
};

export type CreateChannelResponse = {
  id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  is_private: boolean;
  public_id: string | null;
  invite_link: string;
  owner_id: string | number;
};

export type ChannelPermissions = {
    is_owner: boolean;
    can_send_messages: boolean;
    can_send_media: boolean;
    can_delete_messages: boolean;
    can_manage_members: boolean;
    can_manage_roles: boolean;
    can_edit_channel_info: boolean;
    can_view_invite_link: boolean;
}

export type ChannelProfile = {
  id: string;
  name: string;
  description: string;
  avatar: string;
  avatar_url: string;
  owner_id: string;
  owner_display_name: string;
  created_at: string;
  invite_link: string | null; 
  is_private: boolean;        
  public_id: string | null;
}
