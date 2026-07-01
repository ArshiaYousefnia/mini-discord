import React, { useState, useRef, useEffect } from 'react';
import type { Message } from '../types/chat';
import '../styles/chat.css';

type Props = {
  activeReplyTo: Message | null;
  onCancelReply: () => void;
  onSendMessage: (text: string) => Promise<void>;
};

export default function MessageInput({ activeReplyTo, onCancelReply, onSendMessage }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // تغییر ارتفاع خودکار فیلد ورودی بر اساس متن تایپ شده
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || loading) return;

    setLoading(true);
    try {
      await onSendMessage(text);
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err: any) {
      alert(err.message || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ارسال با زدن Enter (بدون نگه داشتن Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="chat-input-area">
      {/* نمایش نوار ریپلای در صورت وجود پیام والد */}
      {activeReplyTo && (
        <div className="active-reply-bar">
          <div className="reply-details">
            <span className="reply-title">Replying to message</span>
            <span className="reply-text">{activeReplyTo.text}</span>
          </div>
          <button className="close-reply-btn" onClick={onCancelReply} type="button">
            &times;
          </button>
        </div>
      )}

      {/* فرم نوشتن پیام */}
      <form onSubmit={handleSubmit} className="chat-input-form">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={2000}
          disabled={loading}
          rows={1}
        />
        <button 
          type="submit" 
          className="chat-send-btn" 
          disabled={!text.trim() || loading}
        >
          {loading ? '...' : '✈'}
        </button>
      </form>
    </div>
  );
}
