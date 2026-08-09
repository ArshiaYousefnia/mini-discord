import { useCallback, useEffect, useState } from "react";
import type { ScheduledMessage } from "../types/chat";
import {
  cancelAllForConversation,
  deleteScheduledMessage,
  getScheduledMessages,
} from "../services/scheduledMessageService";
import "../styles/chat.css";

type Props = {
  conversationId: string;
  onClose: () => void;
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ScheduledMessagesPanel({
  conversationId,
  onClose,
}: Props) {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const all = await getScheduledMessages();
      setMessages(
        all.filter(
          (message) => String(message.conversation) === String(conversationId)
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load scheduled messages."
      );
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancel = async (id: string) => {
    setActionLoadingId(id);
    try {
      await deleteScheduledMessage(id);
      setMessages((previous) => previous.filter((m) => m.id !== id));
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Failed to cancel scheduled message."
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelAll = async () => {
    const confirmed = window.confirm(
      "Cancel all pending scheduled messages in this conversation?"
    );
    if (!confirmed) return;

    setActionLoadingId("all");
    try {
      await cancelAllForConversation(conversationId);
      setMessages([]);
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Failed to cancel scheduled messages."
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="scheduled-messages-panel">
      <div className="scheduled-messages-panel-header">
        <h3>Scheduled messages</h3>
        <div className="scheduled-messages-panel-header-actions">
          {messages.length > 0 && (
            <button
              type="button"
              className="scheduled-messages-cancel-all"
              onClick={handleCancelAll}
              disabled={actionLoadingId === "all"}
            >
              {actionLoadingId === "all" ? "Cancelling..." : "Cancel all"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scheduled messages"
          >
            &times;
          </button>
        </div>
      </div>

      {loading && (
        <div className="scheduled-messages-panel-status">Loading...</div>
      )}

      {!loading && error && (
        <div className="scheduled-messages-panel-status error">{error}</div>
      )}

      {!loading && !error && messages.length === 0 && (
        <div className="scheduled-messages-panel-status">
          No pending scheduled messages in this conversation.
        </div>
      )}

      {!loading && !error && messages.length > 0 && (
        <ul className="scheduled-messages-list">
          {messages.map((message) => (
            <li key={message.id} className="scheduled-message-item">
              <div className="scheduled-message-content">
                <div className="scheduled-message-time">
                  🕒 {formatDateTime(message.scheduled_at)}
                </div>
                <div className="scheduled-message-text">
                  {message.content || "(attachment only)"}
                </div>
                {message.attachments.length > 0 && (
                  <div className="scheduled-message-attachments">
                    📎 {message.attachments.length} attachment
                    {message.attachments.length > 1 ? "s" : ""}
                  </div>
                )}
              </div>

              <div className="scheduled-message-actions">
                <button
                  type="button"
                  className="scheduled-message-cancel"
                  disabled={actionLoadingId === message.id}
                  onClick={() => handleCancel(message.id)}
                >
                  {actionLoadingId === message.id ? "..." : "Cancel"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}