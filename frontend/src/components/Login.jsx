import { useState } from "react";
import "./Login.css";

const API = "http://127.0.0.1:5000";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login"); // login | register
  const [role, setRole] = useState("student");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!form.email || !form.password) { setError("All fields are required"); return; }
    if (mode === "register" && !form.name) { setError("Name is required"); return; }
    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = mode === "login"
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password, role };

      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) { setError(data.error || "Something went wrong"); return; }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      onLogin(data.user, data.token);
    } catch {
      setError("Cannot connect to server. Make sure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="grid-bg" />

      <div className="login-left">
        <div className="login-brand">
          <span className="logo-icon">⬡</span>
          <span className="logo-text">ProctorAI</span>
        </div>
        <h1 className="login-tagline">
          AI-Powered<br />Exam Integrity
        </h1>
        <p className="login-sub">
          Real-time monitoring using Computer Vision,<br />
          Gaze Tracking & Head Pose Estimation
        </p>
        <div className="login-features">
          {["👁️ Face Detection", "👀 Gaze Tracking", "📐 Head Pose", "🔈 Audio Monitor", "📱 Tab Switch"].map(f => (
            <span key={f} className="lf-chip">{f}</span>
          ))}
        </div>
      </div>

      <div className="login-right">
        <div className="login-card fade-up">
          <div className="tab-row">
            <button className={`tab-btn ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Login</button>
            <button className={`tab-btn ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>Register</button>
          </div>

          <div className="login-form">
            {mode === "register" && (
              <>
                <div className="role-row">
                  <button className={`role-btn ${role === "student" ? "active" : ""}`} onClick={() => setRole("student")}>🎓 Student</button>
                  <button className={`role-btn ${role === "admin" ? "active" : ""}`} onClick={() => setRole("admin")}>🛡️ Admin</button>
                </div>
                <div className="form-group">
                  <label>Full Name</label>
                  <input type="text" placeholder="e.g. Rahul Sharma"
                    value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
              </>
            )}

            <div className="form-group">
              <label>Email</label>
              <input type="email" placeholder="you@email.com"
                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input type="password" placeholder="••••••••"
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            </div>

            {error && <div className="error-msg">⚠️ {error}</div>}

            <button className="btn-primary login-btn" onClick={handleSubmit} disabled={loading}>
              {loading ? "Please wait..." : mode === "login" ? "Login →" : "Create Account →"}
            </button>

            {mode === "login" && (
              <div className="admin-hint">
                <span>Default Admin:</span>
                <code>admin@proctor.ai</code>
                <span>/</span>
                <code>admin123</code>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}