import { useMemo, useState } from "react";
import type { Message } from "../types/chat";
import { joinGroupByToken } from "../services/groupService";
import { joinChannelByInviteLink } from "../services/channelService";
import "../styles/chat.css";

type Props = {
  message: Message;
  currentUserId?: string | null;
  currentUsername?: string | null;
  replyMessage?: Message | null;
  isGroupOwner?: boolean;
  isGroupChat?: boolean;
  senderAvatarUrl?: string;
  canReply?: boolean;
  onReply: (message: Message) => void;
  onEdit: (messageId: string, newText: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onAvatarClick?: (userId: string) => void;
  onGroupJoined?: (groupId: string) => void;
  onChannelJoined?: (channelId: string) => void;
  onChannelPreview?: (token: string) => void; // Used to trigger the preview modal for the user story
};

export default function MessageBubble({
  message,
  currentUserId,
  currentUsername,
  replyMessage,
  isGroupOwner = false,
  isGroupChat = false,
  senderAvatarUrl,
  canReply = true,
  onReply,
  onEdit,
  onDelete,
  onAvatarClick,
  onGroupJoined,
  onChannelJoined,
  onChannelPreview,
}: Props) {
  const messageText = message.content ?? "";

  const isMe =
    (currentUserId != null &&
      String(message.sender) === String(currentUserId)) ||
    (currentUsername != null && message.sender_username === currentUsername);

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
      const data = await joinGroupByToken(token);

      const groupId = data?.group_id || data?.id;

      if (onGroupJoined && groupId) {
        onGroupJoined(String(groupId));
      } else {
        alert("Successfully joined the group!");
      }
    } catch (err: any) {
      if (err.response?.status === 400) {
        const groupId = err.response?.data?.group_id;
        if (onGroupJoined && groupId) {
          onGroupJoined(String(groupId));
        } else {
          alert("You are already a group member!");
        }
      } else if (err.response?.status === 404) {
        alert("Invalid invite link");
      } else {
        alert(err.message || "Failed to join group.");
      }
    } finally {
      setJoinLoading(false);
    }
  };

  const handleJoinChannel = async (token: string) => {
    // Fulfills the "Accessing a valid invite link should show a preview screen" requirement
    if (onChannelPreview) {
      onChannelPreview(token);
      return;
    }

    // Direct join fallback if no preview handler is provided
    try {
      setJoinLoading(true);
      const data = await joinChannelByInviteLink(token);

      const channelId = data?.channel_id || data?.id;

      if (onChannelJoined && channelId) {
        onChannelJoined(String(channelId));
      } else {
        alert("Successfully joined the channel!");
      }
    } catch (err: any) {
      if (err.response?.status === 400) {
        const channelId = err.response?.data?.channel_id;
        if (onChannelJoined && channelId) {
          onChannelJoined(String(channelId));
        } else {
          alert("You are already a channel member!");
        }
      } else if (err.response?.status === 404) {
        alert("Invalid invite link");
      } else {
        alert(err.message || "Failed to join channel.");
      }
    } finally {
      setJoinLoading(false);
    }
  };

  const renderContent = (text: string) => {
    // Matches http://groups/join/token or http://channels/join/token with optional trailing slash
    const inviteRegex = /(http:\/\/(?:groups|channels)\/join\/[a-zA-Z0-9_-]+\/?)/g;
    const parts = text.split(inviteRegex);

    return (
      <span className="message-content">
        {parts.map((part, index) => {
          if (part.match(inviteRegex)) {
            // Remove optional trailing slash for parsing
            const cleanPart = part.endsWith("/") ? part.slice(0, -1) : part;
            const urlSegments = cleanPart.split("/");
            
            const token = urlSegments.pop() || "";
            const isChannel = urlSegments.includes("channels");

            return (
              <button
                key={index}
                className="inline-invite-link"
                onClick={() => isChannel ? handleJoinChannel(token) : handleJoinGroup(token)}
                disabled={joinLoading}
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  color: "#1db954", // NeoSpotify theme green
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

  const renderAttachments = (attachments?: any[]) => {
    if (!attachments || attachments.length === 0) return null;

    return (
      <div
        className="message-attachments"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginTop: "8px",
        }}
      >
        {attachments.map((att) => {
          const fileUrl = att.file_url || att.url;
          const fileName =
            att.original_filename || att.file_name || "Attachment";
          const fileSizeBytes = att.size ?? att.file_size ?? 0;
          const sizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
          const extension =
            fileName.split(".").pop()?.toLowerCase() || "";

          const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(
            extension
          );
          const isVideo = ["mp4", "webm", "ogg", "mov"].includes(extension);
          const isAudio = [
            "mp3",
            "wav",
            "ogg",
            "aac",
            "m4a",
            "flac",
          ].includes(extension);

          if (isImage) {
            return (
              <div
                key={att.id}
                className="attachment-image-wrapper"
                style={{
                  borderRadius: "8px",
                  overflow: "hidden",
                  maxWidth: "100%",
                  maxHeight: "300px",
                  backgroundColor: "rgba(0, 0, 0, 0.2)",
                }}
              >
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "block" }}
                >
                  <img
                    src={fileUrl}
                    alt={fileName}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "300px",
                      objectFit: "contain",
                      display: "block",
                      margin: "0 auto",
                    }}
                  />
                </a>
              </div>
            );
          }

          if (isVideo) {
            return (
              <div
                key={att.id}
                className="attachment-video-wrapper"
                style={{
                  borderRadius: "8px",
                  overflow: "hidden",
                  maxWidth: "100%",
                }}
              >
                <video
                  controls
                  style={{
                    maxWidth: "100%",
                    maxHeight: "300px",
                    display: "block",
                    borderRadius: "8px",
                    backgroundColor: "#000",
                  }}
                >
                  <source src={fileUrl} />
                  Your browser does not support the video tag.
                </video>
              </div>
            );
          }

          if (isAudio) {
            return (
              <div
                key={att.id}
                className="attachment-audio-wrapper"
                style={{ width: "100%", minWidth: "240px", padding: "4px 0" }}
              >
                <audio controls style={{ width: "100%", height: "36px" }}>
                  <source src={fileUrl} />
                  Your browser does not support the audio element.
                </audio>
              </div>
            );
          }

          // Document / Default Download Card
          return (
            <a
              key={att.id}
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={fileName}
              className="attachment-document-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 12px",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "8px",
                textDecoration: "none",
                color: "inherit",
                transition: "background-color 0.2s ease",
              }}
            >
              <div style={{ fontSize: "24px", flexShrink: 0 }}>📄</div>
              <div style={{ overflow: "hidden", flexGrow: 1 }}>
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: "14px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {fileName}
                </div>
                <div
                  style={{ fontSize: "12px", opacity: 0.7, marginTop: "2px" }}
                >
                  {fileSizeBytes > 0 ? `${sizeMB} MB` : "Document"}
                </div>
              </div>
              <div style={{ fontSize: "18px", flexShrink: 0, opacity: 0.8 }}>
                ⬇️
              </div>
            </a>
          );
        })}
      </div>
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
          {renderAttachments(message.attachments)}
        </div>
      ) : (
        <>
          {message.is_deleted ? (
            <div className="message-text">Deleted message</div>
          ) : (
            <>
              {messageText ? (
                <div className="message-text">{renderContent(messageText)}</div>
              ) : null}
              {renderAttachments(message.attachments)}
            </>
          )}
        </>
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
          {canReply && (
            <button
              className="action-btn"
              onClick={() => onReply(message)}
              type="button"
            >
              Reply
            </button>
          )}

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
          src={senderAvatarUrl || "/default-avatar.svg"}
          onClick={() => onAvatarClick && onAvatarClick(String(message.sender))}
          alt=""
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            flexShrink: 0,
            cursor: "pointer",
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
