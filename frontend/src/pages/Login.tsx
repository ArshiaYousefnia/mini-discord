
import LoginForm from "../components/LoginForm";
import "../styles/login.css";

export default function Login() {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-header">
          <h1>Login</h1>
          <p>Sign in to access your chats and channels</p>
        </div>

        <LoginForm />
      </section>
    </main>
  );
}
