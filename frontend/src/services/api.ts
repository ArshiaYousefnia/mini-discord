import axios from "axios";

const api = axios.create({
  baseURL: "/",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");

  // do NOT attach token to login/register
  if (
    token &&
    !config.url?.includes("/api/login/") &&
    !config.url?.includes("/api/register/")
  ) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
