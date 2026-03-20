import { useState } from "react";
import "./ExamSetup.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function ExamSetup({ onStart }) {
  const [form, setForm] = useState({
    studentName: "",
    examName: "Data Structures & Algorithms",
    duration: 60,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!form.studentName.trim()) {
      setError("Please enter your name");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const sessionId = `sess_${Date.now()}`;
      const res = await fetch(`${API}/api/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          student_name: form.studentName,
          exam_name: form.examName,
        }),
      });

      if (!res.ok) throw new Error("Server error");
      const data = await res.json();

      onStart({
        sessionId: data.session_id,
        studentName: form.studentName,
        examName: form.examName,
        duration: form.duration,
      });
    } catch  {
      setError("Cannot connect to server. Make sure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      <div className="grid-bg" />

      <div className="setup-header fade-up">
        <div className="logo">
          <span className="logo-icon">⬡</span>
          <span>ProctorAI</span>
        </div>
        <span className="badge blue">v1.0 — Major Project</span>
      </div>

      <div className="setup-center">
        <div className="setup-card fade-up">
          <div className="setup-card-header">
            <h1>AI Exam Proctoring System</h1>
            <p>Powered by Computer Vision & Deep Learning</p>
          </div>

          <div className="features-row">
            {[
              { icon: "👁️", label: "Face Detection" },
              { icon: "👀", label: "Gaze Tracking" },
              { icon: "🗣️", label: "Audio Monitor" },
              { icon: "📱", label: "Tab Switch" },
              { icon: "📐", label: "Head Pose" },
            ].map((f) => (
              <div className="feature-chip" key={f.label}>
                <span>{f.icon}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>

          <div className="form-section">
            <div className="form-group">
              <label>Your Full Name</label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={form.studentName}
                onChange={(e) =>
                  setForm({ ...form, studentName: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>Exam Subject</label>
              <select
                value={form.examName}
                onChange={(e) =>
                  setForm({ ...form, examName: e.target.value })
                }
              >
                <option>Data Structures & Algorithms</option>
                <option>Machine Learning</option>
                <option>Database Management</option>
                <option>Operating Systems</option>
                <option>Computer Networks</option>
              </select>
            </div>

            <div className="form-group">
              <label>Duration (minutes)</label>
              <input
                type="number"
                min={10}
                max={180}
                value={form.duration}
                onChange={(e) =>
                  setForm({ ...form, duration: +e.target.value })
                }
              />
            </div>

            {error && <div className="error-msg">⚠️ {error}</div>}

            <button
              className="btn-primary start-btn"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Initializing..." : "Start Proctored Exam →"}
            </button>
          </div>

          <div className="setup-disclaimer">
            🔒 This system monitors your webcam and audio for academic integrity.
            By starting, you consent to AI-based proctoring.
          </div>
        </div>

        <div className="tech-stack fade-up">
          <span className="ts-label">Tech Stack</span>
          {["Python", "Flask", "MediaPipe", "OpenCV", "React", "Socket.IO", "WebRTC"].map(
            (t) => (
              <span className="ts-chip mono" key={t}>
                {t}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}