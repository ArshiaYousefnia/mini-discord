import api from "./api";
import type {
  RegisterPayload,
  LoginPayload,
  LoginResponse,
} from "../types/auth";

export const registerUser = async (data: RegisterPayload) => {
  const response = await api.post("/api/register/", data);
  return response.data;
};

export const loginUser = async (
  data: LoginPayload
): Promise<LoginResponse> => {
  const response = await api.post("/api/login/", data);
  return response.data;
};

export const logoutUser = async () => {
  const refresh = localStorage.getItem("refreshToken");

  if (!refresh) {
    throw new Error("No refresh token found");
  }

  const response = await api.post("/api/logout/", {
    refresh,
  });

  return response.data;
};
