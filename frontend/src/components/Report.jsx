import "./Report.css";

export default function Report({ report, onRestart }) {
  const score = report?.integrity_score ?? 0;
  const getScoreLabel = (s) => {
    if (s >= 85) return { label: "Excellent", color: "green" };
    if (s >= 65) return { label: "Moderate", color: "yellow" };
    return { label: "Suspicious", color: "red" };
  };

  const { label, color } = getScoreLabel(score);

  const headTimes = report?.head_times || {};
  const violations = report?.violations || [];
  const highCount = violations.filter((v) => v.severity === "HIGH").length;
  const medCount = violations.filter((v) => v.severity === "MEDIUM").length;

  return (
    <div className="report-page">
      <div className="grid-bg" />

      <div className="report-header fade-up">
        <div className="logo">
          <span className="logo-icon">⬡</span>
          <span>ProctorAI</span>
        </div>
        <span className="badge blue">Exam Complete</span>
      </div>

      <div className="report-content">
        {/* Score card */}
        <div className={`score-card score-${color} fade-up`}>
          <div className="score-left">
            <div className="score-label">INTEGRITY SCORE</div>
            <div className="score-number">{score}</div>
            <div className="score-out">/100</div>
            <span className={`badge ${color}`}>{label}</span>
          </div>
          <div className="score-right">
            <div className="score-meta">
              <span className="sm-label">Student</span>
              <span className="sm-value">{report?.student_name}</span>
            </div>
            <div className="score-meta">
              <span className="sm-label">Exam</span>
              <span className="sm-value">{report?.exam_name}</span>
            </div>
            <div className="score-meta">
              <span className="sm-label">Tab Switches</span>
              <span className={`sm-value ${report?.tab_switches > 0 ? "val-red" : "val-green"}`}>
                {report?.tab_switches ?? 0}
              </span>
            </div>
            <div className="score-meta">
              <span className="sm-label">Total Violations</span>
              <span className={`sm-value ${violations.length > 5 ? "val-red" : "val-green"}`}>
                {violations.length}
              </span>
            </div>
          </div>
        </div>

        <div className="report-grid">
          {/* Violation breakdown */}
          <div className="report-box fade-up">
            <div className="box-title">Violation Summary</div>
            <div className="viol-row">
              <span className="badge red">{highCount} High</span>
              <span className="badge yellow">{medCount} Medium</span>
            </div>
            <div className="viol-list">
              {violations.length === 0 ? (
                <div className="viol-empty">✓ No violations recorded</div>
              ) : (
                violations.slice(0, 10).map((v, i) => (
                  <div key={i} className={`viol-item v-${v.severity?.toLowerCase()}`}>
                    <span className={`badge ${v.severity === "HIGH" ? "red" : "yellow"}`}>
                      {v.type}
                    </span>
                    <span className="viol-msg">{v.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Head pose times */}
          <div className="report-box fade-up">
            <div className="box-title">Head Pose Analysis</div>
            {Object.entries(headTimes).map(([dir, secs]) => (
              <div className="hp-row" key={dir}>
                <span className="hp-dir">{dir}</span>
                <div className="hp-bar-bg">
                  <div
                    className={`hp-bar ${secs > 5 ? "hp-danger" : "hp-ok"}`}
                    style={{ width: `${Math.min(100, (secs / 60) * 100)}%` }}
                  />
                </div>
                <span className="mono hp-val">{secs.toFixed(1)}s</span>
                {secs > 5 && <span className="badge red">Alert</span>}
              </div>
            ))}
            {Object.keys(headTimes).length === 0 && (
              <div className="viol-empty">No head pose data</div>
            )}
          </div>
        </div>

        {/* Answers summary */}
        <div className="report-box fade-up">
          <div className="box-title">Answers Submitted</div>
          <div className="viol-empty mono" style={{ fontSize: 13 }}>
            {Object.keys(report?.answers || {}).length} questions answered
          </div>
        </div>

        <div className="report-actions fade-up">
          <button className="btn-ghost" onClick={() => window.print()}>
            🖨️ Print Report
          </button>
          <button className="btn-primary" onClick={onRestart}>
            Start New Exam →
          </button>
        </div>
      </div>
    </div>
  );
}