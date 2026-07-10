import { useMemo, useState, useEffect } from "react";
import ChatItem from "./ChatItem";
import type { ChatListItem } from "../types/chat";
import type { BackendUserProfile } from "../types/user";
import { searchUserByUsername } from "../services/userService";
import { useNavigate } from "react-router-dom";

type Props = {
  chats: ChatListItem[];
  selectedChatId: string | null;
  onSelectChat: (chat: ChatListItem) => void;
  currentUsername: string;
  onStartDirectMessage: (user: BackendUserProfile) => Promise<void>;
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
}: Props) {
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState<string>("My Profile");
  const [avatarUrl, setAvatarUrl] = useState<string>(
    "https://i.pravatar.cc/150?img=12"
  );

  const [search, setSearch] = useState("");
  const [searchingGlobal, setSearchingGlobal] = useState(false);
  const [globalUser, setGlobalUser] = useState<BackendUserProfile | null>(null);
  const [searchError, setSearchError] = useState("");

  const [loggedInUsername, setLoggedInUsername] = useState("");

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
      setGlobalUser(null);

      const user = await searchUserByUsername(queryVal);

      if (!user) {
        setSearchError("User not found");
      } else {
        setGlobalUser(user);
      }
    } catch {
      setSearchError("User not found");
    } finally {
      setSearchingGlobal(false);
    }
  };

  const handleStartChat = async (user: BackendUserProfile | null) => {
    if (!user) return;

    setSearch("");
    setGlobalUser(null);

    await onStartDirectMessage(user);
  };

  const searchedUsername = (globalUser?.username || "").trim().toLowerCase();
  const isSelf =
    searchedUsername !== "" &&
    loggedInUsername !== "" &&
    searchedUsername === loggedInUsername;

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
            placeholder="Search chats or @username..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (searchError) setSearchError("");
              if (globalUser) setGlobalUser(null);
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
        {(globalUser || searchError) && isGlobalSearchQuery && (
          <div className="global-search-overlay">
            <div className="overlay-header">
              <span>Global Search Result</span>
              <button
                type="button"
                className="close-overlay-btn"
                onClick={() => {
                  setGlobalUser(null);
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

            {globalUser && (
              <div className="search-profile-card">
                <img
                  src={globalUser.avatar_url || "https://i.pravatar.cc/150?img=9"}
                  alt={globalUser.username}
                  className="search-profile-avatar"
                />
                <div className="search-profile-details">
                  <div className="search-profile-name">
                    {globalUser.display_name}
                  </div>
                  <div className="search-profile-username">
                    @{globalUser.username}
                  </div>

                  {globalUser.bio && (
                    <div className="search-profile-bio">{globalUser.bio}</div>
                  )}

                  {isSelf ? (
                    <span className="self-label">This is you</span>
                  ) : (
                    <button
                      type="button"
                      className="message-action-btn"
                      onClick={() => handleStartChat(globalUser)}
                    >
                      Message
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!searchError && !globalUser && (
          filteredChats.length === 0 ? (
            <div className="empty-chat-list">No conversations found.</div>
          ) : (
            filteredChats.map((chat) => (
              <ChatItem
                key={chat.id}
                chat={chat}
                active={selectedChatId === chat.id}
                onClick={() => onSelectChat(chat)}
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
      </div>
    </div>
  );
}
