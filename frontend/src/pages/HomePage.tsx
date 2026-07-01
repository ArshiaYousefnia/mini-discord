
import Sidebar from "../components/Sidebar";
import "../styles/home.css";

export default function HomePage() {
  return (
    <div className="home-page">
      <Sidebar />

      <div className="chat-area">
        <div className="chat-placeholder">
          Select a chat to start messaging
        </div>
      </div>
    </div>
  );
}
