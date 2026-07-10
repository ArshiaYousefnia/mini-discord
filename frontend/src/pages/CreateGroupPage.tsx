// src/pages/CreateGroupPage.tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createGroup } from "../services/groupService.ts";
import "../styles/create-group.css";

export default function CreateGroupPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const previewUrl = useMemo(() => {
    if (!avatar) return "";
    return URL.createObjectURL(avatar);
  }, [avatar]);

  const isNameValid = name.trim().length > 0;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setAvatar(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isNameValid) {
      setError("Group name is required.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const createdGroup = await createGroup({
        name: name.trim(),
        description: description.trim(),
        avatar,
      });

      // redirect directly to the created group chat
      navigate(`/?chat=${createdGroup.id}`);
    } catch (err: any) {
      const backendMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.response?.data?.error;

      setError(backendMessage || "Failed to create group.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="create-group-page">
      <div className="create-group-card">
        <div className="create-group-header">
          <button
            type="button"
            className="create-group-back-btn"
            onClick={() => navigate("/HomePage/")}
          >
            ← Back
          </button>

          <div>
            <h1 className="create-group-title">Create New Group</h1>
            <p className="create-group-subtitle">
              Set up a private group with a name, optional description, and avatar.
            </p>
          </div>
        </div>

        <form className="create-group-form" onSubmit={handleSubmit}>
          <div className="create-group-avatar-section">
            <div className="create-group-avatar-preview-wrapper">
              <img
                src={
                  previewUrl ||
                  "https://i.pravatar.cc/160?img=15"
                }
                alt="Group avatar preview"
                className="create-group-avatar-preview"
              />
            </div>

            <label className="create-group-upload-btn">
              Upload Avatar
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                hidden
              />
            </label>

            {avatar && (
              <button
                type="button"
                className="create-group-remove-avatar-btn"
                onClick={() => setAvatar(null)}
              >
                Remove Avatar
              </button>
            )}
          </div>

          <div className="create-group-field">
            <label htmlFor="group-name" className="create-group-label">
              Group Name <span className="required-star">*</span>
            </label>
            <input
              id="group-name"
              type="text"
              className="create-group-input"
              placeholder="Enter group name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
            />
          </div>

          <div className="create-group-field">
            <label htmlFor="group-description" className="create-group-label">
              Description
            </label>
            <textarea
              id="group-description"
              className="create-group-textarea"
              placeholder="Add a short description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
            />
          </div>

          {error && <div className="create-group-error">{error}</div>}

          <div className="create-group-actions">
            <button
              type="button"
              className="create-group-secondary-btn"
              onClick={() => navigate("/")}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="create-group-primary-btn"
              disabled={!isNameValid || submitting}
            >
              {submitting ? "Creating..." : "Create Group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
