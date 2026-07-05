import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { UserEditProfile } from "../types/user";
import { getUserEditProfile, updateUserProfile} from "../services/users";
import "../styles/editProfile.css";
import { logoutUser } from "../services/authService";

export default function EditProfilePage() {
  const userId = localStorage.getItem("Id");
  console.log(userId);
  
  const navigate = useNavigate();

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
    // 1. Client-side check: If no token is in localStorage, redirect immediately
    // Inside EditProfilePage.tsx useEffect
    const token = localStorage.getItem("accessToken"); 
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }


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
        // 2. API check: If the backend says unauthorized, redirect immediately
        if (err.response?.status === 401) {
          navigate("/login", { replace: true });
        } else {
          setError("Failed to load profile.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId, navigate]); // Added navigate to dependency array


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

  const handleLogout = async () => {
    try {
      const refreshToken = localStorage.getItem("refreshToken");
      if (refreshToken) {
        await logoutUser(refreshToken);
      }
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      // Make sure these match exactly what you set in LoginForm
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("username");
      localStorage.removeItem("email");
      localStorage.removeItem("id");
      localStorage.removeItem("display_name");
      navigate("/login", { replace: true });
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
              src={avatarPreview || user.avatar || ""}
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

          <div className="button-group">
            <button type="submit" className="save-button" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" className="logout-button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
