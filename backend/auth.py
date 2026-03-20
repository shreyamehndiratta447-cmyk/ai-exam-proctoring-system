from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
import bcrypt
import logging
from models import db, User

logger = logging.getLogger(__name__)
auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    name     = data.get('name', '').strip()
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')
    role     = data.get('role', 'student')

    if not name or not email or not password:
        return jsonify({"error": "All fields are required"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    if role not in ('student', 'admin'):
        return jsonify({"error": "Invalid role"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409

    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    user = User(name=name, email=email,
                password_hash=hashed.decode('utf-8'), role=role)
    db.session.add(user)
    db.session.commit()

    token = create_access_token(identity=str(user.id),
                                additional_claims={"role": user.role, "name": user.name})
    logger.info(f"New user registered: {email} ({role})")
    return jsonify({"success": True, "token": token, "user": user.to_dict()}), 201


@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    data     = request.json
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"error": "Invalid email or password"}), 401

    if not bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
        return jsonify({"error": "Invalid email or password"}), 401

    token = create_access_token(identity=str(user.id),
                                additional_claims={"role": user.role, "name": user.name})
    logger.info(f"User logged in: {email}")
    return jsonify({"success": True, "token": token, "user": user.to_dict()})


@auth_bp.route('/api/auth/me', methods=['GET'])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user.to_dict())