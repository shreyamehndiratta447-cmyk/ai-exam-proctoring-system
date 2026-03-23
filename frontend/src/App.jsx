import { useState, useEffect } from "react";
import Login from "./components/Login";
import ExamSetup from "./components/ExamSetup";
import ExamRoom from "./components/ExamRoom";
import Report from "./components/Report";
import AdminDashboard from "./components/AdminDashboard";
import "./App.css";

export default function App() {
  const [phase, setPhase] = useState("login"); // login | setup | exam | report | admin
  const [sessionData, setSessionData] = useState(null);
  const [report, setReport] = useState(null);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  // Check if already logged in
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser  = localStorage.getItem("user");
    if (savedToken && savedUser) {
      const u = JSON.parse(savedUser);
      setUser(u);
      setToken(savedToken);
      setPhase(u.role === "admin" ? "admin" : "setup");
    }
  }, []);

  const handleLogin = (u, t) => {
    setUser(u);
    setToken(t);
    setPhase(u.role === "admin" ? "admin" : "setup");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setToken(null);
    setPhase("login");
  };

  const handleStart = (data) => {
    setSessionData({ ...data, studentName: user?.name || data.studentName });
    setPhase("exam");
  };

  const handleEnd = (reportData) => {
    console.log("Report data received:", reportData);
    if (reportData) {
      setReport(reportData);
      setPhase("report");
    } else {
      setPhase("setup");
    }
  };

  const handleRestart = () => {
    setSessionData(null);
    setReport(null);
    setPhase("setup");
  };

  return (
    <div className="app">
      {phase === "login"  && <Login onLogin={handleLogin} />}
      {phase === "admin"  && <AdminDashboard user={user} token={token} onLogout={handleLogout} />}
      {phase === "setup"  && <ExamSetup onStart={handleStart} user={user} onLogout={handleLogout} />}
      {phase === "exam"   && <ExamRoom sessionData={sessionData} onEnd={handleEnd} />}
      {phase === "report" && <Report report={report} onRestart={handleRestart} />}
    </div>
  );
}