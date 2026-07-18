import { useEffect, useMemo, useRef, useState } from "react";
import { getConversationMessages, markConversationRead, sendConversationMessage, editMessage, deleteMessage } from "../services/chatService";
import { getGroupProfile, getGroupMembers, removeGroupMember, updateGroupProfile, leaveGroup, deleteGroup } from "../services/groupService";
import { getUserProfile } from "../services/users";
import type { ChatListItem, Message, GroupProfile, GroupMembers, ChannelProfile, ChannelPermissions } from "../types/chat";
import type { UserProfile } from "../types/user";

import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import MessageSearchPanel from "./MessageSearchPanel";
import ConfirmModal from "./ConfirmModal";
import ChatHeader from "./ChatHeader";
import ProfileOverlay from "./ProfileOverlay";
import { getChannelProfile, getPermissions, updateChannel } from "../services/channelService";

interface Props {
  chat: ChatListItem | null;
  isMobile: boolean;
  onBack: () => void;
  onGroupExit?: (groupId: string) => void;
  onGroupJoined?: (groupId: string) => void;
}

export default function ChatView({ chat, isMobile, onBack, onGroupExit, onGroupJoined }: Props) {
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
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [showDeleteGroupConfirm, setShowDeleteGroupConfirm] = useState(false);
  const [deleteGroupLoading, setDeleteGroupLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [channelProfile, setChannelProfile] = useState<ChannelProfile | null>(null);
  const [channelPermissions, setChannelPermissions] = useState<ChannelPermissions | null>(null);


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(false);
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto");
  const highlightTimeoutRef = useRef<number | null>(null);

  const currentUserId = localStorage.getItem("Id");
  const currentUsername = localStorage.getItem("username");
  const isCurrentUserOwner = String(groupProfile?.owner_id) === String(currentUserId);

  useEffect(() => {
    if (chat) setLocalChatInfo({ name: chat.name, avatar: chat.avatar });
  }, [chat]);

  useEffect(() => {
    if (!chat) {
      setMessages([]);
      setChannelProfile(null);
      setChannelPermissions(null);
      return;
    }

    let isMounted = true;
    setShowProfile(false);
    setProfileViewType(null);
    setShowLeaveConfirm(false);
    setShowDeleteGroupConfirm(false);
    setShowSearch(false);
    setChannelProfile(null);
    setChannelPermissions(null);

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


  // Polling loops remained exactly the same...
  useEffect(() => {
    if (!chat || chat.type.toUpperCase() !== "GROUP") return;
    let isMounted = true;
    const pollGroupInfo = async () => {
      try {
        const [profileData, membersData] = await Promise.all([getGroupProfile(chat.id), getGroupMembers(chat.id)]);
        if (!isMounted) return;
        setGroupProfile(profileData); setGroupMembers(membersData);
        setLocalChatInfo(prev => prev?.name !== profileData.name || prev?.avatar !== (profileData.avatar_url || chat.avatar) ? { name: profileData.name, avatar: profileData.avatar_url || chat.avatar } : prev);
      } catch (error) { console.error("Failed to background refresh group data:", error); }
    };
    pollGroupInfo();
    const intervalId = setInterval(pollGroupInfo, 5000);
    return () => { isMounted = false; clearInterval(intervalId); };
  }, [chat]);

  useEffect(() => {
    if (!chat) return;
    let isMounted = true;
    const pollMessages = async () => {
      try {
        const data = await getConversationMessages(chat.id);
        if (!isMounted) return;
        const sorted = [...data].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setMessages(prev => {
          if (JSON.stringify(prev) === JSON.stringify(sorted)) return prev;
          if (sorted.length > prev.length) { shouldScrollToBottomRef.current = true; scrollBehaviorRef.current = "smooth"; }
          return sorted;
        });
      } catch (err) { console.error("Failed to poll messages:", err); }
    };
    const intervalId = setInterval(pollMessages, 4000);
    return () => { isMounted = false; clearInterval(intervalId); };
  }, [chat]);

  useEffect(() => {
    if (!loading && shouldScrollToBottomRef.current) {
      requestAnimationFrame(() => { messagesEndRef.current?.scrollIntoView({ behavior: scrollBehaviorRef.current }); shouldScrollToBottomRef.current = false; });
    }
  }, [messages.length, loading, chat?.id]);

  const handleSendMessage = async (text: string) => {
    if (!chat) return;
    try {
      const newMessage = await sendConversationMessage({ conversation_id: chat.id, content: text, reply_to: activeReplyTo?.id || null, recipient_id: chat.other_user_id || (chat as any).otherUserId });
      shouldScrollToBottomRef.current = true; scrollBehaviorRef.current = "smooth";
      setMessages(prev => [...prev, newMessage]); setActiveReplyTo(null);
      await markConversationRead(chat.id, newMessage.id);
    } catch (err) { alert(err instanceof Error ? err.message : "Failed to send message"); }
  };

  const handleEditMessage = async (messageId: string, newText: string) => {
    if (!chat) return;
    const updatedMessage = await editMessage(chat.id, messageId, newText);
    setMessages(prev => prev.map(msg => msg.id === messageId ? updatedMessage : msg));
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!chat) return;
    await deleteMessage(chat.id, messageId);
    setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, content: null, is_deleted: true, updated_at: new Date().toISOString() } : msg));
  };

  const handleUserClick = async (userId: string, source: "CHAT" | "GROUP_PROFILE" = "GROUP_PROFILE") => {
    setProfileSource(source); setShowProfile(true); setProfileViewType("user"); setProfileLoading(true);
    try { setUserProfile(await getUserProfile(userId)); } 
    catch (err) { console.error("Failed to load user profile", err); } 
    finally { setProfileLoading(false); }
  };

  const handleHeaderClick = async () => {
    if (!chat) return;
    const chatType = chat.type.toUpperCase();

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
      const otherUserId = chat.other_user_id || (chat as any).otherUserId;
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
      // Note: Make sure updateChannelProfile is imported from your channelService
      const updatedProfile = await updateChannel(chat.id, { name, description: desc, avatar});
      setChannelProfile(updatedProfile);
      setLocalChatInfo({ name: updatedProfile.name, avatar: updatedProfile.avatar_url || chat.avatar });
    } catch (error) {
      console.error("Failed to update channel:", error);
      throw error; // Throw so ProfileOverlay's try/catch can see the failure
    }
  };


  const confirmRemoveMember = async () => {
    if (!chat || !memberToRemove) return;
    try {
      await removeGroupMember(chat.id, memberToRemove.user_id);
      setGroupMembers(prev => prev ? prev.filter(m => m.user_id !== memberToRemove.user_id) : null);
      setGroupProfile(prev => prev ? { ...prev, member_count: Number(prev.member_count) - 1 } : null);
      setMemberToRemove(null);
    } catch (error) { console.error("Failed to remove member:", error); alert("Failed to remove group member."); }
  };

  const handleLeaveGroup = async () => {
    if (!chat) return;
    try {
      setLeaveLoading(true); await leaveGroup(chat.id);
      setShowLeaveConfirm(false); setShowProfile(false); onGroupExit?.(chat.id);
    } catch (error) { console.error("Failed to leave group:", error); alert("Failed to leave the group."); } 
    finally { setLeaveLoading(false); }
  };

  const handleDeleteGroup = async () => {
    if (!chat) return;
    try {
      setDeleteGroupLoading(true); await deleteGroup(chat.id);
      setShowDeleteGroupConfirm(false); setShowProfile(false); onGroupExit?.(chat.id);
    } catch (error) { console.error("Failed to delete group:", error); alert("Failed to delete the group."); } 
    finally { setDeleteGroupLoading(false); }
  };

  const scrollToMessage = async (targetMessage: Message) => {
    if (!chat) return;
    const scrollAndHighlight = (): boolean => {
      const el = document.getElementById(`msg-${targetMessage.id}`);
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("message-highlight-flash");
      if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = window.setTimeout(() => el.classList.remove("message-highlight-flash"), 1600);
      return true;
    };
    setShowSearch(false);
    requestAnimationFrame(() => {
      if (scrollAndHighlight()) return;
      (async () => {
        try {
          const data = await getConversationMessages(chat.id);
          const sorted = [...data].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          setMessages(sorted);
          requestAnimationFrame(() => requestAnimationFrame(scrollAndHighlight));
        } catch (err) { console.error("Failed to load message history for search result:", err); }
      })();
    });
  };

  const senderAvatarById = useMemo(() => {
    const map: Record<string, string> = {};
    groupMembers?.forEach(m => { map[String(m.user_id)] = m.avatar_url || ""; });
    return map;
  }, [groupMembers]);

  if (!chat) return <div className="chat-placeholder" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}><div>Select a chat to start messaging</div></div>;
  const chatType = chat.type.toUpperCase();

  return (
    <div className="chat-view" style={{ position: 'relative', overflow: 'hidden' }}>
      <ConfirmModal
        isOpen={!!memberToRemove}
        title="Remove Member"
        message={<>Are you sure you want to remove <span>{memberToRemove?.display_name}</span> from the group?</>}
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

      <ChatHeader
        chat={chat}
        localChatInfo={localChatInfo}
        isMobile={isMobile}
        onBack={onBack}
        onHeaderClick={handleHeaderClick}
        onToggleSearch={() => { setShowProfile(false); setShowSearch(prev => !prev); }}
      />

      {showSearch && <MessageSearchPanel conversationId={chat.id} onClose={() => setShowSearch(false)} onResultClick={scrollToMessage} />}

      <ProfileOverlay
        show={showProfile}
        profileViewType={profileViewType}
        profileSource={profileSource}
        profileLoading={profileLoading}
        groupProfile={groupProfile}
        channelProfile={channelProfile}
        channelPermissions={channelPermissions}
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
        onLeaveGroupRequest={() => setShowLeaveConfirm(true)}
        onDeleteGroupRequest={() => setShowDeleteGroupConfirm(true)}
      />


      <div className="chat-view-body">
        {loading && <div className="chat-placeholder">Loading messages...</div>}
        {!loading && error && <div className="chat-placeholder">{error}</div>}
        {!loading && !error && messages.length === 0 && <div className="chat-placeholder">No messages yet.</div>}
        {!loading && !error && messages.length > 0 && (
          <div className="message-history">
            {messages.filter(msg => !msg.is_deleted).map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                currentUserId={currentUserId}
                currentUsername={currentUsername}
                replyMessage={msg.reply_to ? messages.find(m => m.id === msg.reply_to) : null}
                isGroupOwner={chatType === "GROUP" && isCurrentUserOwner}
                isGroupChat={chatType === "GROUP"}
                senderAvatarUrl={senderAvatarById[String(msg.sender)]}
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
      </div>

      <MessageInput activeReplyTo={activeReplyTo} onCancelReply={() => setActiveReplyTo(null)} onSendMessage={handleSendMessage} disabled={loading} />
    </div>
  );
}

