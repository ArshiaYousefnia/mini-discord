import React, { useEffect, useRef, useState } from "react";
import type { Message } from "../types/chat";
import ScheduleMessageModal from "./ScheduleMessageModal";
import "../styles/chat.css";

type Props = {
  activeReplyTo: Message | null;
  disabled?: boolean;
  canSendMessages?: boolean;
  placeholder?: string;
  onCancelReply: () => void;
  // Updated signature to support file arrays
  onSendMessage: (text: string, files?: File[]) => Promise<void>;
  // New: schedule a message for future delivery. Omit to hide the feature
  // (e.g. for a not-yet-created pending DM conversation).
  onScheduleMessage?: (
    text: string,
    scheduledAt: Date,
    files?: File[]
  ) => Promise<void>;
  // New: open the panel listing this conversation's pending scheduled
  // messages. Omit to hide the button.
  onOpenScheduledMessages?: () => void;
};

const MAX_MESSAGE_LENGTH = 2000;

export default function MessageInput({
  activeReplyTo,
  disabled = false,
  canSendMessages = true,
  placeholder = "Type a message...",
  onCancelReply,
  onSendMessage,
  onScheduleMessage,
  onOpenScheduledMessages,
}: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combine disabled states
  const isInputDisabled = disabled || !canSendMessages || loading;

  // Determine appropriate placeholder based on state
  const displayPlaceholder = !canSendMessages
    ? "You do not have permission to send messages in this channel."
    : disabled
    ? "Chat is not available."
    : placeholder;

  useEffect(() => {
    if (!textareaRef.current) return;

    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(
      textareaRef.current.scrollHeight,
      120
    )}px`;
  }, [text]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const newFiles = Array.from(event.target.files);
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }

    // Clear the input value so the exact same file can be added again if removed
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (indexToRemove: number) => {
    setSelectedFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const resetComposer = () => {
    setText("");
    setSelectedFiles([]);
    onCancelReply();

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();

    const trimmedText = text.trim();
    const hasContent = trimmedText.length > 0 || selectedFiles.length > 0;
    const isOverLimit = text.length > MAX_MESSAGE_LENGTH;

    if (!hasContent || isInputDisabled || isOverLimit) {
      return;
    }

    setLoading(true);

    try {
      // Pass the selected files along with the text
      await onSendMessage(
        trimmedText,
        selectedFiles.length > 0 ? selectedFiles : undefined
      );

      resetComposer();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleConfirm = async (scheduledAt: Date) => {
    if (!onScheduleMessage) return;

    const trimmedText = text.trim();
    const hasContent = trimmedText.length > 0 || selectedFiles.length > 0;
    const isOverLimit = text.length > MAX_MESSAGE_LENGTH;

    if (!hasContent || isOverLimit) return;

    setScheduling(true);

    try {
      await onScheduleMessage(
        trimmedText,
        scheduledAt,
        selectedFiles.length > 0 ? selectedFiles : undefined
      );

      setShowScheduleModal(false);
      resetComposer();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to schedule message"
      );
    } finally {
      setScheduling(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const hasContent = text.trim().length > 0 || selectedFiles.length > 0;
  const isOverLimit = text.length > MAX_MESSAGE_LENGTH;

  return (
    <div className="chat-input-area" style={{ display: "flex", flexDirection: "column" }}>
      {activeReplyTo && (
        <div className="active-reply-bar">
          <div className="reply-details">
            <span className="reply-title">
              Replying to{" "}
              {activeReplyTo.sender_display_name ||
                activeReplyTo.sender_username ||
                "message"}
            </span>
            <span className="reply-text">
              {activeReplyTo.is_deleted
                ? "Original message was deleted"
                : activeReplyTo.content || "Attachment"}
            </span>
          </div>

          <button
            className="close-reply-btn"
            onClick={onCancelReply}
            type="button"
            aria-label="Cancel reply"
          >
            &times;
          </button>
        </div>
      )}

      {/* Pending Attachments Preview Bar */}
      {selectedFiles.length > 0 && (
        <div
          className="pending-attachments-bar"
          style={{
            display: "flex",
            gap: "8px",
            padding: "8px 12px",
            flexWrap: "wrap",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="pending-attachment-pill"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                padding: "4px 8px",
                borderRadius: "16px",
                fontSize: "12px",
              }}
            >
              <span style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file.name}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveFile(index)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ff4d4d",
                  cursor: "pointer",
                  padding: "0 2px",
                  display: "flex",
                  alignItems: "center",
                  fontSize: "14px",
                  fontWeight: "bold"
                }}
                aria-label={`Remove ${file.name}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {isOverLimit && (
        <div
          className="message-length-warning"
          style={{
            padding: "6px 12px",
            fontSize: "12px",
            fontWeight: 600,
            color: "#ef4444",
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            borderBottom: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          🚫 Message exceeds {MAX_MESSAGE_LENGTH} character limit ({text.length}/{MAX_MESSAGE_LENGTH})
        </div>
      )}

      <form onSubmit={handleSubmit} className="chat-input-form" style={{ display: "flex", alignItems: "center" }}>

        {/* Attachment Button */}
        <button
          type="button"
          className="chat-attach-btn"
          disabled={isInputDisabled}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach file"
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            fontSize: "20px",
            padding: "0 12px",
            cursor: isInputDisabled ? "not-allowed" : "pointer",
            opacity: isInputDisabled ? 0.4 : 0.7,
            transition: "opacity 0.2s"
          }}
          onMouseEnter={(e) => { if (!isInputDisabled) e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={(e) => { if (!isInputDisabled) e.currentTarget.style.opacity = "0.7"; }}
        >
          📎
        </button>

        {/* Hidden File Input */}
        <input
          type="file"
          multiple
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />

        {/* View Scheduled Messages Button */}
        {onOpenScheduledMessages && (
          <button
            type="button"
            className="chat-view-scheduled-btn"
            onClick={onOpenScheduledMessages}
            aria-label="View scheduled messages"
            title="View scheduled messages"
          >
            📅
          </button>
        )}

        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder={displayPlaceholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isInputDisabled}
          rows={1}
          style={{ flexGrow: 1 }}
        />

        {/* Schedule Button */}
        {onScheduleMessage && (
          <button
            type="button"
            className="chat-schedule-btn"
            disabled={!hasContent || isInputDisabled || isOverLimit}
            onClick={() => setShowScheduleModal(true)}
            aria-label="Schedule message"
            title="Schedule message"
          >
            🕒
          </button>
        )}

        <button
          type="submit"
          className="chat-send-btn"
          disabled={!hasContent || isInputDisabled || isOverLimit}
          aria-label="Send message"
        >
          {loading ? "..." : isOverLimit ? "🚫" : "➤"}
        </button>
      </form>

      <ScheduleMessageModal
        isOpen={showScheduleModal}
        submitting={scheduling}
        onCancel={() => setShowScheduleModal(false)}
        onConfirm={handleScheduleConfirm}
      />
    </div>
  );
}