import { useEffect, useState } from "react";

export function useOnlineStatus() {
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://localhost:8000/ws/online/?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        console.log("ONLINE WS MESSAGE:", data);

        if (data.type === "user_status" && data.user_id) {
          setOnlineUsers((prev) => {
            const userId = String(data.user_id);
            const nextValue = Boolean(data.is_online);

            console.log("ONLINE STATUS UPDATE:", {
              userId,
              previous: prev[userId],
              next: nextValue,
              fullPayload: data,
            });

            return {
              ...prev,
              [userId]: nextValue,
            };
          });
        }
      } catch (err) {
        console.error("Failed to parse status message", err);
      }
    };


    ws.onerror = (err) => {
      console.error("Online status websocket error", err);
    };

    const handleLogout = () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, "User logged out");
      }
    };

    window.addEventListener("userLoggedOut", handleLogout);

    return () => {
      window.removeEventListener("userLoggedOut", handleLogout);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, "Component unmounted");
      }
    };
  }, []);

  return { onlineUsers, setOnlineUsers };
}
