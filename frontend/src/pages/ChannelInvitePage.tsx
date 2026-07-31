import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getChannelPreview, joinChannelByInviteLink, type ChannelPreview } from "../services/channelService";

// Task #20 — Join a Channel with Invite Link
//
// Route: /channels/join/:inviteCode
// Flow: fetch a read-only preview (name, avatar) -> show a "Join Channel"
// button -> on click, join and redirect to the main chat view. Invalid
// links show a simple "Invalid link" message and never join anything.
export default function ChannelInvitePage() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<ChannelPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!inviteCode) {
      setInvalid(true);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadPreview = async () => {
      try {
        setLoading(true);
        const data = await getChannelPreview(inviteCode);
        if (isMounted) setPreview(data);
      } catch {
        if (isMounted) setInvalid(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadPreview();
    return () => {
      isMounted = false;
    };
  }, [inviteCode]);

  const goHome = (openChatId?: string) => {
    // HomePage.tsx already knows how to select a chat via a `?chat=<id>`
    // query param (see its `loadChats` / `chatIdFromUrl` logic), the same
    // mechanism used after joining a group. Reusing it here means no
    // HomePage changes are needed for the invite-link flow.
    navigate(openChatId ? `/HomePage/?chat=${openChatId}` : "/HomePage/", { replace: true });
  };

  const handleJoin = async () => {
    if (!inviteCode) return;

    try {
      setJoining(true);
      setError("");
      const data = await joinChannelByInviteLink(inviteCode);
      goHome(data?.id || preview?.id);
    } catch (err: any) {
      if (err?.response?.status === 400 && preview) {
        // Already a member — nothing to join, just take them to the channel.
        goHome(preview.id);
        return;
      }
      if (err?.response?.status === 404) {
        setInvalid(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to join channel.");
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0d1117",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#161b22",
          borderRadius: 16,
          padding: 32,
          textAlign: "center",
          color: "#e6edf3",
          boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
        }}
      >
        {loading && <div>Loading invite...</div>}

        {!loading && invalid && (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ margin: "0 0 8px" }}>Invalid link</h2>
            <p style={{ opacity: 0.7, marginBottom: 24 }}>
              This invite link is invalid or the channel no longer exists.
            </p>
            <button
              type="button"
              onClick={() => goHome()}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                background: "#1db954",
                color: "#04120a",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Back to Home
            </button>
          </>
        )}

        {!loading && !invalid && preview && (
          <>
            <img
              src={preview.avatar_url}
              alt={preview.name}
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                objectFit: "cover",
                margin: "0 auto 16px",
                display: "block",
              }}
            />
            <h2 style={{ margin: "0 0 4px" }}>{preview.name}</h2>
            {preview.description && (
              <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 20 }}>{preview.description}</p>
            )}

            {error && (
              <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{error}</div>
            )}

            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              style={{
                padding: "12px 24px",
                borderRadius: 8,
                border: "none",
                background: "#1db954",
                color: "#04120a",
                fontWeight: 700,
                fontSize: 15,
                cursor: joining ? "default" : "pointer",
                width: "100%",
              }}
            >
              {joining ? "Joining..." : "Join Channel"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
