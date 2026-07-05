import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import ChatView from "../components/ChatView";
import {
  createDirectMessage,
  getConversationMessages,
  getConversations,
} from "../services/chatService";
import {
  mapConversationToChatListItem,
  sortChatsByRecent, // Updated to use the correct function name from your chatMappers
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

  useEffect(() => {
    setCurrentUsername(getCurrentUsername());
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const loadChats = async () => {
    try {
      setLoading(true);
      const conversations: Conversation[] = await getConversations();

      const mappedChats = await Promise.all(
        conversations.map(async (conversation) => {
          try {
            const messages = await getConversationMessages(conversation.id);
            return mapConversationToChatListItem(conversation, messages);
          } catch {
            return mapConversationToChatListItem(conversation, []);
          }
        })
      );

      const sorted = sortChatsByRecent(mappedChats);
      setChatItems(sorted);

      if (sorted.length > 0 && !selectedChat) {
        setSelectedChat(sorted[0]);
      }
    } catch (err) {
      setPageError("Failed to fetch conversations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChats();
  }, []);

  const handleStartDirectMessage = async (user: BackendUserProfile) => {
    try {
      // Send a system welcome message to initiate the DM conversation flow
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
          onSelectChat={setSelectedChat}
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
