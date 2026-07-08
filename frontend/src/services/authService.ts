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



export const logoutUser = async (refreshToken: string) => {
  // Updated to match path("api/logout/", LogoutView.as_view(), name="logout")
  const response = await api.post('/api/logout/', { 
    refresh: refreshToken 
  });
  return response.data;
};

