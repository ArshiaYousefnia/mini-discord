import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom"; // <-- 1. Import useSearchParams
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
  
  // <-- 2. Initialize search params
  const [searchParams, setSearchParams] = useSearchParams(); 

  useEffect(() => {
    setCurrentUsername(getCurrentUsername());
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const loadChats = async () => {
    try {
      setLoading(true);
      setPageError("");

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

      // <-- 3. Check URL for a specific chat to auto-select
      const chatIdFromUrl = searchParams.get("chat");
      
      if (chatIdFromUrl) {
        const chatToSelect = sorted.find((c) => c.id === chatIdFromUrl);
        
        if (chatToSelect) {
          const readChat: ChatListItem = { ...chatToSelect, unreadCount: 0 };
          setSelectedChat(readChat);
          
          // Apply read status to the list item too
          sorted = sorted.map((c) =>
            c.id === chatIdFromUrl ? readChat : c
          );

          // Clean up the URL parameter quietly so refreshing doesn't force re-selection
          searchParams.delete("chat");
          setSearchParams(searchParams, { replace: true });
        }
      }

      setChatItems(sorted);
    } catch (err) {
      setPageError("Failed to fetch conversations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChats();
  }, []); // Note: leaving dependency array empty so it runs once on mount

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

  return (
    <div className="home-page">
      {(!isMobile || !selectedChat) && (
        <Sidebar
          chats={chatItems}
          selectedChatId={selectedChat?.id ?? null}
          onSelectChat={handleSelectChat}
          currentUsername={currentUsername}
          onStartDirectMessage={handleStartDirectMessage}
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
            />
          )}
        </div>
      )}
    </div>
  );
}
