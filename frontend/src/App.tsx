import { Routes, Route, Navigate } from "react-router-dom";
import Register from "./pages/Register";
import Login from "./pages/Login";
import UserProfilePage from "./pages/UserProfilePage";
import ProtectedRoute from "./components/ProtectedRoute";
import EditProfilePage from "./pages/EditProfilePage";
import ChatPage from "./pages/ChatPage";


function Home() {
  return <div>Home page</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />

      <Route
        path="/users/:userId"
        element={
          <ProtectedRoute>
            <UserProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/:userId/profile/update/"
        element={
          <ProtectedRoute>
            <EditProfilePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/chat/:userId"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      {/* <Route path="/chat/:userId" element={<ChatPage />} /> */}



      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
