from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt
from models import db, ExamSession, ViolationLog, User
import logging

logger = logging.getLogger(__name__)
admin_bp = Blueprint('admin', __name__)


def admin_required():
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"error": "Admin access required"}), 403
    return None


@admin_bp.route('/api/admin/dashboard', methods=['GET'])
@jwt_required()
def dashboard():
    err = admin_required()
    if err: return err

    total_students  = User.query.filter_by(role='student').count()
    total_sessions  = ExamSession.query.count()
    active_sessions = ExamSession.query.filter_by(status='active').count()
    avg_score = db.session.query(
        db.func.avg(ExamSession.integrity_score)
    ).filter(ExamSession.status == 'completed').scalar()

    return jsonify({
        "total_students":  total_students,
        "total_sessions":  total_sessions,
        "active_sessions": active_sessions,
        "average_score":   round(float(avg_score or 0), 1),
    })


@admin_bp.route('/api/admin/sessions', methods=['GET'])
@jwt_required()
def get_sessions():
    err = admin_required()
    if err: return err

    status = request.args.get('status')
    query  = ExamSession.query.order_by(ExamSession.start_time.desc())
    if status:
        query = query.filter_by(status=status)

    sessions = query.limit(100).all()
    return jsonify([s.to_dict() for s in sessions])


@admin_bp.route('/api/admin/sessions/<session_id>/violations', methods=['GET'])
@jwt_required()
def get_violations(session_id):
    err = admin_required()
    if err: return err

    violations = ViolationLog.query.filter_by(
        session_id=session_id
    ).order_by(ViolationLog.timestamp.desc()).limit(100).all()

    return jsonify([v.to_dict() for v in violations])


@admin_bp.route('/api/admin/students', methods=['GET'])
@jwt_required()
def get_students():
    err = admin_required()
    if err: return err

    students = User.query.filter_by(role='student').all()
    result = []
    for s in students:
        sessions = ExamSession.query.filter_by(student_id=s.id).all()
        avg = sum(x.integrity_score for x in sessions) / len(sessions) if sessions else 0
        result.append({
            **s.to_dict(),
            "total_exams":  len(sessions),
            "average_score": round(avg, 1)
        })
    return jsonify(result)