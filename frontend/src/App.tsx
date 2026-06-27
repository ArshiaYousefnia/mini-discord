import { Routes, Route } from "react-router-dom";
import UserProfilePage from "./pages/UserProfilePage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<h1>Home Works!</h1>} />
      <Route path="/users/:userId" element={<UserProfilePage />} />
      {/* Add your other routes here */}
    </Routes>
  );
}
