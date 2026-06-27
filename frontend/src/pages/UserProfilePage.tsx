import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "../styles/userProfile.css";

import UserAvatar from "../components/UserAvatar";
import StatusBadge from "../components/StatusBadge";
import MessageButton from "../components/MessageButton";


type UserProfile = {
  id: string;
  display_name: string;
  bio?: string | null;
  avatar?: string | null;
  is_online: boolean;
};

export default function UserProfilePage() {
  const { userId } = useParams();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  //const isOnline = Boolean(user?.is_online);

  //for frontend demo
  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch(`/api/users/${userId}/`);

        if (!res.ok) {
          throw new Error("User not found");
        }

        const data = await res.json();
        setUser(data);
      } catch (err) {
        console.warn("Using demo user instead", err);

        // demo user
        setUser({
          id: "1",
          display_name: "Demo User",
          bio: "This is a demo profile used for frontend development.",
          avatar: null,
          is_online: true,
        });
      } finally {
        setLoading(false);
      }
    }

    fetchUser();
  }, [userId]);


  const handleMessage = async () => {
    if (!user) return;

    try {
      const res = await fetch(`/api/direct-messages/start/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: user.id }),
      });

      const data = await res.json();

      // redirect to DM thread
      window.location.href = `/chat/${data.thread_id}`;
    } catch (err) {
      console.error("Failed to start chat", err);
    }
  };

  if (loading) {
    return <div className="user-profile-page">Loading...</div>;
  }

  if (!user) {
    return <div className="user-profile-page">User not found</div>;
  }

  return (
    <div className="user-profile-page">
      <div className="user-profile-card">
        <div className="user-profile-header">
            <UserAvatar src={user.avatar} alt={user.display_name} />

            <div className="user-profile-info">
              <h1 className="user-profile-name">{user.display_name}</h1>
              <StatusBadge isOnline={user.is_online} />
            </div>
        </div>

        {user.bio && user.bio.trim() !== "" && (
          <div className="user-profile-bio">
            <h2>Bio</h2>
            <p>{user.bio}</p>
          </div>
        )}

      <MessageButton userId={user.id} />

      </div>
    </div>
  );
}
