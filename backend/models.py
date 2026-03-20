from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    id            = db.Column(db.Integer, primary_key=True)
    name          = db.Column(db.String(100), nullable=False)
    email         = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role          = db.Column(db.String(10), default='student')  # 'student' or 'admin'
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':         self.id,
            'name':       self.name,
            'email':      self.email,
            'role':       self.role,
            'created_at': self.created_at.isoformat()
        }


class ExamSession(db.Model):
    __tablename__ = 'exam_sessions'
    id               = db.Column(db.Integer, primary_key=True)
    session_id       = db.Column(db.String(50), unique=True, nullable=False)
    student_id       = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    student_name     = db.Column(db.String(100))
    exam_name        = db.Column(db.String(200))
    start_time       = db.Column(db.DateTime, default=datetime.utcnow)
    end_time         = db.Column(db.DateTime, nullable=True)
    integrity_score  = db.Column(db.Integer, default=100)
    total_violations = db.Column(db.Integer, default=0)
    high_violations  = db.Column(db.Integer, default=0)
    medium_violations= db.Column(db.Integer, default=0)
    tab_switches     = db.Column(db.Integer, default=0)
    status           = db.Column(db.String(20), default='active')  # active | completed

    student = db.relationship('User', backref='sessions', lazy=True)

    def to_dict(self):
        return {
            'id':               self.id,
            'session_id':       self.session_id,
            'student_name':     self.student_name,
            'exam_name':        self.exam_name,
            'start_time':       self.start_time.isoformat() if self.start_time else None,
            'end_time':         self.end_time.isoformat() if self.end_time else None,
            'integrity_score':  self.integrity_score,
            'total_violations': self.total_violations,
            'high_violations':  self.high_violations,
            'medium_violations':self.medium_violations,
            'tab_switches':     self.tab_switches,
            'status':           self.status,
        }


class ViolationLog(db.Model):
    __tablename__ = 'violation_logs'
    id           = db.Column(db.Integer, primary_key=True)
    session_id   = db.Column(db.String(50), db.ForeignKey('exam_sessions.session_id'))
    type         = db.Column(db.String(50))
    severity     = db.Column(db.String(10))
    message      = db.Column(db.String(200))
    timestamp    = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':        self.id,
            'type':      self.type,
            'severity':  self.severity,
            'message':   self.message,
            'timestamp': self.timestamp.isoformat()
        }