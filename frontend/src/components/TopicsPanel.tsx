import { useState } from "react";
import type { Topic } from "../types/chat";

interface TopicsPanelProps {
  topics: Topic[];
  activeTopicId: string | null;
  onSelectTopic: (topicId: string | null) => void;
  canCreateTopic: boolean;
  canManageOthersTopics: boolean;
  currentUserId: string | null;
  onCreateTopic: (name: string) => Promise<void>;
  onRenameTopic: (topicId: string, name: string) => Promise<void>;
  onDeleteTopic: (topicId: string) => Promise<void>;
}

// Task #22 — "+ New Topic" action (only for users with can_create_topic),
// rename/delete for the topic's own creator.
// Task #49 — rename/delete also exposed to users with can_manage_others_topics,
// on ANY topic (not just their own). Deleting always requires confirmation.
export default function TopicsPanel({
  topics,
  activeTopicId,
  onSelectTopic,
  canCreateTopic,
  canManageOthersTopics,
  currentUserId,
  onCreateTopic,
  onRenameTopic,
  onDeleteTopic,
}: TopicsPanelProps) {
  const [creating, setCreating] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [busy, setBusy] = useState(false);

  const canManageTopic = (topic: Topic) =>
    canManageOthersTopics || String(topic.creator_id) === String(currentUserId);

  const handleCreate = async () => {
    const trimmed = newTopicName.trim();
    if (!trimmed) return;
    try {
      setBusy(true);
      await onCreateTopic(trimmed);
      setNewTopicName("");
      setCreating(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create topic");
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (topic: Topic) => {
    const name = window.prompt("Rename topic", topic.name);
    if (!name || !name.trim() || name.trim() === topic.name) return;
    try {
      await onRenameTopic(topic.id, name.trim());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to rename topic");
    }
  };

  const handleDelete = async (topic: Topic) => {
    if (!window.confirm(`Delete the topic "${topic.name}"? This cannot be undone.`)) return;
    try {
      await onDeleteTopic(topic.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete topic");
    }
  };

  return (
    <div
      className="topics-panel"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        overflowX: "auto",
      }}
    >
      <button
        type="button"
        onClick={() => onSelectTopic(null)}
        style={{
          padding: "6px 12px",
          borderRadius: 16,
          border: "none",
          cursor: "pointer",
          whiteSpace: "nowrap",
          fontWeight: 600,
          fontSize: 13,
          background: activeTopicId === null ? "#1db954" : "rgba(255,255,255,0.08)",
          color: activeTopicId === null ? "#04120a" : "#d1d5db",
        }}
      >
        General
      </button>

      {topics.map((topic) => (
        <div key={topic.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            onClick={() => onSelectTopic(topic.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 16,
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontWeight: 600,
              fontSize: 13,
              background: activeTopicId === topic.id ? "#1db954" : "rgba(255,255,255,0.08)",
              color: activeTopicId === topic.id ? "#04120a" : "#d1d5db",
            }}
          >
            # {topic.name}
          </button>
          {canManageTopic(topic) && (
            <>
              <button
                type="button"
                onClick={() => handleRename(topic)}
                title="Rename topic"
                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
              >
                ✎
              </button>
              <button
                type="button"
                onClick={() => handleDelete(topic)}
                title="Delete topic"
                style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 12 }}
              >
                ✕
              </button>
            </>
          )}
        </div>
      ))}

      {canCreateTopic &&
        (creating ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              autoFocus
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewTopicName("");
                }
              }}
              placeholder="Topic name"
              className="edit-input"
              style={{ width: 140 }}
              disabled={busy}
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy || !newTopicName.trim()}
              className="create-role-btn"
            >
              {busy ? "..." : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewTopicName("");
              }}
              className="edit-group-btn"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              padding: "6px 12px",
              borderRadius: 16,
              border: "1px dashed rgba(255,255,255,0.3)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontSize: 13,
              background: "transparent",
              color: "#9ca3af",
            }}
          >
            + New Topic
          </button>
        ))}
    </div>
  );
}
