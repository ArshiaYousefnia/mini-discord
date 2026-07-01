import type { Message, User } from '../types/chat';

// دیتای تستی کاربران برای شبیه‌سازی مخاطبین
export const mockUsers: User[] = [
  { id: '1', username: 'arashia', displayName: 'Arshia Yousefnia', avatarUrl: '' },
  { id: '2', username: 'nasim', displayName: 'Nasim Javdani', avatarUrl: '' },
  { id: '3', username: 'ali', displayName: 'Ali Alsheikh', avatarUrl: '' },
];

// کلید ذخیره‌سازی پیام‌ها در LocalStorage
const STORAGE_KEY = 'mini_discord_messages';

// تابع کمکی برای گرفتن پیام‌ها از استوریج
const getStoredMessages = (): Message[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

// تابع کمکی برای ذخیره پیام‌ها در استوریج
const saveMessages = (messages: Message[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
};

export const chatService = {
  // ۱. دریافت تمام پیام‌های چت بین دو کاربر خاص
  getMessagesBetweenUsers: async (currentUserId: string, targetUserId: string): Promise<Message[]> => {
    // شبیه‌سازی تاخیر شبکه برای طبیعی‌تر شدن لودینگ
    await new Promise((resolve) => setTimeout(resolve, 300));
    const allMessages = getStoredMessages();
    
    // فیلتر کردن پیام‌هایی که فرستنده و گیرنده آن‌ها این دو کاربر هستند
    return allMessages.filter(
      (msg) =>
        (msg.senderId === currentUserId && msg.receiverId === targetUserId) ||
        (msg.senderId === targetUserId && msg.receiverId === currentUserId)
    );
  },

  // ۲. ارسال پیام جدید (تسک #11 و #51)
  sendMessage: async (
    senderId: string,
    receiverId: string,
    text: string,
    replyToId?: string
  ): Promise<Message> => {
    // بررسی محدودیت‌های متنی (Acceptance Criteria)
    if (!text.trim()) {
      throw new Error('Message cannot be empty.');
    }
    if (text.length > 2000) {
      throw new Error('Message exceeds the 2000 character limit.');
    }

    const allMessages = getStoredMessages();
    let replyToMessageData = undefined;

    // اگر ریپلای روی پیام دیگری بود، اطلاعات آن را برای پیش‌نمایش استخراج می‌کنیم
    if (replyToId) {
      const originalMsg = allMessages.find((m) => m.id === replyToId);
      if (originalMsg) {
        // پیدا کردن نام فرستنده پیام اصلی
        const sender = mockUsers.find((u) => u.id === originalMsg.senderId);
        replyToMessageData = {
          id: originalMsg.id,
          senderName: sender ? sender.displayName : 'Unknown User',
          text: originalMsg.text,
        };
      }
    }

    // ساخت پیام جدید با وضعیت موقت sending
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      senderId,
      receiverId,
      text,
      createdAt: new Date().toISOString(),
      isEdited: false,
      status: 'sending', // ابتدا در وضعیت در حال ارسال قرار می‌گیرد
      replyToId,
      replyToMessage: replyToMessageData,
    };

    // اضافه کردن به لیست و ذخیره محلی
    allMessages.push(newMessage);
    saveMessages(allMessages);

    // شبیه‌سازی پاسخ بک‌اند بعد از ۱ ثانیه برای تغییر وضعیت به sent
    return new Promise((resolve) => {
      setTimeout(() => {
        const currentMessages = getStoredMessages();
        const msgIndex = currentMessages.findIndex((m) => m.id === newMessage.id);
        if (msgIndex !== -1) {
          currentMessages[msgIndex].status = 'sent';
          saveMessages(currentMessages);
          resolve(currentMessages[msgIndex]);
        } else {
          resolve({ ...newMessage, status: 'sent' });
        }
      }, 1000);
    });
  },

  // ۳. ویرایش پیام (تسک #27)
  editMessage: async (messageId: string, currentUserId: string, newText: string): Promise<Message> => {
    if (!newText.trim()) {
      throw new Error('Message cannot be empty.');
    }
    if (newText.length > 2000) {
      throw new Error('Message exceeds the 2000 character limit.');
    }

    const allMessages = getStoredMessages();
    const msgIndex = allMessages.findIndex((m) => m.id === messageId);

    if (msgIndex === -1) {
      throw new Error('Message not found.');
    }

    // بررسی مالکیت پیام (Security Check)
    if (allMessages[msgIndex].senderId !== currentUserId) {
      throw new Error('You can only edit your own messages.');
    }

    // به‌روزرسانی پیام
    allMessages[msgIndex].text = newText;
    allMessages[msgIndex].isEdited = true;
    allMessages[msgIndex].updatedAt = new Date().toISOString();

    saveMessages(allMessages);
    return allMessages[msgIndex];
  },

  // ۴. حذف پیام (تسک #28)
  deleteMessage: async (messageId: string, currentUserId: string): Promise<void> => {
    const allMessages = getStoredMessages();
    const msgIndex = allMessages.findIndex((m) => m.id === messageId);

    if (msgIndex === -1) {
      throw new Error('Message not found.');
    }

    // بررسی مالکیت پیام
    if (allMessages[msgIndex].senderId !== currentUserId) {
      throw new Error('You can only delete your own messages.');
    }

    // حذف پیام از آرایه
    const updatedMessages = allMessages.filter((m) => m.id !== messageId);
    saveMessages(updatedMessages);
  },
};
