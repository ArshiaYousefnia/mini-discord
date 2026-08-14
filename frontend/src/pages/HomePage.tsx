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


function isSameId(left: unknown, right: unknown): boolean {
  return String(left) === String(right);
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

  /*
   * Track whether we have seeded the initial status map from REST.
   */
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
            (chat) => isSameId(chat.id, idToSelect)
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
              isSameId(chat.id, idToSelect) ? readChat : chat
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
            (chat) => isSameId(chat.id, activeChat.id)
          );

          if (!updatedActiveChat) {
            setSelectedChat(null);

            if (
              isSameId(searchParams.get("chat"), activeChat.id)
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
          (chat) => !isSameId(chat.id, conversationId)
        )
      );

      setSelectedChat((previous) =>
        previous && isSameId(previous.id, conversationId)
          ? null
          : previous
      );

      if (isSameId(searchParams.get("chat"), conversationId)) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("chat");

        setSearchParams(nextParams, {
          replace: true,
        });
      }
    },
    [searchParams, setSearchParams]
  );


  /*
   * Apply group/channel metadata changes to sidebar and selected chat.
   */
  const applyConversationMetadataUpdate = useCallback(
    (payload: ConversationUpdatePayload) => {
      const conversationId = String(payload.conversation_id);

      setChatItems((previousChats) =>
        previousChats.map((chat) =>
          isSameId(chat.id, conversationId)
            ? {
                ...chat,
                name: payload.name ?? chat.name,
                avatar: payload.avatar_url ?? chat.avatar,
              }
            : chat
        )
      );

      setSelectedChat((previousChat) =>
        previousChat && isSameId(previousChat.id, conversationId)
          ? {
              ...previousChat,
              name: payload.name ?? previousChat.name,
              avatar:
                payload.avatar_url ?? previousChat.avatar,
            }
          : previousChat
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
            isSameId(chat.other_user_id, updatedUserId);

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
          isSameId(previousChat.other_user_id, updatedUserId);

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
          !isSameId(previousUser.id, updatedUserId)
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
          !isSameId(previousUser.id, updatedUserId)
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

      /*
       * The removed user gets member_removed directly.
       * Everyone gets conversation_deleted.
       */
      if (
        payload.event_type === "member_removed" ||
        payload.event_type === "conversation_deleted"
      ) {
        handleGroupExit(conversationId);
        return;
      }

      /*
       * Group/channel metadata updates.
       *
       * group_updated/channel_updated usually come from the user socket.
       * conversation_metadata_updated usually comes from the active
       * conversation socket, depending on your realtimeService routing.
       */
      if (
        payload.event_type === "channel_updated" ||
        payload.event_type === "group_updated" ||
        payload.event_type === "conversation_metadata_updated"
      ) {
        applyConversationMetadataUpdate(payload);
        return;
      }

      /*
       * Member/role changes do not necessarily change the sidebar visually,
       * but refreshing in the background keeps member counts / previews /
       * permissions-related mapped values fresh if your API returns them.
       *
       * ChatView should still refresh its own groupMembers/channelMembers
       * state when these events arrive.
       */
      if (
        payload.event_type === "member_joined" ||
        payload.event_type === "member_left" ||
        payload.event_type === "role_updated" ||
        payload.event_type === "permissions_updated"
      ) {
        void loadChats(true);
        return;
      }

      //Handle Topic Events (New Logic)
      // We want the sidebar to reflect that a topic was added/changed 
      // just like a message would.
      if (
        payload.event_type === "topic_created" ||
        payload.event_type === "topic_updated" ||
        payload.event_type === "topic_deleted"
      ) {
        // Option A: Simple background refresh of the chat list
        void loadChats(true);
        return;
      }

        setChatItems((previousChats) => {
        const index = previousChats.findIndex(
          (chat) => isSameId(chat.id, conversationId)
        );

        if (index === -1) {
          void loadChats(true);
          return previousChats;
        }

        const targetChat = previousChats[index];
        const isEmptied = payload.last_message === null;

        // Check if the chat is currently open
        const isCurrentlySelected =
          selectedChatRef.current &&
          isSameId(selectedChatRef.current.id, conversationId);

        const updatedChat: ChatListItem = {
          ...targetChat,
          // Update unread count from payload, or force to 0 if it's currently open
          unreadCount: isCurrentlySelected
            ? 0
            : (payload.unread_count ?? targetChat.unreadCount),
          lastMessage: isEmptied
            ? "No messages yet"
            : (payload.last_message?.content ?? targetChat.lastMessage),
          lastMessageAt: isEmptied
            ? ""
            : (payload.last_message?.created_at ?? targetChat.lastMessageAt),
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
    [
      applyConversationMetadataUpdate,
      handleGroupExit,
      loadChats,
    ]
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
          isSameId(item.id, chat.id)
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
          isSameId(chat.other_user_id, user.id)
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
