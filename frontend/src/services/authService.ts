import axios from "axios";
import { type RegisterPayload, type LoginPayload } from "../types/auth";

export const registerUser = async (data: RegisterPayload) => {
  const response = await axios.post("/api/register/", data);
  return response.data;
};

export const loginUser = async (data: LoginPayload) => {
  const response = await axios.post("/api/login/", data);
  return response.data;
};
