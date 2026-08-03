import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import ChatView from "../components/ChatView";
import { getConversations } from "../services/chatService";
import {
  mapConversationToChatListItem,
  sortChatsByRecent,
} from "../services/chatMapper";
import type { ChatListItem, Conversation } from "../types/chat";
import type { BackendUserProfile, UserProfile } from "../types/user";
import "../styles/home.css";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

// Retrieve current logged in user config
function getCurrentUsername(): string {
  try {
    const rawUser = localStorage.getItem("username");
    if (!rawUser) return "";
    const parsed = JSON.parse(rawUser);
    return parsed?.username || "";
  } catch {
    return "";
  }
}

export default function HomePage() {
  const [chatItems, setChatItems] = useState<ChatListItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [currentUsername, setCurrentUsername] = useState("");

  const [searchParams, setSearchParams] = useSearchParams();



  // Hook now tracks live websocket updates only.
  // Initial DM presence is hydrated from REST conversation data below.
  const { onlineUsers, setOnlineUsers } = useOnlineStatus();
  const [pendingDirectMessageUser, setPendingDirectMessageUser] =
  useState<BackendUserProfile | null>(null);

  const [profileUserToOpen, setProfileUserToOpen] =
  useState<BackendUserProfile | null>(null);


  useEffect(() => {
    setCurrentUsername(getCurrentUsername());
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const loadChats = async (isBackgroundRefresh = false, targetGroupId?: string) => {
    try {
      if (!isBackgroundRefresh) {
        setLoading(true);
        setPageError("");
      }

      const conversations: Conversation[] = await getConversations();

      // Hydrate initial online state for DM sidebar entries from REST.
      // WebSocket events will overwrite these values as users go online/offline.
      const initialStatuses: Record<string, boolean> = {};
      conversations.forEach((conversation) => {
        if (
          conversation.type === "DM" &&
          conversation.other_user_id
        ) {
          initialStatuses[String(conversation.other_user_id)] = Boolean(
            conversation.other_user_is_online
          );
        }
      });

      setOnlineUsers((prev) => ({
        ...prev,
        ...initialStatuses,
      }));

      const mappedChats = await Promise.all(
        conversations.map(async (conversation) => {
          try {
            return mapConversationToChatListItem(conversation);
          } catch {
            return mapConversationToChatListItem(conversation);
          }
        })
      );

      let sorted = sortChatsByRecent(mappedChats);

      const chatIdFromUrl = searchParams.get("chat");
      const idToSelect = targetGroupId || chatIdFromUrl;

      if (idToSelect) {
        const chatToSelect = sorted.find((c) => c.id === idToSelect);

        if (chatToSelect) {
          const readChat: ChatListItem = { ...chatToSelect, unreadCount: 0 };

          if (!isBackgroundRefresh || targetGroupId) {
            setSelectedChat(readChat);
          }

          sorted = sorted.map((c) =>
            c.id === idToSelect ? readChat : c
          );

          if (!targetGroupId && chatIdFromUrl) {
            searchParams.delete("chat");
            setSearchParams(searchParams, { replace: true });
          }
        }
      }

      if (selectedChat) {
        const updatedSelectedChat = sorted.find((c) => c.id === selectedChat.id);

        if (!updatedSelectedChat) {
          setSelectedChat(null);

          if (searchParams.get("chat") === selectedChat.id) {
            searchParams.delete("chat");
            setSearchParams(searchParams, { replace: true });
          }
        } else if (
          updatedSelectedChat.name !== selectedChat.name ||
          updatedSelectedChat.avatar !== selectedChat.avatar
        ) {
          setSelectedChat({
            ...updatedSelectedChat,
            unreadCount: selectedChat.unreadCount,
          });
        }
      }

      setChatItems(sorted);
    } catch (err) {
      if (!isBackgroundRefresh) {
        setPageError("Failed to fetch conversations.");
      }
    } finally {
      if (!isBackgroundRefresh) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectChat = (chat: ChatListItem) => {
    const readChat: ChatListItem = {
      ...chat,
      unreadCount: 0,
    };

    setProfileUserToOpen(null);
    setPendingDirectMessageUser(null);
    setSelectedChat(readChat);

    setChatItems((prevChats) =>
      prevChats.map((item) =>
        item.id === chat.id
          ? {
              ...item,
              unreadCount: 0,
            }
          : item
      )
    );
  };


  const handleStartDirectMessage = async (
    user: BackendUserProfile | UserProfile
  ) => {
    const existingChat = chatItems.find(
      (chat) =>
        chat.type === "DM" &&
        String(chat.other_user_id) === String(user.id)
    );

    setProfileUserToOpen(null);

    if (existingChat) {
      handleSelectChat(existingChat);
      return;
    }

    setSelectedChat(null);
    setPendingDirectMessageUser(user as BackendUserProfile);
  };

  const handleOpenUserProfile = (user: BackendUserProfile) => {
    setSelectedChat(null);
    setPendingDirectMessageUser(null);
    setProfileUserToOpen(user);
  };

  const handleDirectMessageCreated = async (conversationId: string) => {
    setPendingDirectMessageUser(null);
    await loadChats(false, conversationId);
  };


  const handleGroupExit = (groupId: string) => {
    setChatItems((prev) => prev.filter((c) => c.id !== groupId));
    setSelectedChat((prev) => (prev && prev.id === groupId ? null : prev));
  };

  // Task #55 — after joining a channel found via public-ID search, select
  // it the same way we already do for group invite joins: set `?chat=` and
  // reload the conversation list so the new channel appears in the sidebar.
  const handleChannelJoined = async (channelId: string) => {
    setSearchParams({ chat: channelId });
    await loadChats(false, channelId);
  };

  // Determine if the currently selected chat's other user is online.
  // We use String() representation here to match our normalized websocket state.
  const isOtherUserOnline =
    selectedChat?.other_user_id
      ? !!onlineUsers[String(selectedChat.other_user_id)]
      : undefined;

  return (
  <div className="home-page">
    {(!isMobile || (!selectedChat && !pendingDirectMessageUser && !profileUserToOpen)) && (
      <Sidebar
        chats={chatItems}
        selectedChatId={selectedChat?.id ?? null}
        onSelectChat={handleSelectChat}
        currentUsername={currentUsername}
        onStartDirectMessage={handleStartDirectMessage}
        onOpenUserProfile={handleOpenUserProfile}
        onRefresh={() => loadChats(true)}
        onlineUsers={onlineUsers ?? {}}
        onChannelJoined={handleChannelJoined}
      />
    )}

    {(!isMobile || selectedChat || pendingDirectMessageUser || profileUserToOpen) && (
      <div className="chat-area">
        {loading ? (
          <div className="chat-placeholder">Loading...</div>
        ) : pageError ? (
          <div className="chat-placeholder">{pageError}</div>
        ) : (
          <ChatView
            chat={selectedChat}
            pendingDirectMessageUser={pendingDirectMessageUser}
            profileUserToOpen={profileUserToOpen}
            onProfileUserOpened={() => setProfileUserToOpen(null)}
            onStartDirectMessage={handleStartDirectMessage}
            onDirectMessageCreated={handleDirectMessageCreated}
            isMobile={isMobile}
            onBack={() => {
              setSelectedChat(null);
              setPendingDirectMessageUser(null);
              setProfileUserToOpen(null);
            }}
            onGroupExit={handleGroupExit}
            onGroupJoined={async (groupId) => {
              setSearchParams({ chat: groupId });
              await loadChats(false, groupId);
            }}
            isOtherUserOnline={isOtherUserOnline}
            onlineUsers={onlineUsers}
          />
        )}
      </div>
    )}
  </div>
  );
}