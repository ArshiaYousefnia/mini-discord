import React, { useEffect, useRef, useState } from "react";
import type { Message } from "../types/chat";
import "../styles/chat.css";

type Props = {
  activeReplyTo: Message | null;
  disabled?: boolean;
  placeholder?: string;
  onCancelReply: () => void;
  onSendMessage: (text: string) => Promise<void>;
};

export default function MessageInput({
  activeReplyTo,
  disabled = false,
  placeholder = "Type a message...",
  onCancelReply,
  onSendMessage,
}: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

    if (!text.trim() || loading || disabled) {
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
          placeholder={disabled ? "Chat is not available." : placeholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={2000}
          disabled={loading || disabled}
          rows={1}
        />

        <button
          type="submit"
          className="chat-send-btn"
          disabled={!text.trim() || loading || disabled}
          aria-label="Send message"
        >
          {loading ? "..." : "➤"}
        </button>
      </form>
    </div>
  );
}