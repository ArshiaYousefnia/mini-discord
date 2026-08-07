import { useEffect, useMemo, useRef, useState } from "react";
import {
  createDirectMessage,
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
  editMessage,
  deleteMessage,
} from "../services/chatService";
import {
  getGroupProfile,
  getGroupMembers,
  removeGroupMember,
  updateGroupProfile,
  leaveGroup,
  deleteGroup,
} from "../services/groupService";
import { getUserProfile } from "../services/users";
import type {
  ChatListItem,
  Message,
  GroupProfile,
  GroupMembers,
  ChannelProfile,
  ChannelPermissions,
  ChannelMembers,
  Topic,
} from "../types/chat";
import type { BackendUserProfile, UserProfile } from "../types/user";

import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import MessageSearchPanel from "./MessageSearchPanel";
import ConfirmModal from "./ConfirmModal";
import ChatHeader from "./ChatHeader";
import ProfileOverlay from "./ProfileOverlay";
import TopicsPanel from "./TopicsPanel";
import {
  getChannelProfile,
  getPermissions,
  updateChannel,
  deleteChannel,
  getChannelMembers,
  removeChannelMember,
  getChannelRoles,
  createChannelRole,
} from "../services/channelService";
import {
  getTopics,
  createTopic,
  renameTopic,
  deleteTopic,
} from "../services/topicService";

// Import the centralized realtime WebSocket service and its payloads
import { realtimeService, type ConversationUpdatePayload } from "../services/realtimeService";

interface Props {
  chat: ChatListItem | null;
  isMobile: boolean;
  onBack: () => void;
  onGroupExit?: (groupId: string) => void;
  onGroupJoined?: (groupId: string) => void;
  isOtherUserOnline?: boolean;
  onlineUsers: Record<string, boolean>;
  pendingDirectMessageUser?: BackendUserProfile | null;

  // User selected from Sidebar global search to open in ProfileOverlay.
  profileUserToOpen?: BackendUserProfile | null;
  onProfileUserOpened?: () => void;

  // Lets ProfileOverlay's Message button use HomePage's existing-DM /
  // pending-DM logic.
  onStartDirectMessage?: (
    user: BackendUserProfile | UserProfile
  ) => Promise<void> | void;

  onDirectMessageCreated?: (conversationId: string) => Promise<void>;
}

export default function ChatView({
  chat,
  isMobile,
  onBack,
  onGroupExit,
  onGroupJoined,
  isOtherUserOnline,
  onlineUsers,
  pendingDirectMessageUser,
  profileUserToOpen,
  onProfileUserOpened,
  onStartDirectMessage,
  onDirectMessageCreated,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeReplyTo, setActiveReplyTo] = useState<Message | null>(null);
  const [localChatInfo, setLocalChatInfo] = useState<{
    name: string;
    avatar: string;
  } | null>(null);

  const [showProfile, setShowProfile] = useState(false);
  const [profileViewType, setProfileViewType] = useState<
    "group" | "user" | "channel" | null
  >(null);
  const [groupProfile, setGroupProfile] = useState<GroupProfile | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMembers | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSource, setProfileSource] = useState<
    "CHAT" | "GROUP_PROFILE"
  >("GROUP_PROFILE");

  const [memberToRemove, setMemberToRemove] = useState<any>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showLeaveChannelConfirm, setShowLeaveChannelConfirm] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [showDeleteGroupConfirm, setShowDeleteGroupConfirm] = useState(false);
  const [deleteGroupLoading, setDeleteGroupLoading] = useState(false);
  const [showDeleteChannelConfirm, setShowDeleteChannelConfirm] =
    useState(false);
  const [deleteChannelLoading, setDeleteChannelLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [channelProfile, setChannelProfile] =
    useState<ChannelProfile | null>(null);
  const [channelPermissions, setChannelPermissions] =
    useState<ChannelPermissions | null>(null);
  const [channelMembers, setChannelMembers] =
    useState<ChannelMembers | null>(null);
  const [channelRoles, setChannelRoles] = useState<any[] | null>(null);

  // Task #22 / #49 — topics inside a channel.
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(false);
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto");
  const highlightTimeoutRef = useRef<number | null>(null);

  // Ref to track active conversation ID to prevent stale closures in real-time callbacks
  const currentChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentChatIdRef.current = chat?.id || null;
  }, [chat]);

  const currentUserId = localStorage.getItem("Id");
  const currentUsername = (() => {
    const raw = localStorage.getItem("username");
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);

      return typeof parsed === "object" && parsed?.username
        ? String(parsed.username)
        : String(parsed);
    } catch {
      return raw;
    }
  })();

  const chatType = chat?.type?.toUpperCase() ?? "";

  // UI-only temporary DM used before the first message creates a real conversation.
  const pendingChat = useMemo<ChatListItem | null>(() => {
    if (!pendingDirectMessageUser) return null;

    return {
      id: `pending-dm-${pendingDirectMessageUser.id}`,
      type: "DM",
      name:
        pendingDirectMessageUser.display_name ||
        pendingDirectMessageUser.username ||
        "New message",
      avatar: pendingDirectMessageUser.avatar_url || "",
      other_user_id: String(pendingDirectMessageUser.id),
    } as ChatListItem;
  }, [pendingDirectMessageUser]);

  // Used only while a profile has been opened from global search.
  // There is no real chat yet, but ChatHeader requires a ChatListItem.
  const profileOpeningChat = useMemo<ChatListItem | null>(() => {
    if (!profileUserToOpen) return null;

    return {
      id: `profile-${profileUserToOpen.id}`,
      type: "DM",
      name:
        profileUserToOpen.display_name ||
        profileUserToOpen.username ||
        "User profile",
      avatar: profileUserToOpen.avatar_url || "",
      other_user_id: String(profileUserToOpen.id),
    } as ChatListItem;
  }, [profileUserToOpen]);

  const headerChat = chat ?? pendingChat ?? profileOpeningChat;

  const isCurrentUserOwner =
    String(groupProfile?.owner_id) === String(currentUserId) ||
    (chatType === "CHANNEL" && channelPermissions?.is_owner === true);

  const activeOtherUserOnline = useMemo(() => {
    if (pendingDirectMessageUser) {
      const userId = String(pendingDirectMessageUser.id);

      return userId in onlineUsers
        ? onlineUsers[userId]
        : !!pendingDirectMessageUser.is_online;
    }

    if (chatType !== "DM" || !chat?.other_user_id) {
      return !!isOtherUserOnline;
    }

    const userId = String(chat.other_user_id);

    return userId in onlineUsers
      ? onlineUsers[userId]
      : !!isOtherUserOnline;
  }, [
    pendingDirectMessageUser,
    chatType,
    chat,
    onlineUsers,
    isOtherUserOnline,
  ]);

  // Task #29 — who can delete OTHER members' messages in this chat.
  // Groups: the group owner. Channels: the owner, or anyone with the
  // "Delete others messages" permission.
  const canDeleteOthersMessages =
    chatType === "GROUP"
      ? isCurrentUserOwner
      : chatType === "CHANNEL"
        ? !!(
            channelPermissions?.is_owner ||
            channelPermissions?.can_delete_messages
          )
        : false;

  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    if (chat) {
      setLocalChatInfo({ name: chat.name, avatar: chat.avatar });
    }
  }, [chat]);

  // Real-time Event Subscription for Message updates, New messages, and Group changes.
  // Replaces the continuous HTTP polling loops.
  useEffect(() => {
    if (!chat?.id) return;

    // Connect / Join conversation group room
    realtimeService.connectConversationSocket(chat.id);

    // Listen to real-time messages
    const unsubscribeNewMessage = realtimeService.subscribeToConversationMessages((data: Message) => {
      // Security Check: confirm message belongs to our currently opened chat session
      if (String(data.conversation) !== currentChatIdRef.current) return;

      setMessages((prev) => {
        // Deduplicate: avoid appending if the client sent it and received their own broadcast echo
        if (prev.some((m) => m.id === data.id)) return prev;

        const sorted = [...prev, data].sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        );

        shouldScrollToBottomRef.current = true;
        scrollBehaviorRef.current = "smooth";
        return sorted;
      });

      // Mark newly-arrived message as read
      void markConversationRead(chat.id, data.id);
    });

    // Listen to conversation/message edits or leaves
    const unsubscribeUpdates = realtimeService.subscribeToUpdates((data: ConversationUpdatePayload) => {
      if (String(data.conversation_id) !== currentChatIdRef.current) return;

      if (data.event_type === "message_updated" && data.last_message) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === data.last_message!.id 
              ? { ...msg, ...data.last_message } 
              : msg
          )
        );
      } else if (data.event_type === "member_left") {
        // Automatically fetch fresh members if currently viewing the profile overlay
        if (showProfile) {
          void handleHeaderClick();
        }
      }
    });

    return () => {
      unsubscribeNewMessage();
      unsubscribeUpdates();
      realtimeService.disconnectConversationSocket();
    };
  }, [chat?.id, showProfile]);

  useEffect(() => {
    if (!chat) {
      setMessages([]);
      setChannelProfile(null);
      setChannelPermissions(null);
      setChannelRoles(null);
      setTopics([]);
      setActiveTopicId(null);
      return;
    }

    let isMounted = true;

    setShowProfile(false);
    setProfileViewType(null);
    setShowLeaveConfirm(false);
    setShowDeleteGroupConfirm(false);
    setShowLeaveChannelConfirm(false);
    setShowDeleteChannelConfirm(false);
    setShowSearch(false);
    setChannelProfile(null);
    setChannelPermissions(null);
    setChannelMembers(null);
    setChannelRoles(null);
    setTopics([]);
    setActiveTopicId(null);

    const loadMessages = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getConversationMessages(chat.id);
        if (!isMounted) return;

        const sortedMessages = [...data].sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        );

        shouldScrollToBottomRef.current = true;
        scrollBehaviorRef.current = "auto";
        setMessages(sortedMessages);

        if (sortedMessages.length) {
          await markConversationRead(
            chat.id,
            sortedMessages[sortedMessages.length - 1].id
          );
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Failed to load messages"
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadMessages();
    setActiveReplyTo(null);

    return () => {
      isMounted = false;
    };
  }, [chat]);

  // Load static configuration details on component mount/chat-change.
  // Group and Channel info, permissions, and topics are fetched once instead of continuous HTTP polling.
  useEffect(() => {
    if (!chat) return;

    let isMounted = true;

    const loadChatContext = async () => {
      try {
        if (chatType === "GROUP") {
          const [profileData, membersData] = await Promise.all([
            getGroupProfile(chat.id),
            getGroupMembers(chat.id),
          ]);

          if (!isMounted) return;

          setGroupProfile(profileData);
          setGroupMembers(membersData);
          setLocalChatInfo((prev) =>
            prev?.name !== profileData.name ||
            prev?.avatar !== (profileData.avatar_url || chat.avatar)
              ? {
                  name: profileData.name,
                  avatar: profileData.avatar_url || chat.avatar,
                }
              : prev
          );
        } else if (chatType === "CHANNEL") {
          const [permissionsData, topicsData] = await Promise.all([
            getPermissions(chat.id),
            getTopics(chat.id)
          ]);

          if (!isMounted) return;

          setChannelPermissions(permissionsData);
          setTopics(topicsData);
        }
      } catch (error) {
        console.error("Failed to load initial context info:", error);
      }
    };

    loadChatContext();

    return () => {
      isMounted = false;
    };
  }, [chat, chatType]);

  useEffect(() => {
    if (!loading && shouldScrollToBottomRef.current) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: scrollBehaviorRef.current,
        });
        shouldScrollToBottomRef.current = false;
      });
    }
  }, [messages.length, loading, chat?.id]);

  const handleSendMessage = async (text: string, files: File[] = []) => {
    if (!chat && !pendingDirectMessageUser) return;

    try {
      setSendingMessage(true);

      // The first actual submitted message creates the DM conversation.
      if (pendingDirectMessageUser) {
        if (!text.trim() && files.length === 0) return;

        const firstMessage = await createDirectMessage(
          String(pendingDirectMessageUser.id),
          text,
          activeReplyTo?.id || null,
          files
        );

        setActiveReplyTo(null);
        await onDirectMessageCreated?.(String(firstMessage.conversation));
        return;
      }

      if (!chat) return;

      const recipientId =
        chatType === "DM" && chat.other_user_id
          ? String(chat.other_user_id)
          : undefined;

      const newMessage = await sendConversationMessage({
        conversation_id: chat.id,
        content: text,
        reply_to: activeReplyTo?.id || null,
        recipient_id: recipientId,
        files,
        topic_id: chatType === "CHANNEL" ? activeTopicId : undefined,
      });

      // Optimistically append the message local state; duplicate message check inside the
      // WebSocket receiver ensures it doesn't double-render when broadcasted.
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
      shouldScrollToBottomRef.current = true;
      scrollBehaviorRef.current = "smooth";
      setActiveReplyTo(null);

      await markConversationRead(chat.id, newMessage.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleEditMessage = async (messageId: string, newText: string) => {
    if (!chat) return;

    const updatedMessage = await editMessage(chat.id, messageId, newText);

    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? updatedMessage : msg))
    );
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!chat) return;

    await deleteMessage(chat.id, messageId);

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              content: null,
              is_deleted: true,
              updated_at: new Date().toISOString(),
            }
          : msg
      )
    );
  };

  // --- Topic Handlers (Task #22 / #49) ---
  const handleCreateTopic = async (name: string) => {
    if (!chat) return;

    const topic = await createTopic(chat.id, name);
    setTopics((prev) => [...prev, topic]);
  };

  const handleRenameTopic = async (topicId: string, name: string) => {
    if (!chat) return;

    const updated = await renameTopic(chat.id, topicId, name);
    setTopics((prev) => prev.map((t) => (t.id === topicId ? updated : t)));
  };

  const handleDeleteTopic = async (topicId: string) => {
    if (!chat) return;

    await deleteTopic(chat.id, topicId);
    setTopics((prev) => prev.filter((t) => t.id !== topicId));

    if (activeTopicId === topicId) {
      setActiveTopicId(null);
    }
  };

  const handleUserClick = async (
    userId: string,
    source: "CHAT" | "GROUP_PROFILE" = "GROUP_PROFILE"
  ) => {
    setProfileSource(source);
    setShowProfile(true);
    setProfileViewType("user");
    setProfileLoading(true);

    try {
      setUserProfile(await getUserProfile(userId));
    } catch (err) {
      console.error("Failed to load user profile", err);
    } finally {
      setProfileLoading(false);
    }
  };

  // A global-search user result was clicked in Sidebar.
  // Fetch the full profile and open the same ProfileOverlay used elsewhere.
  useEffect(() => {
    if (!profileUserToOpen) return;

    void handleUserClick(String(profileUserToOpen.id));
    onProfileUserOpened?.();
    // handleUserClick is intentionally not included because it is recreated
    // during renders; this effect should run only for a newly supplied user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileUserToOpen, onProfileUserOpened]);

  const handleHeaderClick = async () => {
    // Pending DMs do not have a real chat yet, but must open the same
    // user ProfileOverlay flow as established DM conversations.
    if (!chat && pendingDirectMessageUser) {
      await handleUserClick(
        String(pendingDirectMessageUser.id),
        "GROUP_PROFILE"
      );
      return;
    }

    if (!chat) return;

    if (chatType === "GROUP") {
      setShowProfile(true);
      setProfileViewType("group");

      if (!groupProfile || groupProfile.id !== chat.id) {
        setProfileLoading(true);

        try {
          const [profileData, membersData] = await Promise.all([
            getGroupProfile(chat.id),
            getGroupMembers(chat.id),
          ]);

          setGroupProfile(profileData);
          setGroupMembers(membersData);
        } catch (err) {
          console.error("Failed to load group details", err);
        } finally {
          setProfileLoading(false);
        }
      }
    } else if (chatType === "DM") {
      const otherUserId = chat.other_user_id
        ? String(chat.other_user_id)
        : null;

      if (otherUserId) {
        handleUserClick(otherUserId);
      }
    } else if (chatType === "CHANNEL") {
      setShowProfile(true);
      setProfileViewType("channel");

      if (
        !channelProfile ||
        channelProfile.id !== chat.id ||
        !channelPermissions
      ) {
        setProfileLoading(true);

        try {
          const [profileData, permissionsData] = await Promise.all([
            getChannelProfile(chat.id),
            getPermissions(chat.id),
          ]);

          setChannelProfile(profileData);
          setChannelPermissions(permissionsData);

          if (
            permissionsData.is_owner ||
            permissionsData.can_manage_members
          ) {
            const membersData = await getChannelMembers(chat.id);
            setChannelMembers(membersData);
          }

          if (permissionsData.is_owner) {
            const rolesData = await getChannelRoles(chat.id);
            setChannelRoles(rolesData);
          }
        } catch (err) {
          console.error("Failed to load channel details", err);
        } finally {
          setProfileLoading(false);
        }
      }
    }
  };

  const handleSaveGroupEdit = async (
    name: string,
    desc: string,
    avatar: File | null
  ) => {
    if (!chat) return;

    try {
      const updatedProfile = await updateGroupProfile(chat.id, {
        name,
        description: desc,
        avatar,
      });

      setGroupProfile(updatedProfile);
      setLocalChatInfo({
        name: updatedProfile.name,
        avatar: updatedProfile.avatar_url || chat.avatar,
      });
    } catch (error) {
      console.error("Failed to update group:", error);
      alert("Failed to update group details.");
    }
  };

  const handleSaveChannelEdit = async (
    name: string,
    desc: string,
    avatar: File | null
  ) => {
    if (!chat) return;

    try {
      const updatedProfile = await updateChannel(chat.id, {
        name,
        description: desc,
        avatar,
      });

      setChannelProfile(updatedProfile);
      setLocalChatInfo({
        name: updatedProfile.name,
        avatar: updatedProfile.avatar_url || chat.avatar,
      });
    } catch (error) {
      console.error("Failed to update channel:", error);
      throw error;
    }
  };

  const confirmRemoveMember = async () => {
    if (!chat || !memberToRemove) return;

    try {
      await removeGroupMember(chat.id, memberToRemove.user_id);

      setGroupMembers((prev) =>
        prev
          ? prev.filter((m) => m.user_id !== memberToRemove.user_id)
          : null
      );

      setGroupProfile((prev) =>
        prev ? { ...prev, member_count: Number(prev.member_count) - 1 } : null
      );

      setMemberToRemove(null);
    } catch (error) {
      console.error("Failed to remove member:", error);
      alert("Failed to remove group member.");
    }
  };

  const handleRemoveChannelMember = async (member: any) => {
    if (!chat) return;

    const isConfirmed = window.confirm(
      `Are you sure you want to remove ${member.display_name} from the channel?`
    );

    if (!isConfirmed) return;

    try {
      await removeChannelMember(chat.id, member.user_id);

      if (channelMembers) {
        setChannelMembers(
          channelMembers.filter((m) => m.user_id !== member.user_id)
        );
      }
    } catch (error) {
      console.error("Failed to remove channel member:", error);
      alert("Failed to remove member. You might not have the correct permissions.");
    }
  };

  const handleCreateRole = async (name: string) => {
    if (!chat) return;

    try {
      const newRole = await createChannelRole(chat.id, name);
      setChannelRoles((prev) => (prev ? [...prev, newRole] : [newRole]));
    } catch (error) {
      console.error("Failed to create role:", error);
      throw error;
    }
  };

  const handleLeaveGroup = async () => {
    if (!chat) return;

    try {
      setLeaveLoading(true);
      await leaveGroup(chat.id);
      setShowLeaveConfirm(false);
      setShowProfile(false);
      onGroupExit?.(chat.id);
    } catch (error) {
      console.error("Failed to leave group:", error);
      alert("Failed to leave the group.");
    } finally {
      setLeaveLoading(false);
    }
  };

  const handleLeaveChannel = async () => {
    if (!chat) return;

    try {
      setLeaveLoading(true);
      await leaveGroup(chat.id);
      setShowLeaveChannelConfirm(false);
      setShowProfile(false);
      onGroupExit?.(chat.id);
    } catch (error) {
      console.error("Failed to leave channel:", error);
      alert("Failed to leave the channel.");
    } finally {
      setLeaveLoading(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!chat) return;

    try {
      setDeleteGroupLoading(true);
      await deleteGroup(chat.id);
      setShowDeleteGroupConfirm(false);
      setShowProfile(false);
      onGroupExit?.(chat.id);
    } catch (error) {
      console.error("Failed to delete group:", error);
      alert("Failed to delete the group.");
    } finally {
      setDeleteGroupLoading(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!chat) return;

    try {
      setDeleteChannelLoading(true);
      await deleteChannel(chat.id);
      setShowDeleteChannelConfirm(false);
      setShowProfile(false);
      onGroupExit?.(chat.id);
    } catch (error) {
      console.error("Failed to delete channel:", error);
      alert("Failed to delete the channel.");
    } finally {
      setDeleteChannelLoading(false);
    }
  };

  const scrollToMessage = async (targetMessage: Message) => {
    if (!chat) return;

    const scrollAndHighlight = (): boolean => {
      const el = document.getElementById(`msg-${targetMessage.id}`);
      if (!el) return false;

      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("message-highlight-flash");

      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }

      highlightTimeoutRef.current = window.setTimeout(() => {
        el.classList.remove("message-highlight-flash");
      }, 1600);

      return true;
    };

    setShowSearch(false);

    // If a result belongs to another channel topic, switch topics first.
    if (chatType === "CHANNEL") {
      const targetTopicId = targetMessage.topic_id ?? null;

      if (targetTopicId !== activeTopicId) {
        setActiveTopicId(targetTopicId);
      }
    }

    requestAnimationFrame(() => {
      if (scrollAndHighlight()) return;

      (async () => {
        try {
          const data = await getConversationMessages(chat.id);

          const sorted = [...data].sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          );

          setMessages(sorted);
          requestAnimationFrame(() =>
            requestAnimationFrame(scrollAndHighlight)
          );
        } catch (err) {
          console.error(
            "Failed to load message history for search result:",
            err
          );
        }
      })();
    });
  };

  const senderAvatarById = useMemo(() => {
    const map: Record<string, string> = {};

    groupMembers?.forEach((m) => {
      map[String(m.user_id)] = m.avatar_url || "";
    });

    return map;
  }, [groupMembers]);

  // Task #22/#49 — channel messages are separated by topic.
  // `null` represents the default General topic.
  const displayedMessages = useMemo(() => {
    if (chatType !== "CHANNEL") return messages;

    return messages.filter(
      (message) => (message.topic_id ?? null) === activeTopicId
    );
  }, [messages, chatType, activeTopicId]);

  if (
    !chat &&
    !pendingDirectMessageUser &&
    !profileUserToOpen &&
    !showProfile
  ) {
    return (
      <div
        className="chat-placeholder"
        style={{ display: "flex", flexDirection: "column", gap: "2rem" }}
      >
        <div>Select a chat to start messaging</div>
      </div>
    );
  }

  return (
    <div
      className="chat-view"
      style={{ position: "relative", overflow: "hidden" }}
    >
      <ConfirmModal
        isOpen={!!memberToRemove}
        title="Remove Member"
        message={
          <>
            Are you sure you want to remove{" "}
            <span>{memberToRemove?.display_name}</span> from the group?
          </>
        }
        confirmText="Remove"
        onConfirm={confirmRemoveMember}
        onCancel={() => setMemberToRemove(null)}
      />

      <ConfirmModal
        isOpen={showLeaveConfirm}
        title="Leave Group"
        message="Are you sure you want to leave this group? You'll stop receiving messages from it."
        confirmText={leaveLoading ? "Leaving..." : "Leave Group"}
        isLoading={leaveLoading}
        onConfirm={handleLeaveGroup}
        onCancel={() => setShowLeaveConfirm(false)}
      />

      <ConfirmModal
        isOpen={showDeleteGroupConfirm}
        title="Delete Group"
        message="This will permanently delete this group and all its messages and media for every member. This action cannot be undone."
        confirmText={deleteGroupLoading ? "Deleting..." : "Delete for everyone"}
        isLoading={deleteGroupLoading}
        isDanger={true}
        onConfirm={handleDeleteGroup}
        onCancel={() => setShowDeleteGroupConfirm(false)}
      />

      <ConfirmModal
        isOpen={showLeaveChannelConfirm}
        title="Leave Channel"
        message="Are you sure you want to leave this channel? You'll stop receiving updates from it."
        confirmText={leaveLoading ? "Leaving..." : "Leave Channel"}
        isLoading={leaveLoading}
        onConfirm={handleLeaveChannel}
        onCancel={() => setShowLeaveChannelConfirm(false)}
      />

      <ConfirmModal
        isOpen={showDeleteChannelConfirm}
        title="Delete Channel"
        message="This will permanently delete this channel and all its messages and media for every member. This action cannot be undone."
        confirmText={
          deleteChannelLoading ? "Deleting..." : "Delete Channel"
        }
        isLoading={deleteChannelLoading}
        isDanger={true}
        onConfirm={handleDeleteChannel}
        onCancel={() => setShowDeleteChannelConfirm(false)}
      />

      <ChatHeader
        chat={headerChat!}
        localChatInfo={
          chat
            ? localChatInfo
            : {
                name: headerChat?.name || "New message",
                avatar: headerChat?.avatar || "",
              }
        }
        isMobile={isMobile}
        onBack={onBack}
        onHeaderClick={handleHeaderClick}
        onToggleSearch={() => {
          // A pending DM has no actual conversation ID to search.
          if (!chat) return;

          setShowProfile(false);
          setShowSearch((prev) => !prev);
        }}
        isOtherUserOnline={activeOtherUserOnline}
      />

      {showSearch && chat && (
        <MessageSearchPanel
          conversationId={chat.id}
          onClose={() => setShowSearch(false)}
          onResultClick={scrollToMessage}
        />
      )}

      <ProfileOverlay
        show={showProfile}
        profileViewType={profileViewType}
        profileSource={profileSource}
        profileLoading={profileLoading}
        groupProfile={groupProfile}
        channelProfile={channelProfile}
        channelPermissions={channelPermissions}
        channelMembers={channelMembers}
        channelRoles={channelRoles || undefined}
        groupMembers={groupMembers}
        userProfile={userProfile}
        chatAvatar={headerChat?.avatar || ""}
        isCurrentUserOwner={isCurrentUserOwner}
        currentUserId={currentUserId}
        onClose={() => {
          setShowProfile(false);

          // If this screen exists only because a global-search profile was opened,
          // return to the sidebar after closing the overlay.
          if (!chat && !pendingDirectMessageUser) {
            onBack();
          }
        }}
        onBackToGroup={() => setProfileViewType("group")}
        onSaveGroupEdit={handleSaveGroupEdit}
        onSaveChannelEdit={handleSaveChannelEdit}
        onUserClick={handleUserClick}
        onRemoveMember={setMemberToRemove}
        onRemoveChannelMember={handleRemoveChannelMember}
        onCreateRole={handleCreateRole}
        onLeaveGroupRequest={() => setShowLeaveConfirm(true)}
        onDeleteGroupRequest={() => setShowDeleteGroupConfirm(true)}
        onLeaveChannelRequest={() => setShowLeaveChannelConfirm(true)}
        onDeleteChannelRequest={() => setShowDeleteChannelConfirm(true)}
        onlineUsers={onlineUsers}
        onRefreshProfile={() =>
          userProfile?.id && handleUserClick(userProfile.id)
        }
        onStartDirectMessage={async (user) => {
          setShowProfile(false);
          await onStartDirectMessage?.(user);
        }}
      />

      <div className="chat-view-body">
        {chatType === "CHANNEL" && channelPermissions && (
          <TopicsPanel
            topics={topics}
            activeTopicId={activeTopicId}
            onSelectTopic={setActiveTopicId}
            canCreateTopic={!!channelPermissions.can_create_topic}
            canManageOthersTopics={
              !!(
                channelPermissions.can_manage_others_topics ||
                channelPermissions.is_owner
              )
            }
            currentUserId={currentUserId}
            onCreateTopic={handleCreateTopic}
            onRenameTopic={handleRenameTopic}
            onDeleteTopic={handleDeleteTopic}
          />
        )}

        {loading && (
          <div className="chat-placeholder">Loading messages...</div>
        )}

        {!loading && error && (
          <div className="chat-placeholder">{error}</div>
        )}

        {!loading && !error && displayedMessages.length === 0 && (
          <div className="chat-placeholder">No messages yet.</div>
        )}

        {!loading && !error && displayedMessages.length > 0 && (
          <div className="message-history">
            {displayedMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                currentUserId={currentUserId}
                currentUsername={currentUsername}
                replyMessage={
                  msg.reply_to
                    ? messages.find((message) => message.id === msg.reply_to) ||
                      null
                    : null
                }
                canDeleteOthers={canDeleteOthersMessages}
                isGroupChat={chatType === "GROUP"}
                senderAvatarUrl={senderAvatarById[String(msg.sender)]}
                canReply={
                  chatType === "CHANNEL"
                    ? (channelPermissions?.can_send_messages ?? false)
                    : true
                }
                onReply={setActiveReplyTo}
                onEdit={handleEditMessage}
                onDelete={handleDeleteMessage}
                onAvatarClick={(userId) => handleUserClick(userId, "CHAT")}
                onGroupJoined={onGroupJoined}
              />
            ))}

            <div ref={messagesEndRef} />
          </div>
        )}

        {sendingMessage && (
          <div className="sticky bottom-0 left-0 right-0 bg-[#1db954]/20 text-[#1db954] px-4 py-1.5 text-xs text-center font-medium backdrop-blur-sm border-t border-[#1db954]/30 animate-pulse">
            ⏳ Sending attachment(s)... Please wait.
          </div>
        )}
      </div>

      {(chat || pendingDirectMessageUser) && (
        <MessageInput
          activeReplyTo={activeReplyTo}
          onCancelReply={() => setActiveReplyTo(null)}
          onSendMessage={handleSendMessage}
          disabled={loading || sendingMessage}
          canSendMessages={
            chatType === "CHANNEL"
              ? (channelPermissions?.can_send_messages ?? false)
              : true
          }
        />
      )}
    </div>
  );
}
