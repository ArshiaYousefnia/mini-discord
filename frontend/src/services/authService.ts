import axios from "axios";
import { type RegisterPayload } from "../types/auth";

export const registerUser = async (data: RegisterPayload) => {
  const response = await axios.post("/api/register/", data);
  return response.data;
};
