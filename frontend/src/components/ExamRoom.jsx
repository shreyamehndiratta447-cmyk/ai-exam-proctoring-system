import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import "./ExamRoom.css";

const API = "http://127.0.0.1:5000";

const SAMPLE_QUESTIONS = [
  { id: 1, q: "What is the time complexity of QuickSort in the average case?", opts: ["O(n)", "O(n log n)", "O(n²)", "O(log n)"], ans: 1 },
  { id: 2, q: "Which data structure uses LIFO (Last In, First Out) ordering?", opts: ["Queue", "Stack", "Linked List", "Heap"], ans: 1 },
  { id: 3, q: "What is the worst-case time complexity of Binary Search?", opts: ["O(1)", "O(n)", "O(log n)", "O(n log n)"], ans: 2 },
  { id: 4, q: "Which traversal visits root FIRST in a Binary Tree?", opts: ["Inorder", "Postorder", "Preorder", "Level Order"], ans: 2 },
  { id: 5, q: "What is the space complexity of Merge Sort?", opts: ["O(1)", "O(log n)", "O(n)", "O(n²)"], ans: 2 },
];

export default function ExamRoom({ sessionData, onEnd }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const intervalRef = useRef(null);
  const audioIntervalRef = useRef(null);

  const [analysis, setAnalysis] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [timeLeft, setTimeLeft] = useState(sessionData.duration * 60);
  const [answers, setAnswers] = useState({});
  const [currentQ, setCurrentQ] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [violations, setViolations] = useState([]);

  // ── Alerts queue ──────────────────────────────────────────────────
  const addAlert = useCallback((message, severity = "MEDIUM") => {
    const id = Date.now() + Math.random();
    setAlerts((prev) => [{ id, message, severity }, ...prev.slice(0, 9)]);
    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }, 5000);
  }, []);

  // ── End exam ──────────────────────────────────────────────────────
  const handleEndExam = useCallback(async () => {
    clearInterval(intervalRef.current);
    clearInterval(audioIntervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const res = await fetch(`${API}/api/session/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionData.sessionId }),
      });
      const data = await res.json();
      onEnd({ ...data.report, answers, tabSwitches });
    } catch {
      onEnd({
        student_name: sessionData.studentName,
        exam_name: sessionData.examName,
        violations: violations,
        tab_switches: tabSwitches,
        integrity_score: 70,
        answers,
      });
    }
  }, [sessionData, answers, tabSwitches, violations, onEnd]);

  // ── Audio monitor ──────────────────────────────────────────────────
  const setupAudio = useCallback((stream) => {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    audioContextRef.current = ctx;
    analyserRef.current = analyser;

    audioIntervalRef.current = setInterval(() => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const normalized = avg / 128;
      setAudioLevel(normalized);
      if (normalized > 0.7) {
        fetch(`${API}/api/event/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionData.sessionId, volume: normalized }),
        });
        addAlert(`High audio detected (${Math.round(normalized * 100)}%)`, "MEDIUM");
      }
    }, 2000);
  }, [sessionData.sessionId, addAlert]);

  // ── Timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timer); handleEndExam(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [handleEndExam]);

  // ── Socket.IO ──────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(API, { transports: ["websocket"] });
    socketRef.current = socket;
    socket.on("analysis", (data) => {
      setAnalysis(data);
      if (data.violations?.length) {
        data.violations.forEach((v) => addAlert(v.message, v.severity));
        setViolations((prev) => [
          ...prev.slice(-100),
          ...data.violations.map((v) => ({ ...v, timestamp: new Date().toLocaleTimeString() })),
        ]);
      }
    });
    return () => socket.disconnect();
  }, [addAlert]);

  // ── Camera ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: true,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setCameraReady(true);
        }
        setupAudio(stream);
      } catch  {
        addAlert("Camera access denied. Cannot proceed.", "HIGH");
      }
    })();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      clearInterval(intervalRef.current);
      clearInterval(audioIntervalRef.current);
    };
  }, [addAlert, setupAudio]);

  // ── Frame capture ─────────────────────────────────────────────────
  useEffect(() => {
    if (!cameraReady) return;
    intervalRef.current = setInterval(() => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      const ctx = canvas.getContext("2d");
      canvas.width = 640;
      canvas.height = 480;
      ctx.drawImage(video, 0, 0, 640, 480);
      const frame = canvas.toDataURL("image/jpeg", 0.6);
      socketRef.current?.emit("frame", { session_id: sessionData.sessionId, frame });
    }, 800);
    return () => clearInterval(intervalRef.current);
  }, [cameraReady, sessionData.sessionId]);

  // ── Tab switch ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        setTabSwitches((c) => c + 1);
        addAlert("Tab switch detected!", "HIGH");
        fetch(`${API}/api/event/tab-switch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionData.sessionId }),
        });
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [addAlert, sessionData.sessionId]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const headDir = analysis?.head_direction || "–";
  const gazeDir = analysis?.gaze_direction || "–";
  const faceCount = analysis?.face_count ?? "–";

  const dirColor = (d) => {
    if (d === "FORWARD" || d === "CENTER") return "green";
    if (d === "UNKNOWN" || d === "–") return "yellow";
    return "red";
  };

  return (
    <div className="exam-room">
      <div className="grid-bg" />
      <div className="exam-topbar">
        <div className="logo"><span className="logo-icon">⬡</span> ProctorAI</div>
        <div className="exam-meta">
          <span className="exam-meta-name">{sessionData.examName}</span>
          <span className="badge blue">{sessionData.studentName}</span>
        </div>
        <div className="topbar-right">
          <div className={`timer-box ${timeLeft < 300 ? "timer-urgent" : ""}`}>
            <span className="timer-label">TIME LEFT</span>
            <span className="timer-value mono">{formatTime(timeLeft)}</span>
          </div>
          <button className="btn-danger end-btn" onClick={handleEndExam}>Submit Exam</button>
        </div>
      </div>

      <div className="exam-body">
        <div className="proctor-panel">
          <div className="webcam-wrapper">
            <video ref={videoRef} autoPlay muted playsInline className="webcam" />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {!cameraReady && (
              <div className="cam-loading">
                <div className="spinner" />
                <span>Initializing camera...</span>
              </div>
            )}
            <div className="webcam-overlay">
              <span className="badge red pulse">● LIVE</span>
              <span className={`badge ${faceCount === 1 ? "green" : "red"}`}>
                {faceCount === 0 ? "No Face" : faceCount === 1 ? "1 Face ✓" : `${faceCount} Faces!`}
              </span>
            </div>
          </div>

          <div className="stats-grid">
            <StatCard label="Head Direction" value={headDir} color={dirColor(headDir)} />
            <StatCard label="Gaze" value={gazeDir} color={dirColor(gazeDir)} />
            <StatCard label="Tab Switches" value={tabSwitches} color={tabSwitches > 0 ? "red" : "green"} />
            <StatCard label="Violations" value={violations.length} color={violations.length > 5 ? "red" : violations.length > 0 ? "yellow" : "green"} />
          </div>

          {analysis?.head_times && (
            <div className="head-times">
              <div className="ht-title">Head Pose Duration (seconds)</div>
              {Object.entries(analysis.head_times).map(([dir, secs]) => (
                <div className="ht-row" key={dir}>
                  <span className="ht-label">{dir}</span>
                  <div className="ht-bar-bg">
                    <div className={`ht-bar ${secs > 5 ? "ht-bar-danger" : "ht-bar-ok"}`}
                      style={{ width: `${Math.min(100, (secs / 30) * 100)}%` }} />
                  </div>
                  <span className="ht-value mono">{secs.toFixed(1)}s</span>
                </div>
              ))}
            </div>
          )}

          <div className="audio-monitor">
            <span className="ht-title">Audio Level</span>
            <div className="audio-bar-bg">
              <div className={`audio-bar ${audioLevel > 0.7 ? "audio-danger" : "audio-ok"}`}
                style={{ width: `${Math.min(100, audioLevel * 100)}%`, transition: "width 0.3s" }} />
            </div>
          </div>

          <div className="alerts-panel">
            {alerts.length === 0 ? (
              <div className="no-alerts">✓ No active alerts</div>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className={`alert-item alert-${a.severity?.toLowerCase()}`}>
                  <span className="alert-icon">{a.severity === "HIGH" ? "🔴" : "🟡"}</span>
                  <span>{a.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="questions-panel">
          <div className="q-header">
            <span className="q-count">Question {currentQ + 1} / {SAMPLE_QUESTIONS.length}</span>
            <div className="q-nav">
              {SAMPLE_QUESTIONS.map((_, i) => (
                <button key={i}
                  className={`q-dot ${currentQ === i ? "active" : ""} ${answers[i] !== undefined ? "answered" : ""}`}
                  onClick={() => setCurrentQ(i)}>{i + 1}</button>
              ))}
            </div>
          </div>

          <div className="q-body">
            <div className="q-text">{SAMPLE_QUESTIONS[currentQ].q}</div>
            <div className="q-options">
              {SAMPLE_QUESTIONS[currentQ].opts.map((opt, oi) => (
                <button key={oi}
                  className={`q-option ${answers[currentQ] === oi ? "selected" : ""}`}
                  onClick={() => setAnswers({ ...answers, [currentQ]: oi })}>
                  <span className="q-opt-letter">{["A", "B", "C", "D"][oi]}</span>
                  <span>{opt}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="q-footer">
            <button className="btn-ghost" disabled={currentQ === 0} onClick={() => setCurrentQ((c) => c - 1)}>← Previous</button>
            <span className="mono" style={{ color: "var(--text-dim)", fontSize: 13 }}>
              {Object.keys(answers).length}/{SAMPLE_QUESTIONS.length} answered
            </span>
            {currentQ < SAMPLE_QUESTIONS.length - 1 ? (
              <button className="btn-primary" onClick={() => setCurrentQ((c) => c + 1)}>Next →</button>
            ) : (
              <button className="btn-danger" onClick={handleEndExam}>Submit →</button>
            )}
          </div>

          <div className="violation-log">
            <div className="vl-title">Violation Log</div>
            {violations.length === 0 ? (
              <div className="vl-empty">No violations recorded</div>
            ) : (
              <div className="vl-list">
                {violations.slice(-8).reverse().map((v, i) => (
                  <div key={i} className={`vl-item vl-${v.severity?.toLowerCase()}`}>
                    <span className="mono vl-time">{v.timestamp}</span>
                    <span className="vl-type">{v.type}</span>
                    <span className="vl-msg">{v.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className={`stat-card stat-${color}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}