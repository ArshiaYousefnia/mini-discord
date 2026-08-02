import { useEffect, useMemo, useRef, useState } from "react";
import {
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
import type { UserProfile } from "../types/user";

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
import { getTopics, createTopic, renameTopic, deleteTopic } from "../services/topicService";

interface Props {
  chat: ChatListItem | null;
  isMobile: boolean;
  onBack: () => void;
  onGroupExit?: (groupId: string) => void;
  onGroupJoined?: (groupId: string) => void;
  isOtherUserOnline?: boolean;
  onlineUsers: Record<string, boolean>; 
}

export default function ChatView({
  chat,
  isMobile,
  onBack,
  onGroupExit,
  onGroupJoined,
  isOtherUserOnline,
  onlineUsers,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeReplyTo, setActiveReplyTo] = useState<Message | null>(null);
  const [localChatInfo, setLocalChatInfo] = useState<{ name: string; avatar: string } | null>(null);

  const [showProfile, setShowProfile] = useState(false);
  const [profileViewType, setProfileViewType] = useState<"group" | "user" | "channel" | null>(null);
  const [groupProfile, setGroupProfile] = useState<GroupProfile | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMembers | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSource, setProfileSource] = useState<"CHAT" | "GROUP_PROFILE">("GROUP_PROFILE");

  const [memberToRemove, setMemberToRemove] = useState<any>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showLeaveChannelConfirm, setShowLeaveChannelConfirm] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [showDeleteGroupConfirm, setShowDeleteGroupConfirm] = useState(false);
  const [deleteGroupLoading, setDeleteGroupLoading] = useState(false);
  const [showDeleteChannelConfirm, setShowDeleteChannelConfirm] = useState(false);
  const [deleteChannelLoading, setDeleteChannelLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [channelProfile, setChannelProfile] = useState<ChannelProfile | null>(null);
  const [channelPermissions, setChannelPermissions] = useState<ChannelPermissions | null>(null);
  const [channelMembers, setChannelMembers] = useState<ChannelMembers | null>(null);
  const [channelRoles, setChannelRoles] = useState<any[] | null>(null);

  // Task #22 / #49 — topics inside a channel.
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(false);
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto");
  const highlightTimeoutRef = useRef<number | null>(null);

  const currentUserId = localStorage.getItem("Id");
  const currentUsername = (() => {
  const raw = localStorage.getItem("username");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed?.username ? String(parsed.username) : String(parsed);
    } catch {
      return raw;
    }
  })();

  const chatType = chat?.type?.toUpperCase() ?? "";


  const isCurrentUserOwner =
    String(groupProfile?.owner_id) === String(currentUserId) ||
    (chatType === "CHANNEL" && channelPermissions?.is_owner === true);

  const activeOtherUserOnline = useMemo(() => {
    if (chatType !== "DM" || !chat?.other_user_id) return !!isOtherUserOnline;
    
    const userId = String(chat.other_user_id);
    // If the user is in our WebSocket map, that is the "live" truth.
    // If not, fall back to the initial API state.
    return userId in onlineUsers ? onlineUsers[userId] : !!isOtherUserOnline;
  }, [chatType, chat, onlineUsers, isOtherUserOnline]);

  // Task #29 — who can delete OTHER members' messages in this chat.
  // Groups: the group owner. Channels: the owner, or anyone with the
  // "Delete others messages" permission.
  const canDeleteOthersMessages =
    chatType === "GROUP"
      ? isCurrentUserOwner
      : chatType === "CHANNEL"
      ? !!(channelPermissions?.is_owner || channelPermissions?.can_delete_messages)
      : false;



  const [sendingMessage, setSendingMessage] = useState(false);



  useEffect(() => {
    if (chat) {
      setLocalChatInfo({ name: chat.name, avatar: chat.avatar });
    }
  }, [chat]);

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
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        shouldScrollToBottomRef.current = true;
        scrollBehaviorRef.current = "auto";
        setMessages(sortedMessages);

        if (sortedMessages.length) {
          await markConversationRead(chat.id, sortedMessages[sortedMessages.length - 1].id);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load messages");
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

  useEffect(() => {
    if (!chat || chatType !== "GROUP") return;

    let isMounted = true;

    const pollGroupInfo = async () => {
      try {
        const [profileData, membersData] = await Promise.all([
          getGroupProfile(chat.id),
          getGroupMembers(chat.id),
        ]);

        if (!isMounted) return;

        setGroupProfile(profileData);
        setGroupMembers(membersData);
        setLocalChatInfo((prev) =>
          prev?.name !== profileData.name || prev?.avatar !== (profileData.avatar_url || chat.avatar)
            ? { name: profileData.name, avatar: profileData.avatar_url || chat.avatar }
            : prev
        );
      } catch (error) {
        console.error("Failed to background refresh group data:", error);
      }
    };

    pollGroupInfo();
    const intervalId = setInterval(pollGroupInfo, 5000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [chat, chatType]);

  useEffect(() => {
    if (!chat) return;

    let isMounted = true;

    const pollMessages = async () => {
      try {
        const data = await getConversationMessages(chat.id);
        if (!isMounted) return;

        const sorted = [...data].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        setMessages((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(sorted)) return prev;
          if (sorted.length > prev.length) {
            shouldScrollToBottomRef.current = true;
            scrollBehaviorRef.current = "smooth";
          }
          return sorted;
        });
      } catch (err) {
        console.error("Failed to poll messages:", err);
      }
    };

    const intervalId = setInterval(pollMessages, 4000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [chat]);

  useEffect(() => {
    if (!loading && shouldScrollToBottomRef.current) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: scrollBehaviorRef.current });
        shouldScrollToBottomRef.current = false;
      });
    }
  }, [messages.length, loading, chat?.id]);

  useEffect(() => {
    if (!chat || chatType !== "CHANNEL") return;

    let isMounted = true;

    getPermissions(chat.id)
      .then((permissions) => {
        if (isMounted) setChannelPermissions(permissions);
      })
      .catch(console.error);

    return () => {
      isMounted = false;
    };
  }, [chat, chatType]);

  // Task #24 / #56 — poll the current user's own channel permissions so
  // that if the owner changes their role (assigning/removing roles), the
  // effect is reflected here without a manual page refresh.
  useEffect(() => {
    if (!chat || chatType !== "CHANNEL") return;

    let isMounted = true;
    const intervalId = setInterval(() => {
      getPermissions(chat.id)
        .then((permissions) => {
          if (isMounted) setChannelPermissions(permissions);
        })
        .catch(console.error);
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [chat, chatType]);

  // Keep the channel member list (shown in the profile overlay, with role
  // badges) fresh while it's open, so role changes made elsewhere show up
  // without a manual refresh.
  useEffect(() => {
    if (!chat || chatType !== "CHANNEL" || !showProfile || profileViewType !== "channel") return;

    let isMounted = true;
    const intervalId = setInterval(() => {
      getChannelMembers(chat.id)
        .then((membersData) => {
          if (isMounted) setChannelMembers(membersData);
        })
        .catch((err) => console.error("Failed to refresh channel members:", err));
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [chat, chatType, showProfile, profileViewType]);

  // Task #22 / #49 — load & poll the channel's topics.
  useEffect(() => {
    if (!chat || chatType !== "CHANNEL") {
      setTopics([]);
      setActiveTopicId(null);
      return;
    }

    let isMounted = true;
    setActiveTopicId(null);

    const loadTopics = async () => {
      try {
        const data = await getTopics(chat.id);
        if (isMounted) setTopics(data);
      } catch (err) {
        console.error("Failed to load topics:", err);
      }
    };

    loadTopics();
    const intervalId = setInterval(loadTopics, 5000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [chat, chatType]);

  const handleSendMessage = async (text: string, files: File[] = []) => {
    if (!chat) return;

    try {
      setSendingMessage(true);

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
        // Task #22/#49 — scope the message to whichever topic tab is active.
        // `null` (the "General" tab) sends an unscoped channel message.
        topic_id: chatType === "CHANNEL" ? activeTopicId : undefined,
      });

      shouldScrollToBottomRef.current = true;
      scrollBehaviorRef.current = "smooth";
      setMessages((prev) => [...prev, newMessage]);
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
    setMessages((prev) => prev.map((msg) => (msg.id === messageId ? updatedMessage : msg)));
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!chat) return;
    await deleteMessage(chat.id, messageId);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, content: null, is_deleted: true, updated_at: new Date().toISOString() }
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
    if (activeTopicId === topicId) setActiveTopicId(null);
  };

  const handleUserClick = async (userId: string, source: "CHAT" | "GROUP_PROFILE" = "GROUP_PROFILE") => {
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

  const handleHeaderClick = async () => {
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
        const otherUserId = chat.other_user_id ? String(chat.other_user_id) : null;
        if (otherUserId) handleUserClick(otherUserId);
      } else if (chatType === "CHANNEL") {
      setShowProfile(true);
      setProfileViewType("channel");

      if (!channelProfile || channelProfile.id !== chat.id || !channelPermissions) {
        setProfileLoading(true);
        try {
          const [profileData, permissionsData] = await Promise.all([
            getChannelProfile(chat.id),
            getPermissions(chat.id),
          ]);

          setChannelProfile(profileData);
          setChannelPermissions(permissionsData);

          if (permissionsData.is_owner || permissionsData.can_manage_members) {
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

  const handleSaveGroupEdit = async (name: string, desc: string, avatar: File | null) => {
    if (!chat) return;

    try {
      const updatedProfile = await updateGroupProfile(chat.id, { name, description: desc, avatar });
      setGroupProfile(updatedProfile);
      setLocalChatInfo({ name: updatedProfile.name, avatar: updatedProfile.avatar_url || chat.avatar });
    } catch (error) {
      console.error("Failed to update group:", error);
      alert("Failed to update group details.");
    }
  };

  const handleSaveChannelEdit = async (name: string, desc: string, avatar: File | null) => {
    if (!chat) return;

    try {
      const updatedProfile = await updateChannel(chat.id, { name, description: desc, avatar });
      setChannelProfile(updatedProfile);
      setLocalChatInfo({ name: updatedProfile.name, avatar: updatedProfile.avatar_url || chat.avatar });
    } catch (error) {
      console.error("Failed to update channel:", error);
      throw error;
    }
  };

  const confirmRemoveMember = async () => {
    if (!chat || !memberToRemove) return;

    try {
      await removeGroupMember(chat.id, memberToRemove.user_id);
      setGroupMembers((prev) => (prev ? prev.filter((m) => m.user_id !== memberToRemove.user_id) : null));
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
        setChannelMembers(channelMembers.filter((m) => m.user_id !== member.user_id));
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

    // If the target message belongs to a different topic than the one
    // currently active, switch to it first so it's actually rendered.
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
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          setMessages(sorted);
          requestAnimationFrame(() => requestAnimationFrame(scrollAndHighlight));
        } catch (err) {
          console.error("Failed to load message history for search result:", err);
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

  // Task #22/#49 — a channel's messages are split by topic. `null` means
  // the default "General" topic (messages with no topic_id).
  const displayedMessages = useMemo(() => {
    if (chatType !== "CHANNEL") return messages;
    return messages.filter((m) => (m.topic_id ?? null) === activeTopicId);
  }, [messages, chatType, activeTopicId]);

  if (!chat) {
    return (
      <div className="chat-placeholder" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        <div>Select a chat to start messaging</div>
      </div>
    );
  }

  return (
    <div className="chat-view" style={{ position: "relative", overflow: "hidden" }}>
      <ConfirmModal
        isOpen={!!memberToRemove}
        title="Remove Member"
        message={
          <>
            Are you sure you want to remove <span>{memberToRemove?.display_name}</span> from the group?
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
        confirmText={deleteChannelLoading ? "Deleting..." : "Delete Channel"}
        isLoading={deleteChannelLoading}
        isDanger={true}
        onConfirm={handleDeleteChannel}
        onCancel={() => setShowDeleteChannelConfirm(false)}
      />

      <ChatHeader
        chat={chat}
        localChatInfo={localChatInfo}
        isMobile={isMobile}
        onBack={onBack}
        onHeaderClick={handleHeaderClick}
        onToggleSearch={() => {
          setShowProfile(false);
          setShowSearch((prev) => !prev);
        }}
        isOtherUserOnline={activeOtherUserOnline}
      />


      {showSearch && (
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
        chatAvatar={chat.avatar}
        isCurrentUserOwner={isCurrentUserOwner}
        currentUserId={currentUserId}
        onClose={() => setShowProfile(false)}
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
        onRefreshProfile={() => userProfile?.id && handleUserClick(userProfile.id)}
      />

      <div className="chat-view-body">
        {chatType === "CHANNEL" && channelPermissions && (
          <TopicsPanel
            topics={topics}
            activeTopicId={activeTopicId}
            onSelectTopic={setActiveTopicId}
            canCreateTopic={!!channelPermissions.can_create_topic}
            canManageOthersTopics={!!(channelPermissions.can_manage_others_topics || channelPermissions.is_owner)}
            currentUserId={currentUserId}
            onCreateTopic={handleCreateTopic}
            onRenameTopic={handleRenameTopic}
            onDeleteTopic={handleDeleteTopic}
          />
        )}

        {loading && <div className="chat-placeholder">Loading messages...</div>}
        {!loading && error && <div className="chat-placeholder">{error}</div>}
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
                  replyMessage={msg.reply_to ? messages.find((m) => m.id === msg.reply_to) : null}
                  canDeleteOthers={canDeleteOthersMessages}
                  isGroupChat={chatType === "GROUP"}
                  senderAvatarUrl={senderAvatarById[String(msg.sender)]}
                  canReply={chatType === "CHANNEL" ? (channelPermissions?.can_send_messages ?? false) : true}
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

      <MessageInput
        activeReplyTo={activeReplyTo}
        onCancelReply={() => setActiveReplyTo(null)}
        onSendMessage={handleSendMessage}
        disabled={loading || sendingMessage}
        canSendMessages={chatType === "CHANNEL" ? (channelPermissions?.can_send_messages ?? false) : true}
      />
    </div>
  );
}
