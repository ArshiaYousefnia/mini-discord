import { useState } from "react";
import { loginUser } from "../services/authService";

type LoginFormData = {
  username: string;
  password: string;
};

export default function LoginForm() {
  const [form, setForm] = useState<LoginFormData>({
    username: "",
    password: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    // optional: clear generic error while typing
    setErrors((prev) => ({
      ...prev,
      general: "",
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!form.username.trim()) {
      newErrors.username = "Username is required";
    }

    if (!form.password.trim()) {
      newErrors.password = "Password is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setErrors({});

    try {
      const data = await loginUser({
        username: form.username,
        password: form.password,
      });

      console.log("Login successful:", data);

      // Example frontend-only behavior:
      alert("Login successful");

      // later you can:
      // localStorage.setItem("token", data.access)
      // navigate("/channels")
    } catch (err: any) {
      const status = err.response?.status;
      const message = err.response?.data?.detail;

      if (status === 401) {
        setErrors({ general: "Invalid username or password" });
      } else if (message) {
        setErrors({ general: message });
      } else {
        setErrors({ general: "Something went wrong. Please try again." });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          placeholder="Enter your username"
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
            {showPassword ? "👁️" : "🙈"}
          </button>
        </div>
        {errors.password && <p className="form-error">{errors.password}</p>}
      </div>

      {errors.general && (
        <p className="login-message error">{errors.general}</p>
      )}

      <button className="login-button" type="submit" disabled={loading}>
        {loading ? "Logging in..." : "Login"}
      </button>
    </form>
  );
}
