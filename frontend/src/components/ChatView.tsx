import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createDirectMessage,
  deleteMessage,
  editMessage,
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
} from "../services/chatService";
import {
  deleteGroup,
  getGroupMembers,
  getGroupProfile,
  leaveGroup,
  removeGroupMember,
  updateGroupProfile,
} from "../services/groupService";
import { getUserProfile } from "../services/users";
import {
  createChannelRole,
  deleteChannel,
  getChannelMembers,
  getChannelProfile,
  getChannelRoles,
  getPermissions,
  removeChannelMember,
  updateChannel,
} from "../services/channelService";
import {
  createTopic,
  deleteTopic,
  getTopics,
  renameTopic,
} from "../services/topicService";
import {
  realtimeService,
  type ConversationUpdatePayload,
} from "../services/realtimeService";

import type {
  ChannelMembers,
  ChannelPermissions,
  ChannelProfile,
  ChatListItem,
  GroupMembers,
  GroupProfile,
  Message,
  Topic,
} from "../types/chat";
import type { BackendUserProfile, UserProfile } from "../types/user";

import ChatHeader from "./ChatHeader";
import ConfirmModal from "./ConfirmModal";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import MessageSearchPanel from "./MessageSearchPanel";
import ProfileOverlay from "./ProfileOverlay";
import TopicsPanel from "./TopicsPanel";

interface Props {
  chat: ChatListItem | null;
  isMobile: boolean;
  onBack: () => void;
  onGroupExit?: (groupId: string) => void;
  onGroupJoined?: (groupId: string) => void;
  isOtherUserOnline?: boolean;
  onlineUsers: Record<string, boolean>;
  pendingDirectMessageUser?: BackendUserProfile | null;

  profileUserToOpen?: BackendUserProfile | null;
  onProfileUserOpened?: () => void;

  onStartDirectMessage?: (
    user: BackendUserProfile | UserProfile
  ) => Promise<void> | void;

  onDirectMessageCreated?: (conversationId: string) => Promise<void>;
  
  // Prop added for handling realtime user profile updates
  userProfileUpdates?: Record<
    string,
    {
      display_name?: string;
      avatar_url?: string;
    }
  >;
}

type ProfileViewType = "group" | "user" | "channel" | null;
type ProfileSource = "CHAT" | "GROUP_PROFILE";

const sortMessagesByDate = (messages: Message[]): Message[] =>
  [...messages].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

const isSameId = (left: unknown, right: unknown) =>
  String(left) === String(right);

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
  userProfileUpdates = {},
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const [activeReplyTo, setActiveReplyTo] = useState<Message | null>(null);
  const [localChatInfo, setLocalChatInfo] = useState<{
    name: string;
    avatar: string;
  } | null>(null);

  const [showProfile, setShowProfile] = useState(false);
  const [profileViewType, setProfileViewType] =
    useState<ProfileViewType>(null);
  const [profileSource, setProfileSource] =
    useState<ProfileSource>("GROUP_PROFILE");
  const [profileLoading, setProfileLoading] = useState(false);

  const [groupProfile, setGroupProfile] = useState<GroupProfile | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMembers | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const [channelProfile, setChannelProfile] =
    useState<ChannelProfile | null>(null);
  const [channelPermissions, setChannelPermissions] =
    useState<ChannelPermissions | null>(null);
  const [channelMembers, setChannelMembers] =
    useState<ChannelMembers | null>(null);
  const [channelRoles, setChannelRoles] = useState<any[] | null>(null);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  const [memberToRemove, setMemberToRemove] = useState<any>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showLeaveChannelConfirm, setShowLeaveChannelConfirm] =
    useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);

  const [showDeleteGroupConfirm, setShowDeleteGroupConfirm] = useState(false);
  const [deleteGroupLoading, setDeleteGroupLoading] = useState(false);

  const [showDeleteChannelConfirm, setShowDeleteChannelConfirm] =
    useState(false);
  const [deleteChannelLoading, setDeleteChannelLoading] = useState(false);

  const [showSearch, setShowSearch] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(false);
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto");
  const highlightTimeoutRef = useRef<number | null>(null);

  /**
   * Refs are deliberately used in WebSocket callbacks so those callbacks
   * always know the current conversation/profile state without making
   * the socket effect re-run for unrelated UI changes.
   */
  const mountedRef = useRef(true);
  const currentChatIdRef = useRef<string | null>(null);
  const currentChatRef = useRef<ChatListItem | null>(null);
  const showProfileRef = useRef(false);
  const refreshProfileRef = useRef<(() => Promise<void>) | null>(null);

  const currentUserId =
    typeof window !== "undefined" ? localStorage.getItem("Id") : null;

  const currentUsername = useMemo(() => {
    if (typeof window === "undefined") return null;

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
  }, []);

  const chatType = chat?.type?.toUpperCase() ?? "";

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

  const canDeleteOthersMessages =
    chatType === "GROUP"
      ? isCurrentUserOwner
      : chatType === "CHANNEL"
        ? !!(
            channelPermissions?.is_owner ||
            channelPermissions?.can_delete_messages
          )
        : false;

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

    const otherUserId = String(chat.other_user_id);

    return otherUserId in onlineUsers
      ? onlineUsers[otherUserId]
      : !!isOtherUserOnline;
  }, [
    chat?.other_user_id,
    chatType,
    isOtherUserOnline,
    onlineUsers,
    pendingDirectMessageUser,
  ]);

  const senderAvatarById = useMemo(() => {
    const avatarMap: Record<string, string> = {};

    groupMembers?.forEach((member) => {
      const memberId = String(member.user_id);
      const update = userProfileUpdates[memberId];
      avatarMap[memberId] = update?.avatar_url || member.avatar_url || "";
    });

    return avatarMap;
  }, [groupMembers, userProfileUpdates]);

  const displayedMessages = useMemo(() => {
    if (chatType !== "CHANNEL") return messages;

    return messages.filter(
      (message) => (message.topic_id ?? null) === activeTopicId
    );
  }, [activeTopicId, chatType, messages]);

  /**
   * Keep refs synchronized with current React state/props.
   */
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    currentChatIdRef.current = chat?.id ?? null;
    currentChatRef.current = chat;
  }, [chat]);

  useEffect(() => {
    showProfileRef.current = showProfile;
  }, [showProfile]);

  useEffect(() => {
    if (!chat) {
      setLocalChatInfo(null);
      return;
    }

    setLocalChatInfo({
      name: chat.name,
      avatar: chat.avatar,
    });
  }, [chat?.avatar, chat?.id, chat?.name]);

  /**
   * Dynamic local messages sync on user profile update.
   * Modifies messages sender info inline without REST request.
   */
    useEffect(() => {
      if (Object.keys(userProfileUpdates).length === 0) return;

      setMessages((prevMessages) =>
        prevMessages.map((message) => {
          const senderId = String(message.sender);
          const update = userProfileUpdates[senderId];

          if (!update) return message;

          return {
            ...message,
            sender_display_name:
              update.display_name ?? message.sender_display_name,
              sender_username:  message.sender_username,
          };
        })
      );
    }, [userProfileUpdates]);



  const refreshCurrentProfile = useCallback(async () => {
    const activeChat = currentChatRef.current;

    if (!activeChat || !showProfileRef.current) return;

    const activeChatType = activeChat.type.toUpperCase();

    try {
      if (activeChatType === "GROUP") {
        const [profileData, membersData] = await Promise.all([
          getGroupProfile(activeChat.id),
          getGroupMembers(activeChat.id),
        ]);

        if (!mountedRef.current) return;
        if (!isSameId(currentChatIdRef.current, activeChat.id)) return;

        setGroupProfile(profileData);
        setGroupMembers(membersData);
        return;
      }

      if (activeChatType === "CHANNEL") {
        const [profileData, permissionsData] = await Promise.all([
          getChannelProfile(activeChat.id),
          getPermissions(activeChat.id),
        ]);

        if (!mountedRef.current) return;
        if (!isSameId(currentChatIdRef.current, activeChat.id)) return;

        setChannelProfile(profileData);
        setChannelPermissions(permissionsData);

        if (
          permissionsData.is_owner ||
          permissionsData.can_manage_members
        ) {
          const membersData = await getChannelMembers(activeChat.id);

          if (
            mountedRef.current &&
            isSameId(currentChatIdRef.current, activeChat.id)
          ) {
            setChannelMembers(membersData);
          }
        }

        if (permissionsData.is_owner) {
          const rolesData = await getChannelRoles(activeChat.id);

          if (
            mountedRef.current &&
            isSameId(currentChatIdRef.current, activeChat.id)
          ) {
            setChannelRoles(rolesData);
          }
        }
      }
    } catch (refreshError) {
      console.error(
        "Failed to refresh currently opened profile after realtime update:",
        refreshError
      );
    }
  }, []);

  useEffect(() => {
    refreshProfileRef.current = refreshCurrentProfile;
  }, [refreshCurrentProfile]);

  /**
   * Conversation WebSocket lifecycle.
   */
  useEffect(() => {
    const conversationId = chat?.id ?? null;

    if (!conversationId) return;

    let cancelled = false;

    const unsubscribeNewMessage =
      realtimeService.subscribeToConversationMessages(
        (type: string, incomingMessage: Message) => {
          console.log("WS Conversation Event:", type, incomingMessage);
          if (cancelled || !mountedRef.current) return;

          if (
            incomingMessage.conversation !== undefined &&
            !isSameId(incomingMessage.conversation, currentChatIdRef.current)
          ) {
            return;
          }

          if (type === "new_message") {
            setMessages((previousMessages) => {
              const alreadyExists = previousMessages.some((message) =>
                isSameId(message.id, incomingMessage.id)
              );

              if (alreadyExists) return previousMessages;

              shouldScrollToBottomRef.current = true;
              scrollBehaviorRef.current = "smooth";

              return sortMessagesByDate([
                ...previousMessages,
                incomingMessage,
              ]);
            });

            void markConversationRead(conversationId, incomingMessage.id).catch(
              (readError) => {
                console.warn(
                  "Could not mark realtime message as read:",
                  readError
                );
              }
            );
          } else if (type === "message_updated") {
            setMessages((previousMessages) =>
              previousMessages.map((message) =>
                isSameId(message.id, incomingMessage.id)
                  ? { ...message, ...incomingMessage }
                  : message
              )
            );
          } else if (type === "message_deleted") {
            setMessages((previousMessages) =>
              previousMessages.filter(
                (message) => !isSameId(message.id, incomingMessage.id) 
              )
            );
          }
        }
      );

    const unsubscribeUpdates = realtimeService.subscribeToUpdates(
      (update: ConversationUpdatePayload) => {
        if (cancelled || !mountedRef.current) return;

        if (
          !isSameId(update.conversation_id, currentChatIdRef.current)
        ) {
          return;
        }

        if (update.event_type === "message_updated" && update.last_message) {
          setMessages((previousMessages) =>
            previousMessages.map((message) =>
              isSameId(message.id, update.last_message?.id)
                ? {
                    ...message,
                    ...update.last_message,
                  }
                : message
            )
          );
          return;
        }

        if (update.event_type === "member_left") {
          if (showProfileRef.current) {
            void refreshProfileRef.current?.();
          }
        }
      }
    );

    realtimeService.connectConversationSocket(conversationId);

    return () => {
      cancelled = true;

      unsubscribeNewMessage();
      unsubscribeUpdates();

      realtimeService.disconnectConversationSocket();
    };
  }, [chat?.id]);

  /**
   * Reset UI and load message history only when conversation identity changes.
   */
  useEffect(() => {
    const conversationId = chat?.id ?? null;

    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      setError("");
      setActiveReplyTo(null);

      setGroupProfile(null);
      setGroupMembers(null);
      setChannelProfile(null);
      setChannelPermissions(null);
      setChannelMembers(null);
      setChannelRoles(null);

      setTopics([]);
      setActiveTopicId(null);
      return;
    }

    let cancelled = false;

    setShowProfile(false);
    setProfileViewType(null);
    setProfileLoading(false);
    setProfileSource("GROUP_PROFILE");

    setMemberToRemove(null);
    setShowLeaveConfirm(false);
    setShowLeaveChannelConfirm(false);
    setShowDeleteGroupConfirm(false);
    setShowDeleteChannelConfirm(false);
    setShowSearch(false);

    setGroupProfile(null);
    setGroupMembers(null);
    setChannelProfile(null);
    setChannelPermissions(null);
    setChannelMembers(null);
    setChannelRoles(null);
    setTopics([]);
    setActiveTopicId(null);

    setMessages([]);
    setActiveReplyTo(null);
    setError("");
    setLoading(true);

    const loadMessages = async () => {
      try {
        const fetchedMessages = await getConversationMessages(conversationId);

        if (cancelled || !mountedRef.current) return;
        if (!isSameId(currentChatIdRef.current, conversationId)) return;

        const sortedFetchedMessages = sortMessagesByDate(fetchedMessages);

        setMessages((currentMessages) => {
          const byId = new Map<string, Message>();

          sortedFetchedMessages.forEach((message) => {
            byId.set(String(message.id), message);
          });

          currentMessages.forEach((message) => {
            byId.set(String(message.id), message);
          });

          return sortMessagesByDate([...byId.values()]);
        });

        shouldScrollToBottomRef.current = true;
        scrollBehaviorRef.current = "auto";

        if (sortedFetchedMessages.length > 0) {
          const lastMessage =
            sortedFetchedMessages[sortedFetchedMessages.length - 1];

          void markConversationRead(conversationId, lastMessage.id).catch(
            (readError) => {
              console.warn(
                "Could not mark loaded messages as read:",
                readError
              );
            }
          );
        }
      } catch (loadError) {
        if (!cancelled && mountedRef.current) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load messages"
          );
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    };

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [chat?.id]);

  /**
   * Load initial group/channel context once per conversation.
   */
  useEffect(() => {
    const conversationId = chat?.id ?? null;
    const currentChatType = chat?.type?.toUpperCase() ?? "";

    if (!conversationId) return;

    let cancelled = false;

    const loadChatContext = async () => {
      try {
        if (currentChatType === "GROUP") {
          const [profileData, membersData] = await Promise.all([
            getGroupProfile(conversationId),
            getGroupMembers(conversationId),
          ]);

          if (cancelled || !mountedRef.current) return;
          if (!isSameId(currentChatIdRef.current, conversationId)) return;

          setGroupProfile(profileData);
          setGroupMembers(membersData);

          setLocalChatInfo({
            name: profileData.name,
            avatar: profileData.avatar_url || chat?.avatar || "",
          });

          return;
        }

        if (currentChatType === "CHANNEL") {
          const [permissionsData, topicsData] = await Promise.all([
            getPermissions(conversationId),
            getTopics(conversationId),
          ]);

          if (cancelled || !mountedRef.current) return;
          if (!isSameId(currentChatIdRef.current, conversationId)) return;

          setChannelPermissions(permissionsData);
          setTopics(topicsData);
        }
      } catch (contextError) {
        console.error(
          "Failed to load initial conversation context:",
          contextError
        );
      }
    };

    void loadChatContext();

    return () => {
      cancelled = true;
    };
  }, [chat?.avatar, chat?.id, chat?.type]);

  useEffect(() => {
    if (loading || !shouldScrollToBottomRef.current) return;

    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: scrollBehaviorRef.current,
      });

      shouldScrollToBottomRef.current = false;
    });
  }, [chat?.id, loading, messages.length]);

  const handleSendMessage = async (text: string, files: File[] = []) => {
    if (!chat && !pendingDirectMessageUser) return;

    try {
      setSendingMessage(true);

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

      setMessages((previousMessages) => {
        if (
          previousMessages.some((message) =>
            isSameId(message.id, newMessage.id)
          )
        ) {
          return previousMessages;
        }

        shouldScrollToBottomRef.current = true;
        scrollBehaviorRef.current = "smooth";

        return sortMessagesByDate([...previousMessages, newMessage]);
      });

      setActiveReplyTo(null);

      void markConversationRead(chat.id, newMessage.id).catch((readError) => {
        console.warn(
          "Could not mark sent message as read:",
          readError
        );
      });
    } catch (sendError) {
      alert(
        sendError instanceof Error
          ? sendError.message
          : "Failed to send message"
      );
    } finally {
      if (mountedRef.current) {
        setSendingMessage(false);
      }
    }
  };

  const handleEditMessage = async (
    messageId: string,
    newText: string
  ) => {
    if (!chat) return;

    try {
      const updatedMessage = await editMessage(chat.id, messageId, newText);

      setMessages((previousMessages) =>
        previousMessages.map((message) =>
          isSameId(message.id, messageId) ? updatedMessage : message
        )
      );
    } catch (editError) {
      console.error("Failed to edit message:", editError);
      alert(
        editError instanceof Error
          ? editError.message
          : "Failed to edit message"
      );
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!chat) return;

    try {
      await deleteMessage(chat.id, messageId);

      setMessages((previousMessages) =>
        previousMessages.filter((message) => !isSameId(message.id, messageId))
      );
    } catch (deleteError) {
      console.error("Failed to delete message:", deleteError);
      alert(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete message"
      );
    }
  };

  const handleCreateTopic = async (name: string) => {
    if (!chat) return;

    try {
      const topic = await createTopic(chat.id, name);
      setTopics((previousTopics) => [...previousTopics, topic]);
    } catch (topicError) {
      console.error("Failed to create topic:", topicError);
      alert("Failed to create topic.");
    }
  };

  const handleRenameTopic = async (topicId: string, name: string) => {
    if (!chat) return;

    try {
      const updatedTopic = await renameTopic(chat.id, topicId, name);

      setTopics((previousTopics) =>
        previousTopics.map((topic) =>
          isSameId(topic.id, topicId) ? updatedTopic : topic
        )
      );
    } catch (topicError) {
      console.error("Failed to rename topic:", topicError);
      alert("Failed to rename topic.");
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    if (!chat) return;

    try {
      await deleteTopic(chat.id, topicId);

      setTopics((previousTopics) =>
        previousTopics.filter((topic) => !isSameId(topic.id, topicId))
      );

      if (isSameId(activeTopicId, topicId)) {
        setActiveTopicId(null);
      }
    } catch (topicError) {
      console.error("Failed to delete topic:", topicError);
      alert("Failed to delete topic.");
    }
  };

  const handleUserClick = async (
    userId: string,
    source: ProfileSource = "GROUP_PROFILE"
  ) => {
    setProfileSource(source);
    setShowProfile(true);
    setProfileViewType("user");
    setProfileLoading(true);

    try {
      const profile = await getUserProfile(userId);

      if (mountedRef.current) {
        setUserProfile(profile);
      }
    } catch (profileError) {
      console.error("Failed to load user profile:", profileError);
    } finally {
      if (mountedRef.current) {
        setProfileLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!profileUserToOpen) return;

    void handleUserClick(String(profileUserToOpen.id), "GROUP_PROFILE");
    onProfileUserOpened?.();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileUserToOpen]);

  const handleHeaderClick = async () => {
    if (!chat && pendingDirectMessageUser) {
      await handleUserClick(
        String(pendingDirectMessageUser.id),
        "GROUP_PROFILE"
      );
      return;
    }

    if (!chat) return;

    if (chatType === "DM") {
      const otherUserId = chat.other_user_id
        ? String(chat.other_user_id)
        : null;

      if (otherUserId) {
        await handleUserClick(otherUserId, "CHAT");
      }

      return;
    }

    if (chatType === "GROUP") {
      setShowProfile(true);
      setProfileViewType("group");

      if (!groupProfile || !isSameId(groupProfile.id, chat.id)) {
        setProfileLoading(true);

        try {
          const [profileData, membersData] = await Promise.all([
            getGroupProfile(chat.id),
            getGroupMembers(chat.id),
          ]);

          if (!mountedRef.current) return;

          setGroupProfile(profileData);
          setGroupMembers(membersData);
        } catch (groupError) {
          console.error("Failed to load group details:", groupError);
        } finally {
          if (mountedRef.current) {
            setProfileLoading(false);
          }
        }
      }

      return;
    }

    if (chatType === "CHANNEL") {
      setShowProfile(true);
      setProfileViewType("channel");

      if (
        !channelProfile ||
        !isSameId(channelProfile.id, chat.id) ||
        !channelPermissions
      ) {
        setProfileLoading(true);

        try {
          const [profileData, permissionsData] = await Promise.all([
            getChannelProfile(chat.id),
            getPermissions(chat.id),
          ]);

          if (!mountedRef.current) return;

          setChannelProfile(profileData);
          setChannelPermissions(permissionsData);

          if (
            permissionsData.is_owner ||
            permissionsData.can_manage_members
          ) {
            const membersData = await getChannelMembers(chat.id);

            if (mountedRef.current) {
              setChannelMembers(membersData);
            }
          }

          if (permissionsData.is_owner) {
            const rolesData = await getChannelRoles(chat.id);

            if (mountedRef.current) {
              setChannelRoles(rolesData);
            }
          }
        } catch (channelError) {
          console.error("Failed to load channel details:", channelError);
        } finally {
          if (mountedRef.current) {
            setProfileLoading(false);
          }
        }
      }
    }
  };

  const handleSaveGroupEdit = async (
    name: string,
    description: string,
    avatar: File | null
  ) => {
    if (!chat) return;

    try {
      const updatedProfile = await updateGroupProfile(chat.id, {
        name,
        description,
        avatar,
      });

      setGroupProfile(updatedProfile);
      setLocalChatInfo({
        name: updatedProfile.name,
        avatar: updatedProfile.avatar_url || chat.avatar,
      });
    } catch (saveError) {
      console.error("Failed to update group:", saveError);
      alert("Failed to update group details.");
    }
  };

  const handleSaveChannelEdit = async (
    name: string,
    description: string,
    avatar: File | null
  ) => {
    if (!chat) return;

    try {
      const updatedProfile = await updateChannel(chat.id, {
        name,
        description,
        avatar,
      });

      setChannelProfile(updatedProfile);
      setLocalChatInfo({
        name: updatedProfile.name,
        avatar: updatedProfile.avatar_url || chat.avatar,
      });
    } catch (saveError) {
      console.error("Failed to update channel:", saveError);
      throw saveError;
    }
  };

  const confirmRemoveMember = async () => {
    if (!chat || !memberToRemove) return;

    try {
      await removeGroupMember(chat.id, memberToRemove.user_id);

      setGroupMembers((previousMembers) =>
        previousMembers
          ? previousMembers.filter(
              (member) =>
                !isSameId(member.user_id, memberToRemove.user_id)
            )
          : null
      );

      setGroupProfile((previousProfile) =>
        previousProfile
          ? {
              ...previousProfile,
              member_count: Math.max(
                0,
                Number(previousProfile.member_count) - 1
              ),
            }
          : null
      );

      setMemberToRemove(null);
    } catch (removeError) {
      console.error("Failed to remove group member:", removeError);
      alert("Failed to remove group member.");
    }
  };

  const handleRemoveChannelMember = async (member: any) => {
    if (!chat) return;

    const confirmed = window.confirm(
      `Are you sure you want to remove ${member.display_name} from the channel?`
    );

    if (!confirmed) return;

    try {
      await removeChannelMember(chat.id, member.user_id);

      setChannelMembers((previousMembers) =>
        previousMembers
          ? previousMembers.filter(
              (channelMember) =>
                !isSameId(channelMember.user_id, member.user_id)
            )
          : null
      );
    } catch (removeError) {
      console.error("Failed to remove channel member:", removeError);
      alert("Failed to remove member. You might not have permission.");
    }
  };

  const handleCreateRole = async (name: string) => {
    if (!chat) return;

    try {
      const newRole = await createChannelRole(chat.id, name);

      setChannelRoles((previousRoles) =>
        previousRoles ? [...previousRoles, newRole] : [newRole]
      );
    } catch (roleError) {
      console.error("Failed to create role:", roleError);
      throw roleError;
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
    } catch (leaveError) {
      console.error("Failed to leave group:", leaveError);
      alert("Failed to leave the group.");
    } finally {
      if (mountedRef.current) {
        setLeaveLoading(false);
      }
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
    } catch (leaveError) {
      console.error("Failed to leave channel:", leaveError);
      alert("Failed to leave the channel.");
    } finally {
      if (mountedRef.current) {
        setLeaveLoading(false);
      }
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
    } catch (deleteError) {
      console.error("Failed to delete group:", deleteError);
      alert("Failed to delete the group.");
    } finally {
      if (mountedRef.current) {
        setDeleteGroupLoading(false);
      }
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
    } catch (deleteError) {
      console.error("Failed to delete channel:", deleteError);
      alert("Failed to delete the channel.");
    } finally {
      if (mountedRef.current) {
        setDeleteChannelLoading(false);
      }
    }
  };

  const scrollToMessage = async (targetMessage: Message) => {
    if (!chat) return;

    const conversationId = chat.id;

    const scrollAndHighlight = (): boolean => {
      const messageElement = document.getElementById(
        `msg-${targetMessage.id}`
      );

      if (!messageElement) return false;

      messageElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      messageElement.classList.add("message-highlight-flash");

      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }

      highlightTimeoutRef.current = window.setTimeout(() => {
        messageElement.classList.remove("message-highlight-flash");
      }, 1600);

      return true;
    };

    setShowSearch(false);

    if (chatType === "CHANNEL") {
      const targetTopicId = targetMessage.topic_id ?? null;

      if (!isSameId(targetTopicId, activeTopicId)) {
        setActiveTopicId(targetTopicId);
      }
    }

    requestAnimationFrame(() => {
      if (scrollAndHighlight()) return;

      void (async () => {
        try {
          const fetchedMessages = await getConversationMessages(conversationId);

          if (!mountedRef.current) return;
          if (!isSameId(currentChatIdRef.current, conversationId)) return;

          setMessages((currentMessages) => {
            const byId = new Map<string, Message>();

            fetchedMessages.forEach((message) => {
              byId.set(String(message.id), message);
            });

            currentMessages.forEach((message) => {
              byId.set(String(message.id), message);
            });

            return sortMessagesByDate([...byId.values()]);
          });

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scrollAndHighlight();
            });
          });
        } catch (searchError) {
          console.error(
            "Failed to load message history for search result:",
            searchError
          );
        }
      })();
    });
  };

  if (
    !chat &&
    !pendingDirectMessageUser &&
    !profileUserToOpen &&
    !showProfile
  ) {
    return (
      <div
        className="chat-placeholder"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "2rem",
        }}
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
        confirmText={
          deleteGroupLoading ? "Deleting..." : "Delete for everyone"
        }
        isLoading={deleteGroupLoading}
        isDanger
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
        isDanger
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
          if (!chat) return;

          setShowProfile(false);
          setShowSearch((previousValue) => !previousValue);
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
        onRefreshProfile={() => {
          if (userProfile?.id) {
            void handleUserClick(String(userProfile.id), profileSource);
          }
        }}
        onStartDirectMessage={async (user) => {
          setShowProfile(false);
          await onStartDirectMessage?.(user);
        }}
        // Pass updates map to child
        userProfileUpdates={userProfileUpdates}
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
            {displayedMessages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                currentUserId={currentUserId}
                currentUsername={currentUsername}
                replyMessage={
                  message.reply_to
                    ? messages.find((candidate) =>
                        isSameId(candidate.id, message.reply_to)
                      ) || null
                    : null
                }
                canDeleteOthers={canDeleteOthersMessages}
                isGroupChat={chatType === "GROUP"}
                senderAvatarUrl={senderAvatarById[String(message.sender)]}
                canReply={
                  chatType === "CHANNEL"
                    ? (channelPermissions?.can_send_messages ?? false)
                    : true
                }
                onReply={setActiveReplyTo}
                onEdit={handleEditMessage}
                onDelete={handleDeleteMessage}
                onAvatarClick={(userId) =>
                  void handleUserClick(userId, "CHAT")
                }
                onGroupJoined={onGroupJoined}
                // Pass updates map to child
                userProfileUpdates={userProfileUpdates}
              />
            ))}

            <div ref={messagesEndRef} />
          </div>
        )}

        {sendingMessage && (
          <div className="sticky bottom-0 left-0 right-0 animate-pulse border-t border-[#1db954]/30 bg-[#1db954]/20 px-4 py-1.5 text-center text-xs font-medium text-[#1db954] backdrop-blur-sm">
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
