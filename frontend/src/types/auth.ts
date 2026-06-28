export interface RegisterFormData {
  email: string;
  birthday: string;
  username: string;
  password: string;
  confirmPassword: string;
  displayName: string;
}

export interface RegisterPayload {
  email: string;
  birthday: string;
  username: string;
  password: string;
  display_name: string;
}

export type LoginFormData = {
  username: string;
  password: string;
};

export type LoginPayload = {
  username: string;
  password: string;
};

export type LoginResponse = {
  refresh: string;
  access: string;
  username: string;
  email: string;
};
