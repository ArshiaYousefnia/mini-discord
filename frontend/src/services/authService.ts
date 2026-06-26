import axios from "axios";
import { type RegisterPayload } from "../types/auth";

const API_URL = import.meta.env.VITE_API_URL as string;

export const registerUser = async (data: RegisterPayload) => {
  const response = await axios.post(`${API_URL}/api/register/`, data);
  return response.data;
};

