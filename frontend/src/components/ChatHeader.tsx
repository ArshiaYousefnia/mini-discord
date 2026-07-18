import type { ChatListItem } from "../types/chat";

interface ChatHeaderProps {
  chat: ChatListItem;
  localChatInfo: { name: string; avatar: string } | null;
  isMobile: boolean;
  onBack: () => void;
  onHeaderClick: () => void;
  onToggleSearch: () => void;
}

export default function ChatHeader({
  chat,
  localChatInfo,
  isMobile,
  onBack,
  onHeaderClick,
  onToggleSearch,
}: ChatHeaderProps) {
  const chatType = chat.type.toUpperCase();
  const isClickable = chatType === "GROUP" || chatType === "DM" || chatType === "CHANNEL";

  return (
    <div className="chat-view-header">
      {isMobile && (
        <button className="back-button" onClick={onBack} type="button">
          ← Back
        </button>
      )}

      <div
        className={`chat-header-info ${isClickable ? "clickable" : ""}`}
        onClick={isClickable ? onHeaderClick : undefined}
      >
        <img
          src={localChatInfo?.avatar || chat.avatar}
          alt={localChatInfo?.name || chat.name}
          className="chat-view-avatar"
        />
        <div className="chat-view-name">{localChatInfo?.name || chat.name}</div>
      </div>

      <div className="chat-view-header-actions" style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
        <button className="chat-search-toggle-btn" onClick={onToggleSearch} title="Search messages" type="button">
          🔍
        </button>
      </div>
    </div>
  );
}
