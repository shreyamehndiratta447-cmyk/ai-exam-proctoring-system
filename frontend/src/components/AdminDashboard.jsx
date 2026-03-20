import { useEffect, useState } from "react";
import "./AdminDashboard.css";

const API = "http://127.0.0.1:5000";

export default function AdminDashboard({ user, token, onLogout }) {
  const [stats, setStats]       = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [violations, setViolations] = useState([]);
  const [tab, setTab]           = useState("sessions"); // sessions | students
  const [students, setStudents] = useState([]);
  const [loading, setLoading]   = useState(true);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [statsRes, sessRes, stuRes] = await Promise.all([
        fetch(`${API}/api/admin/dashboard`, { headers }),
        fetch(`${API}/api/admin/sessions`, { headers }),
        fetch(`${API}/api/admin/students`, { headers }),
      ]);
      setStats(await statsRes.json());
      setSessions(await sessRes.json());
      setStudents(await stuRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const loadViolations = async (sessionId) => {
    setSelected(sessionId);
    const res = await fetch(`${API}/api/admin/sessions/${sessionId}/violations`, { headers });
    setViolations(await res.json());
  };

  const scoreColor = (s) => s >= 85 ? "green" : s >= 65 ? "yellow" : "red";

  return (
    <div className="admin-page">
      <div className="grid-bg" />

      {/* Top Bar */}
      <div className="admin-topbar">
        <div className="logo"><span className="logo-icon">⬡</span> ProctorAI</div>
        <div className="admin-title">Admin Dashboard</div>
        <div className="admin-user">
          <span className="badge blue">🛡️ {user.name}</span>
          <button className="btn-ghost logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="admin-body">
        {/* Stats Row */}
        {stats && (
          <div className="stats-row fade-up">
            <StatBox label="Total Students" value={stats.total_students} icon="🎓" color="blue" />
            <StatBox label="Total Sessions" value={stats.total_sessions} icon="📋" color="purple" />
            <StatBox label="Active Now" value={stats.active_sessions} icon="🔴" color="red" pulse={stats.active_sessions > 0} />
            <StatBox label="Avg Score" value={`${stats.average_score}/100`} icon="📊" color="green" />
          </div>
        )}

        {/* Tabs */}
        <div className="admin-tabs">
          <button className={`tab-btn ${tab === "sessions" ? "active" : ""}`} onClick={() => setTab("sessions")}>📋 Exam Sessions</button>
          <button className={`tab-btn ${tab === "students" ? "active" : ""}`} onClick={() => setTab("students")}>🎓 Students</button>
          <button className="refresh-btn btn-ghost" onClick={fetchAll}>🔄 Refresh</button>
        </div>

        {loading ? (
          <div className="loading-box"><div className="spinner" /><span>Loading data...</span></div>
        ) : (
          <div className="admin-content">
            {/* Sessions Tab */}
            {tab === "sessions" && (
              <div className="admin-grid">
                <div className="sessions-list">
                  <div className="list-header">
                    <span>Student</span><span>Exam</span><span>Score</span><span>Violations</span><span>Status</span>
                  </div>
                  {sessions.length === 0 ? (
                    <div className="empty-state">No sessions yet</div>
                  ) : sessions.map(s => (
                    <div key={s.session_id}
                      className={`session-row ${selected === s.session_id ? "selected" : ""}`}
                      onClick={() => loadViolations(s.session_id)}>
                      <span className="sr-name">{s.student_name}</span>
                      <span className="sr-exam">{s.exam_name}</span>
                      <span className={`sr-score score-${scoreColor(s.integrity_score)}`}>{s.integrity_score}</span>
                      <span className="sr-viols">{s.total_violations}</span>
                      <span className={`badge ${s.status === "active" ? "red pulse" : "blue"}`}>
                        {s.status === "active" ? "● LIVE" : "Done"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Violation Detail */}
                <div className="violation-detail">
                  {!selected ? (
                    <div className="empty-state">← Click a session to see violations</div>
                  ) : (
                    <>
                      <div className="vd-title">Violation Log — {selected}</div>
                      {violations.length === 0 ? (
                        <div className="empty-state">No violations recorded ✓</div>
                      ) : violations.map((v, i) => (
                        <div key={i} className={`vd-row vd-${v.severity?.toLowerCase()}`}>
                          <span className="mono vd-time">{new Date(v.timestamp).toLocaleTimeString()}</span>
                          <span className={`badge ${v.severity === "HIGH" ? "red" : "yellow"}`}>{v.type}</span>
                          <span className="vd-msg">{v.message}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Students Tab */}
            {tab === "students" && (
              <div className="students-table">
                <div className="list-header">
                  <span>Name</span><span>Email</span><span>Total Exams</span><span>Avg Score</span><span>Joined</span>
                </div>
                {students.length === 0 ? (
                  <div className="empty-state">No students registered yet</div>
                ) : students.map(s => (
                  <div key={s.id} className="student-row">
                    <span className="sr-name">{s.name}</span>
                    <span className="sr-email">{s.email}</span>
                    <span className="sr-exams">{s.total_exams}</span>
                    <span className={`sr-score score-${scoreColor(s.average_score)}`}>{s.average_score}</span>
                    <span className="sr-date mono">{new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, icon, color, pulse }) {
  return (
    <div className={`stat-box stat-${color}`}>
      <span className="sb-icon">{icon}</span>
      <div>
        <div className={`sb-value ${pulse ? "pulse" : ""}`}>{value}</div>
        <div className="sb-label">{label}</div>
      </div>
    </div>
  );
}