import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createChannel } from "../services/channelService";
import { validateUsername } from "../utils/validators"; // Import utility
import "../styles/create-channel.css";

export default function CreateChannelPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [isPrivate, setIsPrivate] = useState(true);
  const [publicId, setPublicId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  const previewUrl = useMemo(() => {
    if (!avatar) return "";
    return URL.createObjectURL(avatar);
  }, [avatar]);

  // Name remains unchanged (simple non-empty check)
  const isNameValid = name.trim().length > 0;
  
  // Public ID uses the imported validator
  const isPublicIdValid = isPrivate || validateUsername(publicId.trim());

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setAvatar(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isNameValid) {
      setError("Channel name is required.");
      return;
    }

    if (!isPublicIdValid) {
      setError("Public ID must be at least 4 characters and contain only letters and numbers.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const createdChannel = await createChannel({
        name: name.trim(),
        description: description.trim(),
        avatar: avatar ?? undefined,
        is_private: isPrivate,
        public_id: isPrivate ? null : publicId.trim(),
      });

      setInviteLink(createdChannel.invite_link);
      navigate(`/HomePage/?chat=${createdChannel.id}`);
    } catch (err: any) {
      const backendMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.response?.data?.public_id?.[0] ||
        err?.response?.data?.name?.[0];

      setError(backendMessage || "Failed to create channel.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="create-channel-page">
      <div className="create-channel-card">
        <div className="create-channel-header">
          <button
            type="button"
            className="create-channel-back-btn"
            onClick={() => navigate("/HomePage/")}
          >
            ← Back
          </button>

          <div>
            <h1 className="create-channel-title">Create New Channel</h1>
            <p className="create-channel-subtitle">
              Create a dedicated space for discussions with a name, description,
              avatar, and privacy settings.
            </p>
          </div>
        </div>

        <form className="create-channel-form" onSubmit={handleSubmit}>
          <div className="create-channel-avatar-section">
            <div className="create-channel-avatar-preview-wrapper">
              <img
                src={previewUrl || "https://i.pravatar.cc/160?img=15"}
                alt="Channel avatar preview"
                className="create-channel-avatar-preview"
              />
            </div>

            <label className="create-channel-upload-btn">
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
                className="create-channel-remove-avatar-btn"
                onClick={() => setAvatar(null)}
              >
                Remove Avatar
              </button>
            )}
          </div>

          <div className="create-channel-field">
            <label htmlFor="channel-name" className="create-channel-label">
              Channel Name <span className="required-star">*</span>
            </label>
            <input
              id="channel-name"
              type="text"
              className="create-channel-input"
              placeholder="Enter channel name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
            />
          </div>

          <div className="create-channel-field">
            <label htmlFor="channel-description" className="create-channel-label">
              Description
            </label>
            <textarea
              id="channel-description"
              className="create-channel-textarea"
              placeholder="Add a short description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
            />
          </div>

          <div className="create-channel-field">
            <label className="create-channel-label">Privacy</label>
            <div className="privacy-toggle">
              <button
                type="button"
                className={isPrivate ? "privacy-option active" : "privacy-option"}
                onClick={() => setIsPrivate(true)}
              >
                Private
              </button>
              <button
                type="button"
                className={!isPrivate ? "privacy-option active" : "privacy-option"}
                onClick={() => setIsPrivate(false)}
              >
                Public
              </button>
            </div>
          </div>

          {!isPrivate && (
            <div className="create-channel-field">
              <label htmlFor="public-id" className="create-channel-label">
                Public ID <span className="required-star">*</span>
              </label>

              <div
                className="public-id-input-wrapper"
                style={{ display: "flex", alignItems: "center" }}
              >
                <span
                  className="public-id-prefix"
                  style={{ paddingRight: "8px", fontWeight: "bold", color: "#888" }}
                >
                  @
                </span>
                <input
                  id="public-id"
                  type="text"
                  className="create-channel-input"
                  placeholder="unique-channel-id"
                  value={publicId}
                  onChange={(e) => {
                    setPublicId(e.target.value);
                    if (error) setError("");
                  }}
                  style={{ flex: 1 }}
                />
              </div>

              {!isPublicIdValid && (
                <p className="field-help" style={{ color: "#ef4444" }}>
                  Public ID must be at least 4 characters long, start with a letter, and
                  contain only letters, numbers, or underscores. It cannot contain two
                  underscores in a row or end with an underscore.
                </p>
              )}
            </div>
          )}


          {error && <div className="create-channel-error">{error}</div>}

          {inviteLink && (
            <div className="create-channel-success">
              <div className="success-title">Channel created successfully.</div>
              <div className="success-link">{inviteLink}</div>
            </div>
          )}

          <div className="create-channel-actions">
            <button
              type="button"
              className="create-channel-secondary-btn"
              onClick={() => navigate("/HomePage/")}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="create-channel-primary-btn"
              disabled={!isNameValid || (!isPublicIdValid && !isPrivate) || submitting}
            >
              {submitting ? "Creating..." : "Create Channel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
