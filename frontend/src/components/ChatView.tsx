import { useEffect, useRef, useState } from "react";
import { 
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
  editMessage,
  deleteMessage
} from "../services/chatService";
import { getGroupProfile } from "../services/groupService";
import { getUserProfile } from "../services/users"; // <-- Added import
import type { ChatListItem, Message, GroupProfile } from "../types/chat";
import type { UserProfile } from "../types/user"; // <-- Added import
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";

interface Props {
  chat: ChatListItem | null;
  isMobile: boolean;
  onBack: () => void;
}

export default function ChatView({ chat, isMobile, onBack }: Props) {
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeReplyTo, setActiveReplyTo] = useState<Message | null>(null);

  // Profile States (Group & DM)
  const [showProfile, setShowProfile] = useState(false);
  const [groupProfile, setGroupProfile] = useState<GroupProfile | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null); // <-- Added state for DM
  const [profileLoading, setProfileLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(false);
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto");

  const currentUserId = localStorage.getItem("userId") || localStorage.getItem("user_id");
  const currentUsername = localStorage.getItem("username");

  useEffect(() => {
    if (loading) return;
    if (!shouldScrollToBottomRef.current) return;

    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: scrollBehaviorRef.current,
      });

      shouldScrollToBottomRef.current = false;
    });
  }, [messages.length, loading, chat?.id]);

  useEffect(() => {
    if (!chat) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    setShowProfile(false); // Reset profile view when changing chats

    const loadMessages = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getConversationMessages(chat.id);

        if (!isMounted) return;

        const sortedMessages = [...data]
          .filter((msg) => !msg.is_deleted)
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          );

        shouldScrollToBottomRef.current = true;
        scrollBehaviorRef.current = "auto";

        setMessages(sortedMessages);

        const latest = sortedMessages[sortedMessages.length - 1];
        if (latest) {
          await markConversationRead(chat.id, latest.id);
        }

      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Failed to load messages"
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadMessages();
    setActiveReplyTo(null);

    return () => {
      isMounted = false;
    };
  }, [chat]);

  const handleSendMessage = async (text: string) => {
    if (!chat) return;
    try {
      const newMessage = await sendConversationMessage({
        conversation_id: chat.id,
        content: text,
        reply_to: activeReplyTo ? activeReplyTo.id : null,
        recipient_id: chat.other_user_id, 
      });
      
      shouldScrollToBottomRef.current = true;
      scrollBehaviorRef.current = "smooth";

      setMessages((prev) => [...prev, newMessage]);
      setActiveReplyTo(null);

      await markConversationRead(chat.id, newMessage.id);
      
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send message");
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
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  };

  const handleHeaderClick = async () => {
    if (!chat) return;

    if (chat.type === "GROUP") {
      setShowProfile(true);
      if (!groupProfile || groupProfile.id !== chat.id) {
        setProfileLoading(true);
        try {
          const data = await getGroupProfile(chat.id);
          setGroupProfile(data);
        } catch (err) {
          console.error("Failed to load group profile", err);
        } finally {
          setProfileLoading(false);
        }
      }
    } else if (chat.type === "DM" && chat.other_user_id) { // <-- Added DM logic
      setShowProfile(true);
      if (!userProfile || userProfile.id !== chat.other_user_id) {
        setProfileLoading(true);
        try {
          const data = await getUserProfile(chat.other_user_id);
          setUserProfile(data);
        } catch (err) {
          console.error("Failed to load user profile", err);
        } finally {
          setProfileLoading(false);
        }
      }
    }
  };

  if (!chat) {
    return (
      <div className="chat-placeholder">
        Select a chat to start messaging
      </div>
    );
  }

  return (
    <div className="chat-view" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Header */}
      <div className="chat-view-header">
        {isMobile && (
          <button className="back-button" onClick={onBack} type="button">
            ← Back
          </button>
        )}

        <div 
          className={`chat-header-info ${chat.type === "GROUP" || chat.type === "DM" ? "clickable" : ""}`} 
          onClick={handleHeaderClick}
        >
          <img
            src={chat.avatar}
            alt={chat.name}
            className="chat-view-avatar"
          />
          <div className="chat-view-name">{chat.name}</div>
        </div>
      </div>

      {/* Profile Overlay (Both Group & User) */}
      {showProfile && (
        <div className="group-profile-overlay slideInRight">
          <div className="group-profile-header">
            <button className="back-button" onClick={() => setShowProfile(false)} type="button">
              ← Close
            </button>
            <h3>{chat.type === "GROUP" ? "Group Profile" : "User Profile"}</h3>
          </div>
          
          <div className="group-profile-content">
            {profileLoading ? (
              <div className="chat-placeholder">Loading profile...</div>
            ) : chat.type === "GROUP" && groupProfile ? (
              
              <div className="group-profile-card">
                <img 
                  src={groupProfile.avatar_url || chat.avatar} 
                  alt={groupProfile.name} 
                  className="group-profile-avatar-large"
                />
                <h2 className="group-profile-name">{groupProfile.name}</h2>
                <div className="group-profile-member-count">
                  {Number(groupProfile.member_count)} Members
                </div>
                {groupProfile.description && (
                  <div className="group-profile-description">
                    {groupProfile.description}
                  </div>
                )}
                
                <div className="group-profile-meta">
                  <p>Created by: {groupProfile.owner_display_name}</p>
                  <p>Created at: {new Date(groupProfile.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ) : chat.type === "DM" && userProfile ? (
              
              <div className="group-profile-card">
                <img 
                  src={userProfile.avatar || chat.avatar} 
                  alt={userProfile.display_name} 
                  className="group-profile-avatar-large"
                />
                <h2 className="group-profile-name">{userProfile.display_name}</h2>
                <p className="group-profile-meta">@{userProfile.username}</p>
                
                {userProfile.bio && (
                  <div className="group-profile-description">
                    {userProfile.bio}
                  </div>
                )}
                
                <div className="group-profile-meta" style={{ color: userProfile.is_online ? '#4ade80' : '#9ca3af', marginTop: '8px' }}>
                  {userProfile.is_online ? 'Online' : 'Offline'}
                </div>
              </div>
            ) : (
              <div className="chat-placeholder">Failed to load profile.</div>
            )}
          </div>
        </div>
      )}

      {/* Body / Message History */}
      <div className="chat-view-body">
        {loading && (
          <div className="chat-placeholder">Loading messages...</div>
        )}

        {!loading && error && (
          <div className="chat-placeholder">{error}</div>
        )}

        {!loading && !error && messages.length === 0 && (
          <div className="chat-placeholder">No messages yet.</div>
        )}

        {!loading && !error && messages.length > 0 && (
          <div className="message-history">
            {messages.map((msg) => {
              const replyMsg = msg.reply_to
                ? messages.find((m) => m.id === msg.reply_to)
                : null;

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  currentUserId={currentUserId}
                  currentUsername={currentUsername}
                  replyMessage={replyMsg}
                  onReply={(targetMsg) => setActiveReplyTo(targetMsg)}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <MessageInput
        activeReplyTo={activeReplyTo}
        onCancelReply={() => setActiveReplyTo(null)}
        onSendMessage={handleSendMessage}
        disabled={loading}
      />
    </div>
  );
}
