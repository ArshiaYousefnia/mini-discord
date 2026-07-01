import { useState } from 'react';
import type { Message } from '../types/chat';
import '../styles/chat.css';

type Props = {
  message: Message;
  currentUserId: string;
  onReply: (message: Message) => void;
  onEdit: (messageId: string, newText: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
};

export default function MessageBubble({ message, currentUserId, onReply, onEdit, onDelete }: Props) {
  const isMe = message.senderId === currentUserId;
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const [loading, setLoading] = useState(false);

  // قالب‌بندی نمایش زمان ساده (ساعت و دقیقه)
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const handleSaveEdit = async () => {
    if (!editText.trim() || editText === message.text) {
      setIsEditing(false);
      return;
    }
    setLoading(true);
    try {
      await onEdit(message.id, editText);
      setIsEditing(false);
    } catch (err: any) {
      alert(err.message || 'Failed to edit message');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this message?')) {
      try {
        await onDelete(message.id);
      } catch (err: any) {
        alert(err.message || 'Failed to delete message');
      }
    }
  };

  return (
    <div className={`message-bubble-wrapper ${isMe ? 'outgoing' : 'incoming'}`}>
      
      {/* دکمه‌های اکشن بالاپیام (در حالت هاور) */}
      {!isEditing && (
        <div className="message-actions">
          <button className="action-btn" onClick={() => onReply(message)}>
            Reply
          </button>
          {isMe && (
            <>
              <button className="action-btn" onClick={() => setIsEditing(true)}>
                Edit
              </button>
              <button className="action-btn delete" onClick={handleDelete}>
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* بدنه اصلی حباب */}
      <div className="message-bubble">
        
        {/* پیش‌نمایش ریپلای (اگر پیام ریپلای شده باشد) */}
        {message.replyToMessage && (
          <div className="message-reply-preview">
            <div className="reply-sender">{message.replyToMessage.senderName}</div>
            <div className="reply-text-preview">
              {message.replyToMessage.text.substring(0, 50)}
              {message.replyToMessage.text.length > 50 ? '...' : ''}
            </div>
          </div>
        )}

        {/* بخش متن پیام یا فیلد ویرایش */}
        {isEditing ? (
          <div className="edit-input-container">
            <textarea
              className="edit-textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              disabled={loading}
              maxLength={2000}
            />
            <div className="edit-actions-row">
              <button 
                className="edit-action-btn cancel" 
                onClick={() => { setIsEditing(false); setEditText(message.text); }}
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                className="edit-action-btn save" 
                onClick={handleSaveEdit}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="message-text">{message.text}</div>
        )}

        {/* زمان ارسال، وضعیت خوانده شدن و برچسب ویرایش */}
        {!isEditing && (
          <div className="message-meta">
            {message.isEdited && <span className="message-edited-label">(edited)</span>}
            <span>{formatTime(message.createdAt)}</span>
            
            {isMe && (
              <span className="message-status-icon">
                {message.status === 'sending' ? (
                  '🕒' // آیکون ساعت برای نشان دادن در حال ارسال
                ) : (
                  '✓' // علامت تیک برای ارسال شده
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
