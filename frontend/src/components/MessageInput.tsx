import React, { useEffect, useRef, useState } from "react";
import type { Message } from "../types/chat";
import "../styles/chat.css";

type Props = {
  activeReplyTo: Message | null;
  disabled?: boolean;
  canSendMessages?: boolean; // <-- Added permission property
  placeholder?: string;
  onCancelReply: () => void;
  onSendMessage: (text: string) => Promise<void>;
};

export default function MessageInput({
  activeReplyTo,
  disabled = false,
  canSendMessages = true, // <-- Default to true for backward compatibility
  placeholder = "Type a message...",
  onCancelReply,
  onSendMessage,
}: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!text.trim() || isInputDisabled) {
      return;
    }

    setLoading(true);

    try {
      await onSendMessage(text.trim());
      setText("");
      onCancelReply();

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  return (
    <div className="chat-input-area">
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
              {/* Task #52: is_deleted is the source of truth, not content emptiness */}
              {activeReplyTo.is_deleted
                ? "Original message was deleted"
                : activeReplyTo.content || ""}
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

      <form onSubmit={handleSubmit} className="chat-input-form">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder={displayPlaceholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={2000}
          disabled={isInputDisabled}
          rows={1}
        />

        <button
          type="submit"
          className="chat-send-btn"
          disabled={!text.trim() || isInputDisabled}
          aria-label="Send message"
        >
          {loading ? "..." : "➤"}
        </button>
      </form>
    </div>
  );
}
