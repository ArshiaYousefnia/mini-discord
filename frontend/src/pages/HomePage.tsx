import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import {
  realtimeService,
  type ConversationUpdatePayload,
} from "../services/realtimeService";

function getCurrentUsername(): string {
  const rawUser = localStorage.getItem("username");

  if (!rawUser) return "";

  try {
    const parsed = JSON.parse(rawUser);

    if (typeof parsed === "string") {
      return parsed;
    }

    return parsed?.username || "";
  } catch {
    return rawUser;
  }
}

export default function HomePage() {
  const navigate = useNavigate();

  const [chatItems, setChatItems] = useState<ChatListItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [currentUsername, setCurrentUsername] = useState("");

  const [searchParams, setSearchParams] = useSearchParams();

  const { onlineUsers, setOnlineUsers } = useOnlineStatus();

  const [pendingDirectMessageUser, setPendingDirectMessageUser] =
    useState<BackendUserProfile | null>(null);

  const [profileUserToOpen, setProfileUserToOpen] =
    useState<BackendUserProfile | null>(null);

  const selectedChatRef = useRef<ChatListItem | null>(null);
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");

    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    setCurrentUsername(getCurrentUsername());

    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, [navigate]);

  const loadChats = async (
    isBackgroundRefresh = false,
    targetGroupId?: string
  ) => {
    const token = localStorage.getItem("accessToken");

    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    try {
      if (!isBackgroundRefresh) {
        setLoading(true);
        setPageError("");
      }

      const conversations: Conversation[] = await getConversations();

      const initialStatuses: Record<string, boolean> = {};

      conversations.forEach((conversation) => {
        if (conversation.type === "DM" && conversation.other_user_id) {
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
          return mapConversationToChatListItem(conversation);
        })
      );

      let sorted = sortChatsByRecent(mappedChats);

      const chatIdFromUrl = searchParams.get("chat");
      const idToSelect = targetGroupId || chatIdFromUrl;

      if (idToSelect) {
        const chatToSelect = sorted.find((c) => c.id === idToSelect);

        if (chatToSelect) {
          const readChat: ChatListItem = {
            ...chatToSelect,
            unreadCount: 0,
          };

          if (!isBackgroundRefresh || targetGroupId) {
            setSelectedChat(readChat);
          }

          sorted = sorted.map((c) => (c.id === idToSelect ? readChat : c));

          if (!targetGroupId && chatIdFromUrl) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete("chat");
            setSearchParams(nextParams, { replace: true });
          }
        }
      }

      if (selectedChatRef.current) {
        const currentActiveChat = selectedChatRef.current;
        const updatedSelectedChat = sorted.find(
          (c) => c.id === currentActiveChat.id
        );

        if (!updatedSelectedChat) {
          setSelectedChat(null);

          if (searchParams.get("chat") === currentActiveChat.id) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete("chat");
            setSearchParams(nextParams, { replace: true });
          }
        } else if (
          updatedSelectedChat.name !== currentActiveChat.name ||
          updatedSelectedChat.avatar !== currentActiveChat.avatar
        ) {
          setSelectedChat({
            ...updatedSelectedChat,
            unreadCount: currentActiveChat.unreadCount,
          });
        }
      }

      setChatItems(sorted);
    } catch (err: any) {
      if (err.response?.status === 401) {
        navigate("/login", { replace: true });
        return;
      }

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
    const token = localStorage.getItem("accessToken");

    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    loadChats();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleGroupExit = useCallback((groupId: string) => {
    setChatItems((prev) => prev.filter((c) => c.id !== groupId));
    setSelectedChat((prev) => (prev && prev.id === groupId ? null : prev));
  }, []);

  const handleConversationUpdate = useCallback(
    (payload: ConversationUpdatePayload) => {
      const targetId = String(payload.conversation_id);

      if (
        payload.event_type === "member_left" ||
        payload.event_type === "conversation_deleted"
      ) {
        handleGroupExit(targetId);
        return;
      }

      if (payload.event_type === "channel_updated" || payload.event_type === "group_updated") {
        setChatItems((prev) =>
          prev.map((item) =>
            item.id === targetId
              ? {
                  ...item,
                  name: payload.name ?? item.name,
                  avatar: payload.avatar_url ?? item.avatar,
                }
              : item
          )
        );

        setSelectedChat((prev) =>
          prev && prev.id === targetId
            ? {
                ...prev,
                name: payload.name ?? prev.name,
                avatar: payload.avatar_url ?? prev.avatar,
              }
            : prev
        );
        return;
      }

      setChatItems((prevChats) => {
        const existingChatIndex = prevChats.findIndex(
          (c) => String(c.id) === targetId
        );

        if (existingChatIndex === -1) {
          void loadChats(true);
          return prevChats;
        }

        const isCurrentlyOpen =
          selectedChatRef.current &&
          String(selectedChatRef.current.id) === targetId;

        const targetChat = prevChats[existingChatIndex];

        const updatedChat: ChatListItem = {
          ...targetChat,
          unreadCount:
            payload.event_type === "unread_updated"
              ? payload.unread_count ?? targetChat.unreadCount
              : isCurrentlyOpen
              ? 0
              : (targetChat.unreadCount ?? 0) + 1,
          lastMessage: payload.last_message?.content || targetChat.lastMessage,
          lastMessageAt:
            payload.last_message?.created_at || targetChat.lastMessageAt,
        };

        const listWithoutTarget = prevChats.filter(
          (_, idx) => idx !== existingChatIndex
        );

        return sortChatsByRecent([updatedChat, ...listWithoutTarget]);
      });
    },
    [handleGroupExit]
  );

  useEffect(() => {
    const unsubscribeUpdates = realtimeService.subscribeToUpdates(
      handleConversationUpdate
    );

    return () => {
      unsubscribeUpdates();
    };
  }, [handleConversationUpdate]);

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

  const handleChannelJoined = async (channelId: string) => {
    setSearchParams({ chat: channelId });
    await loadChats(false, channelId);
  };

  const isOtherUserOnline =
    selectedChat?.other_user_id
      ? !!onlineUsers[String(selectedChat.other_user_id)]
      : undefined;

  return (
    <div className="home-page">
      {(!isMobile ||
        (!selectedChat && !pendingDirectMessageUser && !profileUserToOpen)) && (
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

      {(!isMobile ||
        selectedChat ||
        pendingDirectMessageUser ||
        profileUserToOpen) && (
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