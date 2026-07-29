import type { ChatListItem } from "../types/chat";
import { formatChatTimestamp } from "../services/chatMapper.ts";

type Props = {
  chat: ChatListItem;
  active?: boolean;
  onClick?: () => void;
  isOnline?: boolean;
};

export default function ChatItem({ chat, active = false, onClick, isOnline }: Props) {
  // Truncate the message if it exceeds 40 characters
  const displayMessage = chat.lastMessage && chat.lastMessage.length > 40 
    ? `${chat.lastMessage.substring(0, 30)}...` 
    : chat.lastMessage || "";

  // Normalize conversation type mapping to check if it's a DM
  const chatType = chat.type?.toUpperCase();
  const isDirectMessage = chatType === "DM" || !!(chat as any).other_user_id;

  return (
    <button
      className={`chat-item ${active ? "active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <div className="chat-avatar-wrapper" style={{ position: "relative" }}>
        <img src={chat.avatar} className="chat-avatar" alt={chat.name} />
        {/* Only display the online indicator if it's a DM and the user is verified online */}
        {isDirectMessage && !!isOnline && (
          <span 
            className="online-indicator"
            style={{
              position: "absolute",
              bottom: "2px",
              right: "2px",
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              backgroundColor: "#22c55e",
              border: "2px solid var(--background-sidebar, #ffffff)",
            }}
          />
        )}
      </div>

      <div className="chat-info">
        <div className="chat-top-row">
          <div className="chat-name">{chat.name}</div>
          <div className="chat-time">{formatChatTimestamp(chat.lastMessageAt)}</div>
        </div>

        <div className="chat-bottom-row">
          <div className="chat-message">{displayMessage}</div>

          {chat.unreadCount > 0 && (
            <div className="chat-unread-badge">{chat.unreadCount}</div>
          )}
        </div>
      </div>
    </button>
  );
}
