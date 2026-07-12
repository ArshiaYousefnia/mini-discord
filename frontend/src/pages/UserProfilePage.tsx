import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getUserProfile} from "../services/users";
import "../styles/userProfile.css";
import type { UserProfile } from "../types/user";

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) {
      setError("Invalid user ID.");
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getUserProfile(userId);
        setUser(data);
      } catch (err: any) {
        if (err.response?.status === 401) {
          setError("You must be logged in to view this profile.");
        } else if (err.response?.status === 404) {
          setError("User not found.");
        } else {
          setError("Failed to load user profile.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  if (loading) {
    return (
      <div className="user-profile-page">
        <div className="user-profile-card">Loading profile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="user-profile-page">
        <div className="user-profile-card">{error}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="user-profile-page">
        <div className="user-profile-card">User not found.</div>
      </div>
    );
  }

  return (
    <div className="user-profile-page">
      <div className="user-profile-card">
        <div className="user-profile-header">
          <img
            src={user.avatar_url || ""}
            alt={user.display_name}
            className="user-profile-avatar"
          />

          <div className="user-profile-info">
            <h1 className="user-profile-name">
              {user.display_name}
            </h1>

            <div
              className={`user-status ${
                user.is_online ? "online" : "offline"
              }`}
            >
              {user.is_online ? "Online" : "Offline"}
            </div>
          </div>
        </div>

        {user.bio && user.bio.trim() !== "" && (
          <div className="user-profile-bio">
            <h2>Bio</h2>
            <p>{user.bio}</p>
          </div>
        )}

        <button
          className="message-button"
          onClick={() => alert("Messaging feature coming soon")}
        >
          Message
        </button>
      </div>
    </div>
  );
}
