import { useMemo, useState } from "react";
import type { Message } from "../types/chat";
import { joinGroupByToken } from "../services/groupService";
import "../styles/chat.css";

type Props = {
  message: Message;
  currentUserId?: string | null;
  currentUsername?: string | null;
  replyMessage?: Message | null;
  isGroupOwner?: boolean;
  isGroupChat?: boolean;
  senderAvatarUrl?: string;
  onReply: (message: Message) => void;
  onEdit: (messageId: string, newText: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onAvatarClick?: (userId: string) => void; 
};

export default function MessageBubble({
  message,
  currentUserId,
  currentUsername,
  replyMessage,
  isGroupOwner = false,
  isGroupChat = false,
  senderAvatarUrl,
  onReply,
  onEdit,
  onDelete,
  onAvatarClick,
}: Props) {
  const messageText = message.content ?? "";

  const isMe =
    (currentUserId != null &&
      String(message.sender) === String(currentUserId)) ||
    (currentUsername != null &&
      message.sender_username === currentUsername);

  const alignmentClass = isMe ? "outgoing" : "incoming";
  const canDelete = isMe || isGroupOwner;
  const showSenderMeta = isGroupChat && !isMe;

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content ?? "");
  const [loading, setLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);

  const formattedTime = useMemo(() => {
    try {
      return new Date(message.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }, [message.created_at]);

  const handleSaveEdit = async () => {
    const trimmedText = editText.trim();

    if (!trimmedText || trimmedText === message.content) {
      setIsEditing(false);
      setEditText(message.content ?? "");
      return;
    }

    setLoading(true);

    try {
      await onEdit(message.id, trimmedText);
      setIsEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to edit message");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const isModerationDelete = !isMe && isGroupOwner;
    const confirmText = isModerationDelete
      ? "Delete this message for everyone in the group?"
      : "Are you sure you want to delete this message?";

    if (!window.confirm(confirmText)) return;

    try {
      await onDelete(message.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete message");
    }
  };

  const handleJoinGroup = async (token: string) => {
    try {
      setJoinLoading(true);
      await joinGroupByToken(token);
      alert("Successfully joined the group!");
    } catch (err: any) {
      if (err.response?.status === 400) {
        alert("you are already a group member!");
      } else if (err.response?.status === 404) {
        alert("invalid invite link");
      } else {
        alert(err.message || "Failed to join group.");
      }
    } finally {
      setJoinLoading(false);
    }
  };

  const renderContent = (text: string) => {
    const inviteRegex = /(http:\/\/join\/[a-zA-Z0-9_-]+)/g;
    const parts = text.split(inviteRegex);

    return (
      <span className="message-content">
        {parts.map((part, index) => {
          if (part.match(inviteRegex)) {
            const token = part.split("/").pop() || "";

            return (
              <button
                key={index}
                className="inline-invite-link"
                onClick={() => handleJoinGroup(token)}
                disabled={joinLoading}
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  color: "#1db954",
                  textDecoration: "underline",
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: "inherit",
                  fontSize: "inherit",
                }}
              >
                {joinLoading ? "Joining..." : part}
              </button>
            );
          }

          return <span key={index}>{part}</span>;
        })}
      </span>
    );
  };

  const renderReplyPreview = () => {
    if (replyMessage) {
      return (
        <div
          className="message-reply-preview"
          onClick={() => {
            if (replyMessage.is_deleted) return;

            const target = document.getElementById(`msg-${replyMessage.id}`);

            if (target) {
              target.scrollIntoView({ behavior: "smooth", block: "center" });

              target.classList.remove("message-highlight-flash");
              void target.offsetWidth;
              target.classList.add("message-highlight-flash");

              setTimeout(() => {
                target.classList.remove("message-highlight-flash");
              }, 1600);
            }
          }}
          style={{ cursor: replyMessage.is_deleted ? "default" : "pointer" }}
        >
          {replyMessage.is_deleted ? (
            <div
              className="reply-text-preview"
              style={{ fontStyle: "italic", opacity: 0.7 }}
            >
              Original message was deleted
            </div>
          ) : (
            <>
              <div className="reply-sender">
                {replyMessage.sender_display_name ||
                  replyMessage.sender_username}
              </div>
              <div className="reply-text-preview">
                {(replyMessage.content ?? "").slice(0, 70)}
              </div>
            </>
          )}
        </div>
      );
    }

    if (message.reply_to) {
      return (
        <div
          className="message-reply-preview"
          style={{ cursor: "default", fontStyle: "italic", opacity: 0.6 }}
        >
          <div className="reply-text-preview">Original message unavailable</div>
        </div>
      );
    }

    return null;
  };

  const bubbleInnerContent = (
    <>
      {renderReplyPreview()}

      {isEditing ? (
        <div className="edit-input-container">
          <textarea
            className="edit-textarea"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            disabled={loading}
            maxLength={2000}
            autoFocus
          />

          <div className="edit-actions-row">
            <button
              className="edit-action-btn cancel"
              onClick={() => {
                setIsEditing(false);
                setEditText(message.content ?? "");
              }}
              disabled={loading}
              type="button"
            >
              Cancel
            </button>

            <button
              className="edit-action-btn save"
              onClick={handleSaveEdit}
              disabled={loading || !editText.trim()}
              type="button"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="message-text">
          {message.is_deleted ? "Deleted message" : renderContent(messageText)}
        </div>
      )}

      {!isEditing && (
        <div className="message-meta">
          {message.is_edited && !message.is_deleted && (
            <span className="message-edited-label">(edited)</span>
          )}

          <span>{formattedTime}</span>

          {isMe && !message.is_deleted && (
            <span className="message-status-icon">✓</span>
          )}
        </div>
      )}
    </>
  );

  return (
    <div
      id={`msg-${message.id}`}
      className={[
        "message-bubble-wrapper",
        alignmentClass,
        message.is_deleted ? "deleted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!isEditing && !message.is_deleted && (
        <div className="message-actions">
          <button
            className="action-btn"
            onClick={() => onReply(message)}
            type="button"
          >
            Reply
          </button>

          {isMe && (
            <button
              className="action-btn"
              onClick={() => setIsEditing(true)}
              type="button"
            >
              Edit
            </button>
          )}

          {canDelete && (
            <button
              className="action-btn delete"
              onClick={handleDelete}
              type="button"
            >
              Delete
            </button>
          )}
        </div>
      )}

      {showSenderMeta && (
        <img
          src={senderAvatarUrl || "/default-avatar.png"}
          onClick={() => onAvatarClick && onAvatarClick(String(message.sender))}
          alt=""
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            flexShrink: 0,
            cursor: "pointer"
          }}
        />
      )}

      <div className="message-bubble">
        {showSenderMeta && (
          <div
            className="message-sender-name"
            style={{
              fontSize: 12,
              fontWeight: 600,
              opacity: 0.8,
              marginBottom: 2,
            }}
          >
            {message.sender_display_name || message.sender_username}
          </div>
        )}

        {bubbleInnerContent}
      </div>
    </div>
  );
}
