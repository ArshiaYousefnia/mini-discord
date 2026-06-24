import { useState } from "react";
import DatePickerModule from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

import { validateEmail, validatePassword, validateUsername } from "../utils/validators";
import { registerUser } from "../services/authService";
import type { RegisterFormData } from "../types/auth";

const DatePicker = (DatePickerModule as any).default ?? DatePickerModule;

export default function RegisterForm() {

  const [form, setForm] = useState<RegisterFormData>({
    email: "",
    birthday: "",
    username: "",
    password: "",
    confirmPassword: "",
    displayName: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!validateEmail(form.email))
      newErrors.email = "Invalid email format";

    if (!validateUsername(form.username))
      newErrors.username = "Username must be at least 4 characters";

    if (!validatePassword(form.password))
      newErrors.password =
        "Password must include uppercase, lowercase, number, special character and be 8+ characters";

    if (form.password !== form.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";

    if (!form.displayName)
      newErrors.displayName = "Display name is required";

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      const payload = {
        email: form.email,
        birthday: form.birthday,
        username: form.username,
        password: form.password,
        displayName: form.displayName,
      };

      await registerUser(payload);

      alert("Registration successful");
    } catch (err: any) {
      alert(err.response?.data?.message || "Registration failed");
    }
  };

  return (
    <form onSubmit={handleSubmit}>

      <input
        name="email"
        placeholder="Email"
        onChange={handleChange}
      />
      {errors.email && <p>{errors.email}</p>}

      <DatePicker
        calendar={persian}
        locale={persian_fa}
        value={form.birthday}
        onChange={(date: any) =>
          setForm({ ...form, birthday: date.format("YYYY/MM/DD") })
        }
      />

      <input
        name="username"
        placeholder="Username"
        onChange={handleChange}
      />
      {errors.username && <p>{errors.username}</p>}

      <input
        type="password"
        name="password"
        placeholder="Password"
        onChange={handleChange}
      />
      {errors.password && <p>{errors.password}</p>}

      <input
        type="password"
        name="confirmPassword"
        placeholder="Confirm Password"
        onChange={handleChange}
      />
      {errors.confirmPassword && <p>{errors.confirmPassword}</p>}

      <input
        name="displayName"
        placeholder="Display Name"
        onChange={handleChange}
      />
      {errors.displayName && <p>{errors.displayName}</p>}

      <button type="submit">Register</button>

    </form>
  );
}
