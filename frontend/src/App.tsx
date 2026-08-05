import { Routes, Route, Navigate } from "react-router-dom";
import Register from "./pages/Register";
import Login from "./pages/Login";
import UserProfilePage from "./pages/UserProfilePage";
import ProtectedRoute from "./components/ProtectedRoute";
import EditProfilePage from "./pages/EditProfilePage";
import HomePage from "./pages/HomePage";
import CreateGroupPage from "./pages/CreateGroupPage";
import CreateChannelPage from "./pages/CreateChannelPage";
import ChannelInvitePage from "./pages/ChannelInvitePage";

// Helper component to handle root routing logic
function RootRedirect() {
  // Check if user exists in localStorage.
  // IMPORTANT: Change "username" to the exact key your LoginForm saves
  // e.g. "token", "access_token", "userData", etc.
  const isAuthenticated = !!localStorage.getItem("username");

  if (isAuthenticated) {
    return <Navigate to="/HomePage/" replace />;
  }

  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Root path redirects based on auth state */}
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

      <Route
        path="/HomePage/"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/groups/create"
        element={
          <ProtectedRoute>
            <CreateGroupPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/channels/create"
        element={
          <ProtectedRoute>
            <CreateChannelPage />
          </ProtectedRoute>
        }
      />

      {/* Task #20 — invite-link preview screen */}
      <Route
        path="/channels/join/:inviteCode"
        element={
          <ProtectedRoute>
            <ChannelInvitePage />
          </ProtectedRoute>
        }
      />

      {/* Fallback wildcard route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
