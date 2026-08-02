import type { ChatListItem } from "../types/chat";

interface ChatHeaderProps {
  chat: ChatListItem;
  localChatInfo: { name: string; avatar: string } | null;
  isMobile: boolean;
  onBack: () => void;
  onHeaderClick: () => void;
  onToggleSearch: () => void;
  isOtherUserOnline?: boolean;
}

export default function ChatHeader({
  chat,
  localChatInfo,
  isMobile,
  onBack,
  onHeaderClick,
  onToggleSearch,
  isOtherUserOnline,
}: ChatHeaderProps) {
  const chatType = chat.type.toUpperCase();
  const isClickable = chatType === "GROUP" || chatType === "DM" || chatType === "CHANNEL";
  const isDM = chatType === "DM";

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

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div className="chat-view-name">{localChatInfo?.name || chat.name}</div>

          {/* Render status only for DMs. If unknown, show "…" */}
          {isDM && (
            <div
              className={`chat-view-status ${
                isOtherUserOnline === true ? "online" : "offline"
              }`}
              style={{
                fontSize: "0.85rem",
                color: isOtherUserOnline === true ? "#22c55e" : "#94a3b8",
                lineHeight: 1.2,
              }}
            >
              {isOtherUserOnline === undefined ? "…" : isOtherUserOnline ? "Online" : "Offline"}
            </div>
          )}

        </div>
      </div>

      <div
        className="chat-view-header-actions"
        style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}
      >
        <button
          className="chat-search-toggle-btn"
          onClick={onToggleSearch}
          title="Search messages"
          type="button"
        >
          🔍
        </button>
      </div>
    </div>
  );
}
