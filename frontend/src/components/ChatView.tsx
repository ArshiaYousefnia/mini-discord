import { useEffect, useRef, useState } from "react";
import { 
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
  editMessage,
  deleteMessage
} from "../services/chatService";
import { getGroupProfile} from "../services/groupService";
import type { ChatListItem, Message, GroupProfile } from "../types/chat";
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

  // Group Profile States
  const [showProfile, setShowProfile] = useState(false);
  const [groupProfile, setGroupProfile] = useState<GroupProfile | null>(null);
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
        recipient_id: chat.otherUserId, 
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
    if (chat?.type === "GROUP") {
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
    <div className="chat-view">
      {/* Header */}
      <div className="chat-view-header">
        {isMobile && (
          <button className="back-button" onClick={onBack} type="button">
            ← Back
          </button>
        )}

        <div 
          className={`chat-header-info ${chat.type === "GROUP" ? "clickable" : ""}`} 
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

      {/* Group Profile Overlay */}
      {showProfile && (
        <div className="group-profile-overlay">
          <div className="group-profile-header">
            <button className="back-button" onClick={() => setShowProfile(false)} type="button">
              ← Close
            </button>
            <h3>Group Profile</h3>
          </div>
          
          <div className="group-profile-content">
            {profileLoading ? (
              <div className="chat-placeholder">Loading profile...</div>
            ) : groupProfile ? (
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
