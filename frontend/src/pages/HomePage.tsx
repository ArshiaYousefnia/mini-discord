import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import ChatView from "../components/ChatView";
import {
  createDirectMessage,
  getConversations,
} from "../services/chatService";
import {
  mapConversationToChatListItem,
  sortChatsByRecent,
} from "../services/chatMapper";
import type { ChatListItem, Conversation } from "../types/chat";
import type { BackendUserProfile } from "../types/user";
import "../styles/home.css";

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

  useEffect(() => {
    setCurrentUsername(getCurrentUsername());
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // NEW: Added isBackgroundRefresh parameter to prevent UI flickering on polls
  const loadChats = async (isBackgroundRefresh = false, targetGroupId?: string) => {
    try {
      if (!isBackgroundRefresh) {
        setLoading(true);
        setPageError("");
      }

      const conversations: Conversation[] = await getConversations();

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

      // Prioritize the directly passed targetGroupId, fallback to URL parameter
      const chatIdFromUrl = searchParams.get("chat");
      const idToSelect = targetGroupId || chatIdFromUrl;
      
      if (idToSelect) {
        const chatToSelect = sorted.find((c) => c.id === idToSelect);
        
        if (chatToSelect) {
          const readChat: ChatListItem = { ...chatToSelect, unreadCount: 0 };
          
          // Auto-select if it's the initial load OR if an explicit targetGroupId was provided
          if (!isBackgroundRefresh || targetGroupId) {
            setSelectedChat(readChat);
          }
          
          sorted = sorted.map((c) =>
            c.id === idToSelect ? readChat : c
          );

          // Only delete the URL parameter if we actually used it
          if (!targetGroupId && chatIdFromUrl) {
            searchParams.delete("chat");
            setSearchParams(searchParams, { replace: true });
          }
        }
      }

      // If a chat is already selected, make sure we update it with new backend data (like a new avatar/name)
      if (selectedChat) {
        const updatedSelectedChat = sorted.find(c => c.id === selectedChat.id);
        if (updatedSelectedChat && 
            (updatedSelectedChat.name !== selectedChat.name || updatedSelectedChat.avatar !== selectedChat.avatar)) {
          setSelectedChat({ ...updatedSelectedChat, unreadCount: selectedChat.unreadCount });
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
    loadChats(); // Initial load
  }, []); 

  const handleSelectChat = (chat: ChatListItem) => {
    const readChat: ChatListItem = {
      ...chat,
      unreadCount: 0,
    };

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

  const handleStartDirectMessage = async (user: BackendUserProfile) => {
    try {
      await createDirectMessage(user.id, "Hello!");
      await loadChats();
    } catch (err) {
      alert("Failed to initialize conversation.");
    }
  };

  // Tasks #15 / #35: called by ChatView after the user leaves or deletes
  // a group, so it disappears from the chat list immediately for them.
  const handleGroupExit = (groupId: string) => {
    setChatItems((prev) => prev.filter((c) => c.id !== groupId));
    setSelectedChat((prev) => (prev && prev.id === groupId ? null : prev));
  };

  return (
    <div className="home-page">
      {(!isMobile || !selectedChat) && (
        <Sidebar
          chats={chatItems}
          selectedChatId={selectedChat?.id ?? null}
          onSelectChat={handleSelectChat}
          currentUsername={currentUsername}
          onStartDirectMessage={handleStartDirectMessage}
          // NEW: Pass the loadChats function, specifically tagging it as a background refresh
          onRefresh={() => loadChats(true)} 
        />
      )}

      {(!isMobile || selectedChat) && (
        <div className="chat-area">
          {loading ? (
            <div className="chat-placeholder">Loading...</div>
          ) : pageError ? (
            <div className="chat-placeholder">{pageError}</div>
          ) : (
            <ChatView
              chat={selectedChat}
              isMobile={isMobile}
              onBack={() => setSelectedChat(null)}
              onGroupExit={handleGroupExit}
              onGroupJoined={async (groupId) => {
              // 1. Set the URL param so loadChats knows which chat to auto-select
              setSearchParams({ chat: groupId });
              // 2. Fetch the updated list of conversations (including the newly joined one)
              await loadChats(false, groupId);
            }}
            />
          )}
        </div>
      )}
    </div>
  );
}