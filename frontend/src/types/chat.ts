export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: string; // ایزو استرینگ یا زمان فرستاده شده از بک‌اَند
  updatedAt?: string;
  isEdited: boolean;
  status: 'sending' | 'sent' | 'error'; // برای نمایش وضعیت ارسال (ساعت یا تیک)
  
  // فیلدهای مربوط به ریپلای (تسک #51)
  replyToId?: string; 
  replyToMessage?: {
    id: string;
    senderName: string;
    text: string;
  };
}

export interface Conversation {
  id: string;
  participant: User;
  messages: Message[];
}
