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
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!validateEmail(form.email)) {
      newErrors.email = "Invalid email format";
    }

    if (!form.birthday) {
      newErrors.birthday = "Birthday is required";
    }

    if (!validateUsername(form.username)) {
      newErrors.username = "Username must be at least 4 characters";
    }

    if (!validatePassword(form.password)) {
      newErrors.password =
        "Password must include uppercase, lowercase, number, special character and be 8+ characters";
    }

    if (form.password !== form.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (!form.displayName.trim()) {
      newErrors.displayName = "Display name is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

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
        const backendErrors = err.response?.data;

        if (backendErrors) {
          const formatted: Record<string, string> = {};

          Object.keys(backendErrors).forEach((key) => {
            formatted[key] = backendErrors[key].join(" ");
          });

          setErrors(formatted);
        } else {
           alert("Registration failed");
        }
    } finally {
      setLoading(false);
    }

  };

  return (
    <form className="register-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          placeholder="Enter your email"
          value={form.email}
          onChange={handleChange}
        />
        {errors.email && <p className="form-error">{errors.email}</p>}
      </div>

      <div className="form-field">
        <label htmlFor="birthday">Birthday</label>
        <DatePicker
          calendar={persian}
          locale={persian_fa}
          value={form.birthday}
          placeholder="Select your birthday"
          onChange={(date: any) =>
            setForm((prev) => ({
              ...prev,
              birthday: date ? date.format("YYYY/MM/DD") : "",
            }))
          }
        />
        {errors.birthday && <p className="form-error">{errors.birthday}</p>}
      </div>

      <div className="form-field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          placeholder="Choose a username"
          value={form.username}
          onChange={handleChange}
        />
        {errors.username && <p className="form-error">{errors.username}</p>}
      </div>

      <div className="form-field">
        <label htmlFor="password">Password</label>
        <div className="password-field">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder="Enter your password"
            value={form.password}
            onChange={handleChange}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ?  "👁️":"🙈"}
          </button>
        </div>
        {errors.password && <p className="form-error">{errors.password}</p>}
      </div>

      <div className="form-field">
        <label htmlFor="confirmPassword">Confirm Password</label>
        <div className="password-field">
          <input
            id="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            name="confirmPassword"
            placeholder="Repeat your password"
            value={form.confirmPassword}
            onChange={handleChange}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowConfirmPassword((prev) => !prev)}
            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
          >
            {showConfirmPassword ? "👁️" : "🙈" }
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="form-error">{errors.confirmPassword}</p>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="displayName">Display Name</label>
        <input
          id="displayName"
          name="displayName"
          placeholder="Enter your display name"
          value={form.displayName}
          onChange={handleChange}
        />
        {errors.displayName && <p className="form-error">{errors.displayName}</p>}
      </div>

      <button className="register-button" type="submit" disabled={loading}>
        {loading ? "Registering..." : "Register"}
      </button>
    </form>
  );
}
