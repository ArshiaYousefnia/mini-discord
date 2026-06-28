type Props = {
  userId: string;
};

export default function MessageButton({ userId }: Props) {
  const handleMessage = async () => {
    try {
      const res = await fetch(`/api/direct-messages/start/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: userId }),
      });

      const data = await res.json();

      window.location.href = `/chat/${data.thread_id}`;
    } catch (err) {
      console.error("Failed to start chat", err);
    }
  };

  return (
    <button className="message-button" onClick={handleMessage}>
      Message
    </button>
  );
}
