import { useMemo, useState, useEffect, useRef } from "react";
import ChatItem from "./ChatItem";
import type { ChatListItem } from "../types/chat";
import type { BackendUserProfile } from "../types/user";
import { searchGlobal, type GlobalSearchResult, type ChannelSearchResult } from "../services/userService";
import { joinChannelByPublicId } from "../services/channelService";
import { useNavigate } from "react-router-dom";

type Props = {
  chats: ChatListItem[];
  selectedChatId: string | null;
  onSelectChat: (chat: ChatListItem) => void;
  currentUsername: string;
  onStartDirectMessage: (user: BackendUserProfile) => Promise<void>;
  onRefresh?: () => void;
  onlineUsers?: Record<string, boolean>;
  onChannelJoined?: (channelId: string) => void;
  onOpenUserProfile: (user: BackendUserProfile) => void;
};

function getLoggedInUsername(): string {
  try {
    const raw = localStorage.getItem("username");
    if (!raw) return "";

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed?.username) {
        return String(parsed.username).trim().toLowerCase();
      }
      if (typeof parsed === "string") {
        return parsed.trim().toLowerCase();
      }
    } catch {
      return raw.trim().toLowerCase();
    }
    return raw.trim().toLowerCase();
  } catch {
    return "";
  }
}

export default function Sidebar({
  chats,
  selectedChatId,
  onSelectChat,
  currentUsername,
  onStartDirectMessage,
  onOpenUserProfile,
  onRefresh,
  onlineUsers = {},
  onChannelJoined,
}: Props) {

  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState<string>("My Profile");
  const [avatarUrl, setAvatarUrl] = useState<string>(
    "https://i.pravatar.cc/150?img=12"
  );

  const [search, setSearch] = useState("");
  const [searchingGlobal, setSearchingGlobal] = useState(false);
  const [globalResults, setGlobalResults] = useState<GlobalSearchResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [joiningChannelId, setJoiningChannelId] = useState<string | null>(null);
  // Track which channels we know the user is already a member of
  const [membershipStatus, setMembershipStatus] = useState<Record<string, 'member'>>({});

  const [loggedInUsername, setLoggedInUsername] = useState("");

  // --- Polling logic (unchanged) ---
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (onRefreshRef.current) {
        onRefreshRef.current();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);
  // ---------------------------------

  useEffect(() => {
    const savedName = localStorage.getItem("display_name");
    const savedAvatar = localStorage.getItem("avatar_url");
    if (savedName) setDisplayName(savedName);
    if (savedAvatar) setAvatarUrl(savedAvatar);

    const fromStorage = getLoggedInUsername();
    const fromProp = (currentUsername || "").trim().toLowerCase();
    setLoggedInUsername(fromStorage || fromProp);
  }, [currentUsername]);

  const goToEditProfile = () => navigate("/profile/");
  const goToCreateGroup = () => navigate("/groups/create");
  const goToCreateChannel = () => navigate("/channels/create");

  const isGlobalSearchQuery = search.trim().startsWith("@");

  const filteredChats = useMemo(() => {
    if (isGlobalSearchQuery) return chats;
    return chats.filter((chat) =>
      chat.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [chats, search, isGlobalSearchQuery]);

  const handleGlobalSearch = async () => {
    const queryVal = search.trim().replace(/^@/, "");
    if (!queryVal) return;

    try {
      setSearchingGlobal(true);
      setSearchError("");
      setGlobalResults([]);
      // Clear any stale membership status when a new search is performed
      setMembershipStatus({});

      const results = await searchGlobal(queryVal);
      if (!results.length) {
        setSearchError("No results found");
      } else {
        setGlobalResults(results);
      }
    } catch {
      setSearchError("No results found");
    } finally {
      setSearchingGlobal(false);
    }
  };

  const handleStartChat = async (user: BackendUserProfile | null) => {
    if (!user) return;
    setSearch("");
    setGlobalResults([]);
    setMembershipStatus({});
    await onStartDirectMessage(user);
  };

  const handleJoinChannelResult = async (channel: ChannelSearchResult) => {
    try {
      setJoiningChannelId(channel.id);
      await joinChannelByPublicId(channel.public_id);
      // Successfully joined – navigate and clear everything
      setSearch("");
      setGlobalResults([]);
      setMembershipStatus({});
      onChannelJoined?.(channel.id);
      onRefresh?.();
    } catch (err: any) {
      if (err?.response?.status === 400) {
        // Already a member – store this fact and show a warning
        setMembershipStatus((prev) => ({ ...prev, [channel.id]: 'member' }));
        // Do NOT navigate automatically; let the user click "Open"
      } else {
        alert("Failed to join channel.");
      }
    } finally {
      setJoiningChannelId(null);
    }
  };

  // Handler for the "Open" button when already a member
  const handleOpenChannel = (channel: ChannelSearchResult) => {
    // Navigate to the channel
    onChannelJoined?.(channel.id);
    onRefresh?.();
    // Clear the overlay and status
    setSearch("");
    setGlobalResults([]);
    setMembershipStatus({});
  };

  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <div
          className="my-profile"
          onClick={goToEditProfile}
          style={{ cursor: "pointer" }}
        >
          <img
            src={avatarUrl}
            className="profile-avatar"
            alt="My Profile"
          />
          <span className="profile-name">{displayName}</span>
        </div>

        <div className="search-container">
          <input
            className="chat-search"
            placeholder="Search chats, @username or @public-id..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (searchError) setSearchError("");
              if (globalResults.length) setGlobalResults([]);
              // Clear membership status when the user types something new
              setMembershipStatus({});
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isGlobalSearchQuery) {
                handleGlobalSearch();
              }
            }}
          />
          {isGlobalSearchQuery && (
            <button
              type="button"
              className="global-search-btn"
              onClick={handleGlobalSearch}
              disabled={searchingGlobal}
            >
              {searchingGlobal ? "..." : "Find"}
            </button>
          )}
        </div>
      </div>

      <div className="chat-list">
        {(globalResults.length > 0 || searchError) && isGlobalSearchQuery && (
          <div className="global-search-overlay">
            <div className="overlay-header">
              <span>Global Search Result</span>
              <button
                type="button"
                className="close-overlay-btn"
                onClick={() => {
                  setGlobalResults([]);
                  setSearchError("");
                  setSearch("");
                  setMembershipStatus({});
                }}
              >
                ✕
              </button>
            </div>

            {searchError && (
              <div className="search-error-message">{searchError}</div>
            )}

            {globalResults.map((result) => {
              if (result.kind === "user") {
                const user = result.data;
                const searchedUsername = (user.username || "").trim().toLowerCase();
                const isSelf =
                  searchedUsername !== "" &&
                  loggedInUsername !== "" &&
                  searchedUsername === loggedInUsername;
                const isUserOnline = onlineUsers[String(user.id)] ?? user.is_online;

                return (
                  <div
                    className="search-profile-card"
                    key={`user-${user.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSearch("");
                      setGlobalResults([]);
                      setSearchError("");
                      setMembershipStatus({});
                      onOpenUserProfile(user);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();

                        setSearch("");
                        setGlobalResults([]);
                        setSearchError("");
                        setMembershipStatus({});
                        onOpenUserProfile(user);
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <img
                      src={user.avatar_url || "https://i.pravatar.cc/150?img=9"}
                      alt={user.username}
                      className="search-profile-avatar"
                    />

                    <div className="search-profile-details">
                      <div className="search-profile-name">{user.display_name}</div>

                      <div className="search-profile-username">
                        @{user.username}
                        <span
                          style={{
                            marginLeft: "8px",
                            color: isUserOnline ? "#4ade80" : "#9ca3af",
                            fontSize: "0.85em",
                          }}
                        >
                          {isUserOnline ? "• Online" : "• Offline"}
                        </span>
                      </div>

                      {user.bio && <div className="search-profile-bio">{user.bio}</div>}

                      {isSelf ? (
                        <span className="self-label">This is you</span>
                      ) : (
                        <button
                          type="button"
                          className="message-action-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleStartChat(user);
                          }}
                        >
                          Message
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // Channel result
              const channel = result.data;
              const isMember = membershipStatus[channel.id] === 'member';

              return (
                <div className="search-profile-card" key={`channel-${channel.id}`}>
                  <img
                    src={channel.avatar_url || "https://i.pravatar.cc/150?img=9"}
                    alt={channel.name}
                    className="search-profile-avatar"
                  />
                  <div className="search-profile-details">
                    <div className="search-profile-name">{channel.name}</div>
                    <div className="search-profile-username">@{channel.public_id}</div>
                    {channel.description && (
                      <div className="search-profile-bio">{channel.description}</div>
                    )}

                    {isMember ? (
                      <>
                        <div style={{ color: "#fbbf24", fontSize: "0.9em", marginTop: 4 }}>
                          ⚠️ You are already a member of this channel.
                        </div>
                        <button
                          type="button"
                          className="message-action-btn"
                          onClick={() => handleOpenChannel(channel)}
                          style={{ background: "#3b82f6", color: "#fff" }}
                        >
                          Open Channel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="message-action-btn"
                        onClick={() => handleJoinChannelResult(channel)}
                        disabled={joiningChannelId === channel.id}
                      >
                        {joiningChannelId === channel.id ? "Joining..." : "Join"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!searchError && globalResults.length === 0 && (
          filteredChats.length === 0 ? (
            <div className="empty-chat-list">No conversations found.</div>
          ) : (
            filteredChats.map((chat) => (
              <ChatItem
                key={chat.id}
                chat={chat}
                active={selectedChatId === chat.id}
                onClick={() => onSelectChat(chat)}
                isOnline={
                  chat.other_user_id
                    ? !!onlineUsers[String(chat.other_user_id)]
                    : undefined
                }
              />
            ))
          )
        )}
      </div>

      <div className="sidebar-bottom">
        <button
          type="button"
          className="create-group-sidebar-btn"
          onClick={goToCreateGroup}
        >
          + Create Group
        </button>
        <button
          type="button"
          className="create-group-sidebar-btn create-channel-sidebar-btn"
          onClick={goToCreateChannel}
          style={{ marginTop: "10px" }}
        >
          + Create Channel
        </button>
      </div>
    </div>
  );
}