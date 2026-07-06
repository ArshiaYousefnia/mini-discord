import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MessageBubble from "../components/MessageBubble";
import MessageInput from "../components/MessageInput";
import { chatService } from "../services/chatService";
import type { Conversation, Message, UserProfile } from "../types/chat";
import "../styles/chat.css";

type ChatRouteParams = {
  conversationId?: string;
  recipientId?: string;
};

function getCurrentUserId() {
  return (
    localStorage.getItem("Id") || // بررسی کلید جدیدی که دوستت اضافه کرده
    localStorage.getItem("user_id") ||
    localStorage.getItem("current_user_id") ||
    null
  );
}

function getCurrentUsername() {
  return (
    localStorage.getItem("username") ||
    localStorage.getItem("current_username") ||
    null
  );
}

function getProfileDisplayName(profile: UserProfile | null, fallback: string) {
  if (!profile) return fallback;

  return (
    profile.display_name ||
    profile.displayName ||
    profile.username ||
    fallback
  );
}

function getProfileAvatar(profile: UserProfile | null) {
  return (
    profile?.avatar ||
    profile?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      profile?.username || "Chat"
    )}&background=d1d7db&color=111b21`
  );
}

export default function ChatPage() {
  const { conversationId, recipientId } = useParams<ChatRouteParams>();
  const navigate = useNavigate();

  const currentUserId = getCurrentUserId();
  const currentUsername = getCurrentUsername();

  const isNewChat = Boolean(recipientId);
  const activeConversationId = isNewChat
    ? `new-${recipientId}`
    : conversationId ?? "";

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [recipientProfile, setRecipientProfile] = useState<UserProfile | null>(
    null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeReplyTo, setActiveReplyTo] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingError, setSendingError] = useState("");
  const [pageError, setPageError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messagesById = useMemo(() => {
    return messages.reduce<Record<string, Message>>((acc, message) => {
      acc[message.id] = message;
      return acc;
    }, {});
  }, [messages]);

  const headerTitle = useMemo(() => {
    if (recipientProfile) {
      return getProfileDisplayName(recipientProfile, "New chat");
    }

    if (conversation?.display_name) {
      return conversation.display_name;
    }

    if (conversation?.name) {
      return conversation.name;
    }

    if (isNewChat) {
      return "New direct message";
    }

    return "Conversation";
  }, [conversation?.display_name, conversation?.name, isNewChat, recipientProfile]);

  const headerSubtitle = useMemo(() => {
    if (recipientProfile?.username) {
      return `@${recipientProfile.username}`;
    }

    if (conversation?.type) {
      return conversation.type;
    }

    return isNewChat ? "Direct message" : activeConversationId;
  }, [activeConversationId, conversation?.type, isNewChat, recipientProfile]);

  const headerAvatar = conversation?.avatar || getProfileAvatar(recipientProfile);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const reloadMessages = async () => {
    if (!activeConversationId) return;

    const data = await chatService.getConversationMessages(activeConversationId);
    setMessages(data);
  };

  useEffect(() => {
    let ignore = false;

    const loadChat = async () => {
      if (!activeConversationId) {
        setPageError("Invalid chat route.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setPageError("");
      setSendingError("");

      try {
        let currentRecipientId = recipientId;

        // اگر از طریق لینک مستقیم کانورزیشن وارد شدیم، تلاش کنیم اطلاعات گفتگو را بگیریم
        if (!isNewChat) {
          const conversations = await chatService.getConversations();
          const matchedConversation =
            conversations.find((item) => item.id === activeConversationId) ??
            null;

          if (!ignore) {
            setConversation(matchedConversation);
          }

          // اگر گفتگو از نوع DM است و آیدی طرف مقابل را داریم، پروفایل او را لود کنیم
          if (matchedConversation && matchedConversation.type === "DM" && matchedConversation.other_user_id) {
            currentRecipientId = matchedConversation.other_user_id;
          }
        }

        if (currentRecipientId) {
          const profile = await chatService.getUserProfile(currentRecipientId);
          if (!ignore) {
            setRecipientProfile(profile);
          }
        }

        const data = await chatService.getConversationMessages(
          activeConversationId
        );

        if (!ignore) {
          setMessages(data);
          await chatService.markConversationAsRead(activeConversationId);
        }
      } catch {
        if (!ignore) {
          setPageError("Failed to load chat.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadChat();

    return () => {
      ignore = true;
    };
  }, [activeConversationId, isNewChat, recipientId]);

  useEffect(() => {
    if (!loading) {
      scrollToBottom();
    }
  }, [loading, messages]);

  const handleSendMessage = async (text: string) => {
    setSendingError("");

    const replyTo = activeReplyTo?.id ?? null;

    try {
      let sentMessage: Message;

      // بررسی وضعیت ارسال پیام:
      // ۱. اگر چت جدید با recipientId مشخص باشد
      // ۲. یا اگر چت از نوع DM باشد و شناسه مخاطب (other_user_id) را در کانورزیشن داشته باشیم
      const targetRecipientId = recipientId || (conversation?.type === "DM" ? conversation.other_user_id : null);

      if (targetRecipientId) {
        sentMessage = await chatService.sendDirectMessage({
          recipient_id: targetRecipientId,
          content: text,
          reply_to: replyTo,
        });
      } else {
        // برای سناریوهای گروه یا کانال (اگر وجود داشته باشد)
        sentMessage = await chatService.sendConversationMessage({
          conversation_id: activeConversationId,
          content: text,
          reply_to: replyTo,
        });
      }

      setMessages((prev) => {
        const exists = prev.some((message) => message.id === sentMessage.id);
        return exists
          ? prev.map((message) =>
              message.id === sentMessage.id ? sentMessage : message
            )
          : [...prev, sentMessage];
      });

      setActiveReplyTo(null);

      if (!sentMessage.id.startsWith("local-")) {
        await reloadMessages();
      }
    } catch (err) {
      setSendingError(
        err instanceof Error ? err.message : "Failed to send message."
      );
      throw err;
    }
  };

  const handleEditMessage = async (messageId: string, newText: string) => {
    const updatedMessage = await chatService.editMessage(
      activeConversationId,
      messageId,
      newText
    );

    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? updatedMessage : message
      )
    );
  };

  const handleDeleteMessage = async (messageId: string) => {
    await chatService.deleteMessage(activeConversationId, messageId);

    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: null,
              is_deleted: true,
              updated_at: new Date().toISOString(),
            }
          : message
      )
    );
  };

  if (loading) {
    return <div className="chat-loading">Loading chat...</div>;
  }

  if (pageError) {
    return (
      <div className="chat-error">
        <p>{pageError}</p>
        <button onClick={() => navigate(-1)}>Go back</button>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <header className="chat-header">
        <button className="chat-header-back-btn" onClick={() => navigate(-1)}>
          ←
        </button>

        <img src={headerAvatar} alt={headerTitle} className="chat-header-avatar" />

        <div className="chat-header-info">
          <span className="chat-header-name">{headerTitle}</span>
          <span className="chat-header-status">{headerSubtitle}</span>
        </div>
      </header>

      {sendingError && <div className="chat-warning">{sendingError}</div>}

      <div className="chat-messages-list">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            No messages yet. Send a message to start the conversation.
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              currentUserId={currentUserId}
              currentUsername={currentUsername}
              replyMessage={
                message.reply_to ? messagesById[message.reply_to] ?? null : null
              }
              onReply={setActiveReplyTo}
              onEdit={handleEditMessage}
              onDelete={handleDeleteMessage}
            />
          ))
        )}

        <div ref={messagesEndRef} />
      </div>

      <MessageInput
        activeReplyTo={activeReplyTo}
        onCancelReply={() => setActiveReplyTo(null)}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}
