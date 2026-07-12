import { useMemo, useState } from "react";
import type { Message } from "../types/chat";
import { joinGroupByToken } from "../services/groupService";
import "../styles/chat.css";

type Props = {
  message: Message;
  currentUserId?: string | null;
  currentUsername?: string | null;
  replyMessage?: Message | null;
  onReply: (message: Message) => void;
  onEdit: (messageId: string, newText: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
};

export default function MessageBubble({
  message,
  currentUserId,
  currentUsername,
  replyMessage,
  onReply,
  onEdit,
  onDelete,
}: Props) {
  const messageText = message.content ?? "";

  const isMe =
    Boolean(currentUserId && message.sender === currentUserId) ||
    Boolean(currentUsername && message.sender_username === currentUsername);

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
    if (!window.confirm("Are you sure you want to delete this message?")) {
      return;
    }

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
      // Optionally trigger a re-fetch of the chat list in the parent component here
      
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

    return parts.map((part, index) => {
      if (part.match(inviteRegex)) {
        const token = part.split("/").pop() || "";
        return (
          <button
            key={index}
            className="inline-invite-link"
            onClick={() => handleJoinGroup(token)}
            disabled={joinLoading}
            style={{
              background: "none",
              border: "none",
              color: "#1db954",
              textDecoration: "underline",
              cursor: "pointer",
              padding: 0,
              fontFamily: "inherit",
              fontSize: "inherit"
            }}
          >
            {joinLoading ? "Joining..." : part}
          </button>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div
      id={`msg-${message.id}`}
      className={`message-bubble-wrapper ${isMe ? "outgoing" : "incoming"} ${
        message.is_deleted ? "deleted" : ""
      }`}
    >
      {!isEditing && !message.is_deleted && (
        <div className="message-actions">
          <button className="action-btn" onClick={() => onReply(message)}>
            Reply
          </button>

          {isMe && (
            <>
              <button className="action-btn" onClick={() => setIsEditing(true)}>
                Edit
              </button>
              <button className="action-btn delete" onClick={handleDelete}>
                Delete
              </button>
            </>
          )}
        </div>
      )}

      <div className="message-bubble">
        {replyMessage && (
          <div 
            className="message-reply-preview"
            onClick={() => {
              const target = document.getElementById(`msg-${replyMessage.id}`);
              target?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            style={{ cursor: "pointer" }}
          >
            <div className="reply-sender">
              {replyMessage.sender_display_name || replyMessage.sender_username}
            </div>
            <div className="reply-text-preview">
              {(replyMessage.content ?? "Deleted message").slice(0, 70)}
            </div>
          </div>
        )}

        {isEditing ? (
          <div className="edit-input-container">
            <textarea
              className="edit-textarea"
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
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
      </div>
    </div>
  );
}
