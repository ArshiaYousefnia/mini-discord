import { useState, useEffect } from "react";

export function useOnlineStatus() {
  // Map of userId to their online status boolean
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Retrieve auth token if required by routing.py/middleware
    const token = localStorage.getItem("accessToken");
    const wsUrl = `ws://localhost:8000/ws/online/?token=${token}`; 
    
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // 1. Handle initial snapshot of all online users
        if (data.type === "online_users_snapshot" && Array.isArray(data.user_ids)) {
          const snapshotMap: Record<string, boolean> = {};
          
          // Populate status map for everyone in the snapshot list
          data.user_ids.forEach((id: string | number) => {
            snapshotMap[String(id)] = true;
          });

          // Merge snapshot with existing status mapping
          setOnlineUsers((prev) => ({
            ...prev,
            ...snapshotMap,
          }));
        } 
        
        // 2. Handle incremental single status updates
        else if (data.type === "user_status" && data.user_id) {
          setOnlineUsers((prev) => ({
            ...prev,
            [String(data.user_id)]: data.is_online,
          }));
        }
      } catch (err) {
        console.error("Failed to parse status message", err);
      }
    };

    // Close the socket immediately when the user logs out
    const handleLogout = () => {
      ws.close(1000, "User logged out");
    };
    window.addEventListener("userLoggedOut", handleLogout);

    return () => {
      window.removeEventListener("userLoggedOut", handleLogout);
      ws.close();
    };
  }, []);

  // Return both state and setter in an object to match HomePage.tsx destructuring
  return { onlineUsers, setOnlineUsers };
}
