import { useState } from "react";
import ExamSetup from "./components/ExamSetup";
import ExamRoom from "./components/ExamRoom";
import Report from "./components/Report";
import "./App.css";

export default function App() {
  const [phase, setPhase] = useState("setup"); // setup | exam | report
  const [sessionData, setSessionData] = useState(null);
  const [report, setReport] = useState(null);

  const handleStart = (data) => {
    setSessionData(data);
    setPhase("exam");
  };

  const handleEnd = (reportData) => {
    setReport(reportData);
    setPhase("report");
  };

  const handleRestart = () => {
    setSessionData(null);
    setReport(null);
    setPhase("setup");
  };

  return (
    <div className="app">
      {phase === "setup" && <ExamSetup onStart={handleStart} />}
      {phase === "exam" && (
        <ExamRoom sessionData={sessionData} onEnd={handleEnd} />
      )}
      {phase === "report" && (
        <Report report={report} onRestart={handleRestart} />
      )}
    </div>
  );
}