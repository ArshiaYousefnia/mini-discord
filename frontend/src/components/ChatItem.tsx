import type { ChatListItem } from "../types/chat";
import { formatChatTimestamp } from "../services/chatMapper.ts";

type Props = {
  chat: ChatListItem;
  active?: boolean;
  onClick?: () => void;
};

export default function ChatItem({ chat, active = false, onClick }: Props) {
  return (
    <button
      className={`chat-item ${active ? "active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <img src={chat.avatar} className="chat-avatar" alt={chat.name} />

      <div className="chat-info">
        <div className="chat-top-row">
          <div className="chat-name">{chat.name}</div>
          <div className="chat-time">{formatChatTimestamp(chat.lastMessageAt)}</div>
        </div>

        <div className="chat-bottom-row">
          <div className="chat-message">{chat.lastMessage}</div>

          {chat.unreadCount > 0 && (
            <div className="chat-unread-badge">{chat.unreadCount}</div>
          )}
        </div>
      </div>
    </button>
  );
}
