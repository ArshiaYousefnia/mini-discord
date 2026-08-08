import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import Sidebar from "../components/Sidebar";
import ChatView from "../components/ChatView";

import { getConversations } from "../services/chatService";
import {
  mapConversationToChatListItem,
  sortChatsByRecent,
} from "../services/chatMapper";

import type {
  ChatListItem,
  Conversation,
} from "../types/chat";

import type {
  BackendUserProfile,
  UserProfile,
} from "../types/user";

import {
  realtimeService,
  type ConversationUpdatePayload,
  type UserUpdatePayload,
} from "../services/realtimeService";

import { useOnlineStatus } from "../hooks/useOnlineStatus";

import "../styles/home.css";


function getCurrentUsername(): string {
  const rawUser = localStorage.getItem("username");

  if (!rawUser) {
    return "";
  }

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


function isUnauthorizedError(error: unknown): boolean {
  const possibleError = error as {
    response?: {
      status?: number;
    };
  };

  return possibleError?.response?.status === 401;
}


export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    onlineUsers,
    setOnlineUsers,
  } = useOnlineStatus();

  const [chatItems, setChatItems] = useState<ChatListItem[]>([]);
  const [selectedChat, setSelectedChat] =
    useState<ChatListItem | null>(null);

  const [pendingDirectMessageUser, setPendingDirectMessageUser] =
    useState<BackendUserProfile | null>(null);

  const [profileUserToOpen, setProfileUserToOpen] =
    useState<BackendUserProfile | null>(null);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [currentUsername, setCurrentUsername] = useState("");

  const [isMobile, setIsMobile] = useState(
    window.innerWidth <= 768
  );

  const [userProfileUpdates, setUserProfileUpdates] = useState<
    Record<
      string,
      {
        display_name?: string;
        avatar_url?: string;
      }
    >
  >({});


  const selectedChatRef = useRef<ChatListItem | null>(null);
  
  // Track whether we have seeded the initial status map from REST.
  const hasSeededOnlineStatus = useRef(false);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);


  /*
   * Authentication, username, and responsive layout.
   */
  useEffect(() => {
    const token = localStorage.getItem("accessToken");

    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    setCurrentUsername(getCurrentUsername());

    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [navigate]);


  /*
   * Load conversations.
   */
  const loadChats = useCallback(
    async (
      isBackgroundRefresh = false,
      targetConversationId?: string
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

        const conversations: Conversation[] =
          await getConversations();

        /*
         * Seed online state from the API ONLY during the very first load.
         * This prevents background REST refreshes or updates from overwriting
         * the live WebSocket status dictionary.
         */
        if (!hasSeededOnlineStatus.current) {
          const initialStatuses: Record<string, boolean> = {};

          for (const conversation of conversations) {
            if (
              conversation.type === "DM" &&
              conversation.other_user_id &&
              typeof conversation.other_user_is_online === "boolean"
            ) {
              const userId = String(conversation.other_user_id);
              initialStatuses[userId] = conversation.other_user_is_online;
            }
          }

          setOnlineUsers((prev) => ({
            ...prev,
            ...initialStatuses,
          }));
          
          hasSeededOnlineStatus.current = true;
        }

        const mappedChats = await Promise.all(
          conversations.map((conversation) =>
            mapConversationToChatListItem(conversation)
          )
        );

        let sortedChats = sortChatsByRecent(mappedChats);

        const chatIdFromUrl = searchParams.get("chat");
        const idToSelect =
          targetConversationId || chatIdFromUrl;

        /*
         * Select a conversation requested by URL or after joining/
         * creating a conversation.
         */
        if (idToSelect) {
          const chatToSelect = sortedChats.find(
            (chat) => String(chat.id) === String(idToSelect)
          );

          if (chatToSelect) {
            const readChat: ChatListItem = {
              ...chatToSelect,
              unreadCount: 0,
            };

            if (!isBackgroundRefresh || targetConversationId) {
              setSelectedChat(readChat);
            }

            sortedChats = sortedChats.map((chat) =>
              chat.id === idToSelect ? readChat : chat
            );

            if (!targetConversationId && chatIdFromUrl) {
              const nextParams = new URLSearchParams(
                searchParams
              );

              nextParams.delete("chat");

              setSearchParams(nextParams, {
                replace: true,
              });
            }
          }
        }

        /*
         * Keep the selected conversation synchronized with the
         * newly loaded sidebar data.
         */
        const activeChat = selectedChatRef.current;

        if (activeChat) {
          const updatedActiveChat = sortedChats.find(
            (chat) => chat.id === activeChat.id
          );

          if (!updatedActiveChat) {
            setSelectedChat(null);

            if (
              searchParams.get("chat") === activeChat.id
            ) {
              const nextParams = new URLSearchParams(
                searchParams
              );

              nextParams.delete("chat");

              setSearchParams(nextParams, {
                replace: true,
              });
            }
          } else if (
            updatedActiveChat.name !== activeChat.name ||
            updatedActiveChat.avatar !== activeChat.avatar
          ) {
            setSelectedChat({
              ...updatedActiveChat,
              unreadCount: activeChat.unreadCount,
            });
          }
        }

        setChatItems(sortedChats);
      } catch (error) {
        if (isUnauthorizedError(error)) {
          navigate("/login", { replace: true });
          return;
        }

        if (!isBackgroundRefresh) {
          setPageError(
            "Failed to fetch conversations."
          );
        }
      } finally {
        if (!isBackgroundRefresh) {
          setLoading(false);
        }
      }
    },
    [
      navigate,
      searchParams,
      setSearchParams,
      setOnlineUsers,
    ]
  );


  /*
   * Initial conversation loading.
   */
  useEffect(() => {
    const token = localStorage.getItem("accessToken");

    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    void loadChats();
  }, [navigate, loadChats]);


  /*
   * Remove a conversation from the sidebar and close it if it
   * is currently selected.
   */
  const handleGroupExit = useCallback(
    (conversationId: string) => {
      setChatItems((previous) =>
        previous.filter(
          (chat) => chat.id !== conversationId
        )
      );

      setSelectedChat((previous) =>
        previous && previous.id === conversationId
          ? null
          : previous
      );
    },
    []
  );


  /*
   * Handle profile updates.
   * Updates display values without altering status variables.
   */
  const handleUserProfileUpdate = useCallback(
    (payload: UserUpdatePayload) => {
      console.log(
        "🏠 HomePage received user_updated:",
        payload
      );

      const updatedUserId = String(payload.user_id);

      setUserProfileUpdates((previous) => ({
        ...previous,
        [updatedUserId]: {
          display_name: payload.display_name,
          avatar_url: payload.avatar_url,
        },
      }));

      setChatItems((previousChats) =>
        previousChats.map((chat) => {
          const isMatchingDM =
            chat.type === "DM" &&
            chat.other_user_id &&
            String(chat.other_user_id) === updatedUserId;

          if (!isMatchingDM) {
            return chat;
          }

          return {
            ...chat,
            name: payload.display_name ?? chat.name,
            avatar: payload.avatar_url ?? chat.avatar,
          };
        })
      );

      setSelectedChat((previousChat) => {
        if (!previousChat) {
          return previousChat;
        }

        const isMatchingDM =
          previousChat.type === "DM" &&
          previousChat.other_user_id &&
          String(previousChat.other_user_id) === updatedUserId;

        if (!isMatchingDM) {
          return previousChat;
        }

        return {
          ...previousChat,
          name: payload.display_name ?? previousChat.name,
          avatar: payload.avatar_url ?? previousChat.avatar,
        };
      });

      setPendingDirectMessageUser((previousUser) => {
        if (
          !previousUser ||
          String(previousUser.id) !== updatedUserId
        ) {
          return previousUser;
        }

        return {
          ...previousUser,
          display_name:
            payload.display_name ??
            previousUser.display_name,
          avatar_url:
            payload.avatar_url ??
            previousUser.avatar_url,
        };
      });

      setProfileUserToOpen((previousUser) => {
        if (
          !previousUser ||
          String(previousUser.id) !== updatedUserId
        ) {
          return previousUser;
        }

        return {
          ...previousUser,
          display_name:
            payload.display_name ??
            previousUser.display_name,
          avatar_url:
            payload.avatar_url ??
            previousUser.avatar_url,
        };
      });
    },
    []
  );

  /*
   * Handle conversation-level updates.
   */
  const handleConversationUpdate = useCallback(
    (payload: ConversationUpdatePayload) => {
      const conversationId = String(
        payload.conversation_id
      );

      if (
        payload.event_type === "member_left" ||
        payload.event_type === "conversation_deleted"
      ) {
        handleGroupExit(conversationId);
        return;
      }

      if (
        payload.event_type === "channel_updated" ||
        payload.event_type === "group_updated"
      ) {
        setChatItems((previousChats) =>
          previousChats.map((chat) =>
            chat.id === conversationId
              ? {
                  ...chat,
                  name:
                    payload.name ?? chat.name,
                  avatar:
                    payload.avatar_url ?? chat.avatar,
                }
              : chat
          )
        );

        setSelectedChat((previousChat) =>
          previousChat &&
          previousChat.id === conversationId
            ? {
                ...previousChat,
                name:
                  payload.name ??
                  previousChat.name,
                avatar:
                  payload.avatar_url ??
                  previousChat.avatar,
              }
            : previousChat
        );

        return;
      }

      setChatItems((previousChats) => {
        const index = previousChats.findIndex(
          (chat) => String(chat.id) === conversationId
        );

        if (index === -1) {
          void loadChats(true);
          return previousChats;
        }

        const targetChat = previousChats[index];

        const isCurrentlyOpen =
          selectedChatRef.current?.id === conversationId;

        const updatedChat: ChatListItem = {
          ...targetChat,
          unreadCount:
            payload.event_type === "unread_updated"
              ? payload.unread_count ??
                targetChat.unreadCount
              : isCurrentlyOpen
              ? 0
              : targetChat.unreadCount + 1,
          lastMessage:
            payload.last_message?.content ??
            targetChat.lastMessage,
          lastMessageAt:
            payload.last_message?.created_at ??
            targetChat.lastMessageAt,
        };

        const chatsWithoutTarget = previousChats.filter(
          (_, chatIndex) => chatIndex !== index
        );

        return sortChatsByRecent([
          updatedChat,
          ...chatsWithoutTarget,
        ]);
      });
    },
    [handleGroupExit, loadChats]
  );


  /*
   * Subscribe to conversation updates.
   */
  useEffect(() => {
    const unsubscribe =
      realtimeService.subscribeToUpdates(handleConversationUpdate);

    return () => {
      unsubscribe();
    };
  }, [handleConversationUpdate]);

  /*
   * Subscribe to top-level user profile updates.
   */
  useEffect(() => {
    const unsubscribe =
      realtimeService.subscribeToUserUpdates(handleUserProfileUpdate);

    return () => {
      unsubscribe();
    };
  }, [handleUserProfileUpdate]);


  const handleSelectChat = useCallback(
    (chat: ChatListItem) => {
      const readChat: ChatListItem = {
        ...chat,
        unreadCount: 0,
      };

      setProfileUserToOpen(null);
      setPendingDirectMessageUser(null);
      setSelectedChat(readChat);

      setChatItems((previousChats) =>
        previousChats.map((item) =>
          item.id === chat.id
            ? {
                ...item,
                unreadCount: 0,
              }
            : item
        )
      );
    },
    []
  );


  const handleStartDirectMessage = useCallback(
    async (user: BackendUserProfile | UserProfile) => {
      const existingChat = chatItems.find(
        (chat) =>
          chat.type === "DM" &&
          String(chat.other_user_id) ===
            String(user.id)
      );

      setProfileUserToOpen(null);

      if (existingChat) {
        handleSelectChat(existingChat);
        return;
      }

      setSelectedChat(null);
      setPendingDirectMessageUser(
        user as BackendUserProfile
      );
    },
    [chatItems, handleSelectChat]
  );


  const handleOpenUserProfile = useCallback(
    (user: BackendUserProfile) => {
      setSelectedChat(null);
      setPendingDirectMessageUser(null);
      setProfileUserToOpen(user);
    },
    []
  );


  const handleDirectMessageCreated = useCallback(
    async (conversationId: string) => {
      setPendingDirectMessageUser(null);
      await loadChats(false, conversationId);
    },
    [loadChats]
  );


  const handleChannelJoined = useCallback(
    async (channelId: string) => {
      setSearchParams({ chat: channelId });
      await loadChats(false, channelId);
    },
    [loadChats, setSearchParams]
  );


  const handleBack = useCallback(() => {
    setSelectedChat(null);
    setPendingDirectMessageUser(null);
    setProfileUserToOpen(null);
  }, []);


  const isOtherUserOnline =
    selectedChat?.other_user_id
      ? Boolean(
          onlineUsers[
            String(selectedChat.other_user_id)
          ]
        )
      : undefined;


  return (
    <div className="home-page">
      {(!isMobile ||
        (!selectedChat &&
          !pendingDirectMessageUser &&
          !profileUserToOpen)) && (
        <Sidebar
          chats={chatItems}
          selectedChatId={selectedChat?.id ?? null}
          onSelectChat={handleSelectChat}
          currentUsername={currentUsername}
          onStartDirectMessage={handleStartDirectMessage}
          onOpenUserProfile={handleOpenUserProfile}
          onRefresh={() => void loadChats(true)}
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
            <div className="chat-placeholder">
              Loading...
            </div>
          ) : pageError ? (
            <div className="chat-placeholder">
              {pageError}
            </div>
          ) : (
          <ChatView
            chat={selectedChat}
            pendingDirectMessageUser={pendingDirectMessageUser}
            profileUserToOpen={profileUserToOpen}
            onProfileUserOpened={() => setProfileUserToOpen(null)}
            onStartDirectMessage={handleStartDirectMessage}
            onDirectMessageCreated={handleDirectMessageCreated}
            isMobile={isMobile}
            onBack={handleBack}
            onGroupExit={handleGroupExit}
            onGroupJoined={async (groupId) => {
              setSearchParams({ chat: groupId });
              await loadChats(false, groupId);
            }}
            isOtherUserOnline={isOtherUserOnline}
            onlineUsers={onlineUsers}
            userProfileUpdates={userProfileUpdates}
          />
          )}
        </div>
      )}
    </div>
  );
}
