import RegisterForm from "../components/RegisterForm";
import "../styles/register.css";

export default function Register() {
  return (
    <main className="register-page">
      <section className="register-card">
        <div className="register-header">
          <h1>Register</h1>
          <p>Create your account to continue</p>
        </div>

        <RegisterForm />
      </section>
    </main>
  );
}
