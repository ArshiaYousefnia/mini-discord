import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { chatService, mockUsers } from '../services/chatService';
import type { Message, User } from '../types/chat';
import MessageBubble from '../components/MessageBubble';
import MessageInput from '../components/MessageInput';
import '../styles/chat.css';

export default function ChatPage() {
  const { userId: targetUserId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  // در سناریوی واقعی، این شناسه از سشن کاربر لاگین‌شده خوانده می‌شود.
  // در اینجا فرض می‌کنیم کاربر جاری Arashia با شناسه '1' است.
  const currentUserId = '1'; 

  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeReplyTo, setActiveReplyTo] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // اسکرول خودکار به انتهای لیست پیام‌ها
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // دریافت اطلاعات کاربر مخاطب و لیست پیام‌ها
  useEffect(() => {
    if (!targetUserId) {
      setError('Invalid user ID.');
      setLoading(false);
      return;
    }

    const user = mockUsers.find((u) => u.id === targetUserId);
    if (!user) {
      setError('User not found.');
      setLoading(false);
      return;
    }
    setTargetUser(user);

    const loadMessages = async () => {
      try {
        setLoading(true);
        const data = await chatService.getMessagesBetweenUsers(currentUserId, targetUserId);
        setMessages(data);
      } catch (err: any) {
        setError('Failed to load messages.');
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [targetUserId]);

  // اسکرول به پایین به محض لود شدن پیام‌ها
  useEffect(() => {
    if (!loading) {
      scrollToBottom();
    }
  }, [messages, loading]);

  // هندلر ارسال پیام جدید
  const handleSendMessage = async (text: string) => {
    if (!targetUserId) return;

    // ۱. ارسال پیام و گرفتن پیام موقت در حالت sending
    const tempMessage = await chatService.sendMessage(
      currentUserId,
      targetUserId,
      text,
      activeReplyTo?.id
    );

    // اضافه کردن پیام موقت به استیت برای بازخورد سریع به کاربر
    setMessages((prev) => [...prev, tempMessage]);
    setActiveReplyTo(null); // ریپلای فعال را ریست می‌کنیم

    // ۲. شبیه‌سازی دریافت تاییدیه نهایی از سرور و به‌روزرسانی وضعیت پیام به sent
    setTimeout(async () => {
      const updatedList = await chatService.getMessagesBetweenUsers(currentUserId, targetUserId);
      setMessages(updatedList);
    }, 1100);
  };

  // هندلر ویرایش پیام
  const handleEditMessage = async (messageId: string, newText: string) => {
    const updatedMessage = await chatService.editMessage(messageId, currentUserId, newText);
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? updatedMessage : msg))
    );
  };

  // هندلر حذف پیام
  const handleDeleteMessage = async (messageId: string) => {
    await chatService.deleteMessage(messageId, currentUserId);
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  };

  if (loading) return <div className="chat-loading">Loading chat...</div>;
  if (error || !targetUser) return <div className="chat-error">{error || 'User not found.'}</div>;

  return (
    <div className="chat-container">
      {/* سربرگ چت */}
      <header className="chat-header">
        <button className="chat-header-back-btn" onClick={() => navigate(-1)}>
          ←
        </button>
        <img
          src={targetUser.avatarUrl || 'https://via.placeholder.com/40'}
          alt={targetUser.displayName}
          className="chat-header-avatar"
        />
        <div className="chat-header-info">
          <span className="chat-header-name">{targetUser.displayName}</span>
          <span className="chat-header-status">@{targetUser.username}</span>
        </div>
      </header>

      {/* لیست پیام‌ها */}
      <div className="chat-messages-list">
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#667781', marginTop: '20px', fontSize: '13px' }}>
            No messages yet. Send a message to start the conversation!
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              currentUserId={currentUserId}
              onReply={setActiveReplyTo}
              onEdit={handleEditMessage}
              onDelete={handleDeleteMessage}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* فیلد ورودی پیام */}
      <MessageInput
        activeReplyTo={activeReplyTo}
        onCancelReply={() => setActiveReplyTo(null)}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}
