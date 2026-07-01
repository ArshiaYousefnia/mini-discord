import ChatItem from "./ChatItem";


export default function Sidebar() {
  const dummyChats = [
    {
      id: "1",
      name: "Alice",
      message: "Hey! how are you?",
      avatar: "https://i.pravatar.cc/150?img=1",
    },
    {
      id: "2",
      name: "Bob",
      message: "Let's meet tomorrow.",
      avatar: "https://i.pravatar.cc/150?img=2",
    },
    {
      id: "3",
      name: "Charlie",
      message: "Check this out!",
      avatar: "https://i.pravatar.cc/150?img=3",
    },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <div className="my-profile">
          <img
            src="https://i.pravatar.cc/150?img=12"
            className="profile-avatar"
          />
          <span className="profile-name">My Profile</span>
        </div>

        <input
          className="chat-search"
          placeholder="Search..."
        />
      </div>

      <div className="chat-list">
        {dummyChats.map((chat) => (
          <ChatItem key={chat.id} chat={chat} />
        ))}
      </div>
    </div>
  );
}
