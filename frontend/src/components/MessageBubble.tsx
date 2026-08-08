import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Message } from "../types/chat";
import { joinGroupByToken } from "../services/groupService";
import "../styles/chat.css";
import CachedAttachment from "./CachedAttachment";

export type UserProfileUpdate = {
  username?: string | null;
  display_name?: string | null;
  displayName?: string | null;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  avatar?: string | null;
};

export type UserProfileUpdates =
  | ReadonlyMap<string, UserProfileUpdate>
  | Readonly<Record<string, UserProfileUpdate | undefined>>;

function getProfileUpdate(
  updates: UserProfileUpdates | undefined,
  userId: string,
): UserProfileUpdate | undefined {
  if (!updates) return undefined;

  if (updates instanceof Map) {
    return updates.get(userId);
  }

  return (
    updates as Readonly<Record<string, UserProfileUpdate | undefined>>
  )[userId];
}

function hasOwnProperty(
  value: object,
  property: PropertyKey,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, property);
}

type Props = {
  message: Message;
  currentUserId?: string | null;
  currentUsername?: string | null;
  replyMessage?: Message | null;

  // This means that the current user may delete messages belonging to
  // other users. This applies to group owners and channel members/owners
  // with the "Delete others messages" permission.
  canDeleteOthers?: boolean;

  isGroupChat?: boolean;
  senderAvatarUrl?: string;

  // Latest profile data received through the profile-update WebSocket.
  // It is optional so existing MessageBubble call sites remain compatible.
  userProfileUpdates?: UserProfileUpdates;

  canReply?: boolean;
  onReply: (message: Message) => void;
  onEdit: (messageId: string, newText: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onAvatarClick?: (userId: string) => void;
  onGroupJoined?: (groupId: string) => void;

  // Optional override hook for the invite-preview flow.
  onChannelPreview?: (token: string) => void;
};

export default function MessageBubble({
  message,
  currentUserId,
  currentUsername,
  replyMessage,
  canDeleteOthers = false,
  isGroupChat = false,
  senderAvatarUrl,
  userProfileUpdates,
  canReply = true,
  onReply,
  onEdit,
  onDelete,
  onAvatarClick,
  onGroupJoined,
  onChannelPreview,
}: Props) {
  const navigate = useNavigate();
  const messageText = message.content ?? "";
  const senderId = String(message.sender);

  const senderProfileUpdate = getProfileUpdate(
    userProfileUpdates,
    senderId,
  );

  const senderDisplayName =
    senderProfileUpdate?.display_name ||
    senderProfileUpdate?.displayName ||
    senderProfileUpdate?.username ||
    message.sender_display_name ||
    message.sender_username;

  // Checking whether the field exists allows an explicit null avatar update
  // to replace an old avatar with the default avatar.
  const senderUpdateContainsAvatar =
    senderProfileUpdate != null &&
    (hasOwnProperty(senderProfileUpdate, "avatar_url") ||
      hasOwnProperty(senderProfileUpdate, "avatarUrl") ||
      hasOwnProperty(senderProfileUpdate, "avatar"));

  const updatedSenderAvatarUrl =
    senderProfileUpdate?.avatar_url ??
    senderProfileUpdate?.avatarUrl ??
    senderProfileUpdate?.avatar ??
    null;

  const resolvedSenderAvatarUrl = senderUpdateContainsAvatar
    ? updatedSenderAvatarUrl || "/default-avatar.svg"
    : senderAvatarUrl || "/default-avatar.svg";

  const isMe =
    (currentUserId != null &&
      senderId === String(currentUserId)) ||
    (currentUsername != null &&
      message.sender_username === currentUsername);

  const alignmentClass = isMe ? "outgoing" : "incoming";
  const canDelete = isMe || canDeleteOthers;
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
      alert(
        err instanceof Error
          ? err.message
          : "Failed to edit message",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const isModerationDelete = !isMe && canDeleteOthers;

    const confirmText = isModerationDelete
      ? "Delete this message for everyone in this chat?"
      : "Are you sure you want to delete this message?";

    if (!window.confirm(confirmText)) return;

    try {
      await onDelete(message.id);
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Failed to delete message",
      );
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

  const handleJoinChannel = (token: string) => {
    // Invite links always go through the read-only preview screen first.
    if (onChannelPreview) {
      onChannelPreview(token);
      return;
    }

    navigate(`/channels/join/${token}`);
  };

  const renderContent = (text: string) => {
    // Matches group/channel invite URLs with an optional trailing slash.
    const inviteRegex =
      /(http:\/\/(?:groups|channels)\/join\/[a-zA-Z0-9_-]+\/?)/g;

    const parts = text.split(inviteRegex);

    return (
      <span className="message-content">
        {parts.map((part, index) => {
          if (part.match(inviteRegex)) {
            const cleanPart = part.endsWith("/")
              ? part.slice(0, -1)
              : part;

            const urlSegments = cleanPart.split("/");
            const token = urlSegments.pop() || "";
            const isChannel = urlSegments.includes("channels");

            return (
              <button
                key={`${part}-${index}`}
                className="inline-invite-link"
                onClick={() =>
                  isChannel
                    ? handleJoinChannel(token)
                    : handleJoinGroup(token)
                }
                disabled={!isChannel && joinLoading}
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
                {!isChannel && joinLoading ? "Joining..." : part}
              </button>
            );
          }

          return <span key={`${part}-${index}`}>{part}</span>;
        })}
      </span>
    );
  };

  const renderAttachments = (attachments?: any[]) => {
    if (!attachments || attachments.length === 0) {
      return null;
    }

    return (
      <div
        className="message-attachments"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginBottom: "8px",
        }}
      >
        {attachments.map((attachment) => (
          <CachedAttachment
            key={attachment.id}
            attachment={attachment}
          />
        ))}
      </div>
    );
  };

  const renderReplyPreview = () => {
    if (replyMessage) {
      const replySenderProfileUpdate = getProfileUpdate(
        userProfileUpdates,
        String(replyMessage.sender),
      );

      const replySenderDisplayName =
        replySenderProfileUpdate?.display_name ||
        replySenderProfileUpdate?.displayName ||
        replySenderProfileUpdate?.username ||
        replyMessage.sender_display_name ||
        replyMessage.sender_username;

      return (
        <div
          className="message-reply-preview"
          onClick={() => {
            if (replyMessage.is_deleted) return;

            const target = document.getElementById(
              `msg-${replyMessage.id}`,
            );

            if (target) {
              target.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });

              target.classList.remove(
                "message-highlight-flash",
              );

              void target.offsetWidth;

              target.classList.add(
                "message-highlight-flash",
              );

              setTimeout(() => {
                target.classList.remove(
                  "message-highlight-flash",
                );
              }, 1600);
            }
          }}
          style={{
            cursor: replyMessage.is_deleted
              ? "default"
              : "pointer",
          }}
        >
          {replyMessage.is_deleted ? (
            <div
              className="reply-text-preview"
              style={{
                fontStyle: "italic",
                opacity: 0.7,
              }}
            >
              Original message was deleted
            </div>
          ) : (
            <>
              <div className="reply-sender">
                {replySenderDisplayName}
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
          style={{
            cursor: "default",
            fontStyle: "italic",
            opacity: 0.6,
          }}
        >
          <div className="reply-text-preview">
            Original message unavailable
          </div>
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
          {/* Media renders above the textarea in edit mode. */}
          {renderAttachments(message.attachments)}

          <textarea
            className="edit-textarea"
            value={editText}
            onChange={(event) =>
              setEditText(event.target.value)
            }
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
        <>
          {message.is_deleted ? (
            <div className="message-text">
              Deleted message
            </div>
          ) : (
            <>
              {/* Media renders above message text. */}
              {renderAttachments(message.attachments)}

              {messageText ? (
                <div className="message-text">
                  {renderContent(messageText)}
                </div>
              ) : null}
            </>
          )}
        </>
      )}

      {!isEditing && (
        <div className="message-meta">
          {message.is_edited && !message.is_deleted && (
            <span className="message-edited-label">
              (edited)
            </span>
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
          src={resolvedSenderAvatarUrl}
          onClick={() => onAvatarClick?.(senderId)}
          onError={(event) => {
            if (
              event.currentTarget.src.endsWith(
                "/default-avatar.svg",
              )
            ) {
              return;
            }

            event.currentTarget.src = "/default-avatar.svg";
          }}
          alt={
            senderDisplayName
              ? `${senderDisplayName}'s avatar`
              : "Sender avatar"
          }
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            flexShrink: 0,
            cursor: onAvatarClick ? "pointer" : "default",
            objectFit: "cover",
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
            {senderDisplayName}
          </div>
        )}

        {bubbleInnerContent}
      </div>
    </div>
  );
}
