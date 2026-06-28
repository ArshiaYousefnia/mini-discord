import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { UserEditProfile } from "../types/user";
import { getUserEditProfile, updateUserProfile } from "../services/users";
import "../styles/editProfile.css";

export default function EditProfilePage() {
  const { userId } = useParams<{ userId: string }>();

  const [user, setUser] = useState<UserEditProfile | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) {
      setError("Invalid user ID.");
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const data = await getUserEditProfile(userId);

        setUser(data);
        setEmail(data.email);
        setDisplayName(data.display_name);
        setBio(data.bio || "");
      } catch (err: any) {
        if (err.response?.status === 401) {
          setError("You must be logged in.");
        } else {
          setError("Failed to load profile.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    if (displayName.length > 32) {
      setError("Display name must be under 32 characters.");
      return;
    }

    if (bio.length > 190) {
      setError("Bio must be under 190 characters.");
      return;
    }

    if (avatarFile && avatarFile.size > 2 * 1024 * 1024) {
      setError("Avatar must be smaller than 2MB.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const formData = new FormData();
      formData.append("email", email);
      formData.append("display_name", displayName);
      formData.append("bio", bio);

      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      const updated = await updateUserProfile(userId, formData);

      setUser(updated);

      // clear preview so UI switches to backend avatar_url
      setAvatarPreview(null);
      setAvatarFile(null);

      alert("Profile updated successfully.");
    } catch (err: any) {
      if (err.response?.data) {
        setError(JSON.stringify(err.response.data));
      } else {
        setError("Failed to update profile.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="edit-profile-page">
        <div className="edit-profile-card">Loading profile...</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="edit-profile-page">
        <div className="edit-profile-card">{error}</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="edit-profile-page">
      <div className="edit-profile-card">
        <form onSubmit={handleSubmit}>
          <div className="edit-profile-header">
            <img
              src={avatarPreview || user.avatar_url || ""}
              alt={user.display_name}
              className="edit-profile-avatar"
            />

            <input
              type="file"
              accept="image/png, image/jpeg"
              onChange={handleAvatarChange}
            />
          </div>

          <div className="edit-field">
            <label>Username</label>
            <input value={user.username} disabled />
          </div>

          <div className="edit-field">
            <label>Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="edit-field">
            <label>Display Name</label>
            <input
              value={displayName}
              maxLength={32}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="edit-field">
            <label>Bio</label>
            <textarea
              value={bio}
              maxLength={190}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>

          {error && <div className="edit-error">{error}</div>}

          <button className="save-button" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
