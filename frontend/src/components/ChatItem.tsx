type Chat = {
  id: string;
  name: string;
  message: string;
  avatar: string;
};

export default function ChatItem({ chat }: { chat: Chat }) {
  return (
    <div className="chat-item">
      <img src={chat.avatar} className="chat-avatar" />

      <div className="chat-info">
        <div className="chat-name">{chat.name}</div>
        <div className="chat-message">{chat.message}</div>
      </div>
    </div>
  );
}
