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
  // Task #55 — called after successfully joining a channel via public-ID
  // search, so the parent can select it / refresh the chat list.
  onChannelJoined?: (channelId: string) => void;
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

  const [loggedInUsername, setLoggedInUsername] = useState("");

  // --- FIXED POLLING LOGIC ---
  const onRefreshRef = useRef(onRefresh);

  // 1. Keep the ref updated with the latest function reference on every render
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  // 2. Set the interval only ONCE on mount. It will call the current function inside the ref.
  useEffect(() => {
    const interval = setInterval(() => {
      if (onRefreshRef.current) {
        onRefreshRef.current();
      }
    }, 5000); 
    
    return () => clearInterval(interval);
  }, []); 
  // ---------------------------

  useEffect(() => {
    const savedName = localStorage.getItem("display_name");
    const savedAvatar = localStorage.getItem("avatar_url");

    if (savedName) setDisplayName(savedName);
    if (savedAvatar) setAvatarUrl(savedAvatar);

    const fromStorage = getLoggedInUsername();
    const fromProp = (currentUsername || "").trim().toLowerCase();

    setLoggedInUsername(fromStorage || fromProp);
  }, [currentUsername]);

  const goToEditProfile = () => {
    navigate("/profile/");
  };

  const goToCreateGroup = () => {
    navigate("/groups/create");
  };

  const goToCreateChannel = () => {
    navigate("/channels/create");
  };

  const isGlobalSearchQuery = search.trim().startsWith("@");

  const filteredChats = useMemo(() => {
    if (isGlobalSearchQuery) return chats;
    return chats.filter((chat) =>
      chat.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [chats, search, isGlobalSearchQuery]);

  // Task #55 — the "@..." global search bar now searches both usernames
  // and channel public IDs against the same `api/users/search/` endpoint,
  // rendering a user card or a channel card depending on the result shape.
  const handleGlobalSearch = async () => {
    const queryVal = search.trim().replace(/^@/, "");
    if (!queryVal) return;

    try {
      setSearchingGlobal(true);
      setSearchError("");
      setGlobalResults([]);

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

    await onStartDirectMessage(user);
  };

  const handleJoinChannelResult = async (channel: ChannelSearchResult) => {
    try {
      setJoiningChannelId(channel.id);
      await joinChannelByPublicId(channel.public_id);
      setSearch("");
      setGlobalResults([]);
      onChannelJoined?.(channel.id);
      onRefresh?.();
    } catch (err: any) {
      if (err?.response?.status === 400) {
        // Already a member — just open it.
        setSearch("");
        setGlobalResults([]);
        onChannelJoined?.(channel.id);
      } else {
        alert("Failed to join channel.");
      }
    } finally {
      setJoiningChannelId(null);
    }
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
                  <div className="search-profile-card" key={`user-${user.id}`}>
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
                          onClick={() => handleStartChat(user)}
                        >
                          Message
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // Task #55 — channel result: avatar, name, "Join" action.
              const channel = result.data;
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

                    <button
                      type="button"
                      className="message-action-btn"
                      onClick={() => handleJoinChannelResult(channel)}
                      disabled={joiningChannelId === channel.id}
                    >
                      {joiningChannelId === channel.id ? "Joining..." : "Join"}
                    </button>
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
