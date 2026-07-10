import { useEffect, useRef , useState } from "react";
import { 
  getConversationMessages,
  markConversationRead,
  sendConversationMessage,
  editMessage,
  deleteMessage
} from "../services/chatService";
import type { ChatListItem, Message } from "../types/chat";
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(false);
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto");

  // گرفتن اطلاعات کاربر فعلی از LocalStorage برای نسبت دادن پیام‌های ارسالی
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

        // --- mark conversation as read ---
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
    setActiveReplyTo(null); // ریست کردن ریپلای با تغییر چت

    return () => {
      isMounted = false;
    };
  }, [chat]);

  // هندل کردن ارسال پیام جدید
  const handleSendMessage = async (text: string) => {
    if (!chat) return;
    try {
      const newMessage = await sendConversationMessage({
        conversation_id: chat.id,
        content: text,
        reply_to: activeReplyTo ? activeReplyTo.id : null,
        recipient_id: chat.otherUserId, // <-- ارسال شناسه مخاطب
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



  // هندل کردن ویرایش پیام
  const handleEditMessage = async (messageId: string, newText: string) => {
    if (!chat) return;
    const updatedMessage = await editMessage(chat.id, messageId, newText);
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? updatedMessage : msg))
    );
  };

  // هندل کردن حذف پیام
  const handleDeleteMessage = async (messageId: string) => {
    if (!chat) return;

    await deleteMessage(chat.id, messageId);

    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
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

        <img
          src={chat.avatar}
          alt={chat.name}
          className="chat-view-avatar"
        />

        <div className="chat-view-name">{chat.name}</div>
      </div>

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
              // پیدا کردن پیامی که به آن ریپلای شده (در صورت وجود)
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

      {/* Input Area (اضافه شده) */}
      <MessageInput
        activeReplyTo={activeReplyTo}
        onCancelReply={() => setActiveReplyTo(null)}
        onSendMessage={handleSendMessage}
        disabled={loading}
      />
    </div>
  );
}
