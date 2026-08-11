import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getChannelPreview,
  getChannelProfile,
  joinChannelByInviteLink,
  type ChannelPreview,
} from "../services/channelService";

export default function ChannelInvitePage() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<ChannelPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const [isMember, setIsMember] = useState<boolean | null>(null); // null = unknown
  const [membershipChecking, setMembershipChecking] = useState(false);

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

  useEffect(() => {
    if (!preview || isMember !== null) return;

    let isMounted = true;
    setMembershipChecking(true);

    const checkMembership = async () => {
      try {
        await getChannelProfile(preview.id);
        if (isMounted) setIsMember(true);
      } catch (err: any) {
        if (isMounted) {
          setIsMember(false);
        }
      } finally {
        if (isMounted) setMembershipChecking(false);
      }
    };

    checkMembership();

    return () => {
      isMounted = false;
    };
  }, [preview, isMember]);

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/HomePage/", { replace: true });
    }
  };

  const goHome = (openChatId?: string) => {
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
        setIsMember(true);
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
              onClick={goBack}
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
              Back
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
              <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 20 }}>
                {preview.description}
              </p>
            )}

            {error && (
              <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>
                {error}
              </div>
            )}

            {membershipChecking ? (
              <div style={{ color: "#8b949e" }}>Checking membership…</div>
            ) : isMember === true ? (
              // Already a member – show Open and Cancel
              <>
                <div style={{ color: "#fbbf24", fontSize: 14, marginBottom: 12 }}>
                  You are already a member of this channel.
                </div>
                <button
                  type="button"
                  onClick={() => goHome(preview.id)}
                  style={{
                    padding: "12px 24px",
                    borderRadius: 8,
                    border: "none",
                    background: "#3b82f6",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  Open Channel
                </button>
                <button
                  type="button"
                  onClick={goBack}
                  style={{
                    marginTop: 12,
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "1px solid #30363d",
                    background: "transparent",
                    color: "#8b949e",
                    cursor: "pointer",
                    fontSize: 14,
                    width: "100%",
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              // Not a member – show Join and Cancel
              <>
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
                <button
                  type="button"
                  onClick={goBack}
                  style={{
                    marginTop: 12,
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "1px solid #30363d",
                    background: "transparent",
                    color: "#8b949e",
                    cursor: "pointer",
                    fontSize: 14,
                    width: "100%",
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}