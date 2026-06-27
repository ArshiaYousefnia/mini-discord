import { Routes, Route } from "react-router-dom";
import UserProfilePage from "./pages/UserProfilePage";

function App() {
  return (
    <Routes>
      <Route path="/users/:userId" element={<UserProfilePage />} />
    </Routes>
  );
}

export default App;
