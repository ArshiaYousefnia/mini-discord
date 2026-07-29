import { Routes, Route, Navigate } from "react-router-dom";
import Register from "./pages/Register";
import Login from "./pages/Login";
import UserProfilePage from "./pages/UserProfilePage";
import ProtectedRoute from "./components/ProtectedRoute";
import EditProfilePage from "./pages/EditProfilePage";
import HomePage from "./pages/HomePage";
import CreateGroupPage from "./pages/CreateGroupPage";
import CreateChannelPage from "./pages/CreateChannelPage";

// Helper component to handle root routing logic
function RootRedirect() {
  // Check if user exists in localStorage. 
  // IMPORTANT: Change "user" to the exact key your LoginForm saves (e.g., "token", "access_token", or "userData")
  const isAuthenticated = !!localStorage.getItem("username");

  if (isAuthenticated) {
    return <Navigate to="/HomePage/" replace />;
  }
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Root path now uses the redirect component */}
      <Route path="/" element={<RootRedirect />} />
      
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
        path="/profile/"
        element={
          <ProtectedRoute>
            <EditProfilePage />
          </ProtectedRoute>
        }
      />
  
      <Route path="/HomePage/" element={<HomePage />} />
      <Route path="/groups/create" element={<CreateGroupPage />} />
      <Route path="/channels/create" element={<CreateChannelPage />} />

      {/* Fallback wildcard route placed at the end */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
