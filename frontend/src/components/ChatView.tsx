import { useEffect, useState } from "react";
import { 
  getConversationMessages,
  markConversationRead
} from "../services/chatService";
import type { ChatListItem, Message } from "../types/chat";

interface Props {
  chat: ChatListItem | null;
  isMobile: boolean;
  onBack: () => void;
}

export default function ChatView({ chat, isMobile, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

        const sortedMessages = [...data].sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        );

        setMessages(sortedMessages);

        // --- NEW: mark conversation as read ---
        const latest = sortedMessages[sortedMessages.length - 1];
        if (latest) {
          await markConversationRead(chat.id);
        }
        // --------------------------------------

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

    return () => {
      isMounted = false;
    };
  }, [chat]);

  if (!chat) {
    return (
      <div className="chat-placeholder">
        Select a chat to start messaging
      </div>
    );
  }

  return (
    <div className="chat-view">
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
            {messages.map((msg) => (
              <div key={msg.id} className="message-item">
                <div className="message-sender">
                  {msg.sender_display_name}
                </div>

                <div className="message-content">
                  {msg.is_deleted ? "Message deleted" : msg.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
