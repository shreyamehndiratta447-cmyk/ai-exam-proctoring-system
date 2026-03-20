from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, jwt_required, get_jwt_identity, get_jwt
import cv2
import numpy as np
import base64
import time
import logging
import os
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ── Config ────────────────────────────────────────────────────────
app.config['SECRET_KEY']                = 'proctor_secret_2024'
app.config['SQLALCHEMY_DATABASE_URI']   = 'sqlite:///proctor.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY']            = 'jwt_proctor_secret_2024'
app.config['JWT_ACCESS_TOKEN_EXPIRES']  = timedelta(hours=24)

CORS(app, origins="*", supports_credentials=True)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# ── Extensions ────────────────────────────────────────────────────
from models import db, User, ExamSession, ViolationLog
db.init_app(app)
jwt = JWTManager(app)

# ── Blueprints ────────────────────────────────────────────────────
from auth import auth_bp
from admin import admin_bp
app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp)

# ── MediaPipe ─────────────────────────────────────────────────────
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions
from mediapipe.tasks.python import BaseOptions

landmarker_options = FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path="face_landmarker.task"),
    num_faces=2,
    min_face_detection_confidence=0.5,
    min_face_presence_confidence=0.5,
    min_tracking_confidence=0.5,
    output_face_blendshapes=False,
    output_facial_transformation_matrixes=True,
)
face_landmarker = FaceLandmarker.create_from_options(landmarker_options)

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
)
logger.info("MediaPipe Tasks API loaded!")

# ── Activity Log File ─────────────────────────────────────────────
LOG_FILE = "activity_log.txt"

def write_activity_log(session_id, student_name, event_type, message):
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] SESSION={session_id} STUDENT={student_name} EVENT={event_type} MSG={message}\n"
    with open(LOG_FILE, "a") as f:
        f.write(line)

# In-memory session store
sessions = {}

# ─── AI HELPERS ────────────────────────────────────────────────────

def decode_image(data_uri):
    try:
        if ',' in data_uri:
            data_uri = data_uri.split(',')[1]
        img_bytes = base64.b64decode(data_uri)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except:
        return None


def detect_faces_opencv(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(30, 30))
    return len(faces)


def get_gaze_direction(landmarks, img_w, img_h):
    try:
        LEFT_IRIS  = [468, 469, 470, 471, 472]
        RIGHT_IRIS = [473, 474, 475, 476, 477]

        def pt(idx):
            lm = landmarks[idx]
            return np.array([lm.x * img_w, lm.y * img_h])

        l_iris = np.mean([pt(i) for i in LEFT_IRIS], axis=0)
        r_iris = np.mean([pt(i) for i in RIGHT_IRIS], axis=0)
        l_width = np.linalg.norm(pt(133) - pt(33)) + 1e-6
        r_width = np.linalg.norm(pt(362) - pt(263)) + 1e-6
        l_ratio = (l_iris[0] - pt(33)[0]) / l_width
        r_ratio = (r_iris[0] - pt(263)[0]) / r_width
        avg = (l_ratio + r_ratio) / 2.0

        if avg < 0.35:   return "LEFT",   round(avg, 3)
        elif avg > 0.65: return "RIGHT",  round(avg, 3)
        else:            return "CENTER", round(avg, 3)
    except:
        return "UNKNOWN", 0.0


def get_head_pose(landmarks, img_w, img_h):
    try:
        def to2d(idx):
            lm = landmarks[idx]
            return np.array([lm.x * img_w, lm.y * img_h], dtype=np.float64)

        image_points = np.array([to2d(1), to2d(152), to2d(33),
                                  to2d(263), to2d(61), to2d(291)], dtype=np.float64)
        model_points = np.array([
            (0.0,0.0,0.0),(0.0,-330.0,-65.0),
            (-225.0,170.0,-135.0),(225.0,170.0,-135.0),
            (-150.0,-150.0,-125.0),(150.0,-150.0,-125.0)
        ])
        cam = np.array([[img_w,0,img_w/2],[0,img_w,img_h/2],[0,0,1]], dtype=np.float64)
        ok, rvec, _ = cv2.solvePnP(model_points, image_points, cam,
                                    np.zeros((4,1)), flags=cv2.SOLVEPNP_ITERATIVE)
        if not ok: return "UNKNOWN", 0, 0, 0
        rmat, _ = cv2.Rodrigues(rvec)
        angles, *_ = cv2.RQDecomp3x3(rmat)
        pitch, yaw, roll = angles[0], angles[1], angles[2]

        if   yaw < -15:  direction = "LEFT"
        elif yaw >  15:  direction = "RIGHT"
        elif pitch < -10: direction = "DOWN"
        elif pitch >  20: direction = "UP"
        else:             direction = "FORWARD"
        return direction, round(pitch,1), round(yaw,1), round(roll,1)
    except:
        return "UNKNOWN", 0, 0, 0


def _update_head_timer(session_id, direction, now):
    s = sessions.setdefault(session_id, {})
    s.setdefault("head_times", {"LEFT":0,"RIGHT":0,"DOWN":0,"UP":0,"MISSING":0})
    s.setdefault("_last_direction", "FORWARD")
    s.setdefault("_last_time", now)
    elapsed = now - s["_last_time"]
    if s["_last_direction"] in s["head_times"]:
        s["head_times"][s["_last_direction"]] += elapsed
    s["_last_direction"] = direction
    s["_last_time"] = now


def analyze_frame(img, session_id):
    h, w, _ = img.shape
    result = {
        "timestamp": datetime.utcnow().isoformat(),
        "face_count": 0, "gaze_direction": "UNKNOWN",
        "gaze_ratio": 0.0, "head_direction": "UNKNOWN",
        "head_pitch": 0, "head_yaw": 0, "head_roll": 0,
        "alerts": [], "violations": []
    }

    face_count = detect_faces_opencv(img)
    result["face_count"] = face_count
    student_name = sessions.get(session_id, {}).get("student_name", "Unknown")

    if face_count == 0:
        result["alerts"].append("NO_FACE_DETECTED")
        result["violations"].append({"type":"NO_FACE","severity":"HIGH","message":"No face detected"})
        _update_head_timer(session_id, "MISSING", time.time())
        write_activity_log(session_id, student_name, "NO_FACE", "No face detected in frame")
        return result

    if face_count > 1:
        result["alerts"].append("MULTIPLE_FACES")
        result["violations"].append({"type":"MULTIPLE_FACES","severity":"HIGH","message":f"{face_count} faces detected"})
        write_activity_log(session_id, student_name, "MULTIPLE_FACES", f"{face_count} faces in frame")

    try:
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        detection_result = face_landmarker.detect(mp_image)

        if detection_result.face_landmarks:
            landmarks = detection_result.face_landmarks[0]

            gaze_dir, gaze_ratio = get_gaze_direction(landmarks, w, h)
            result["gaze_direction"] = gaze_dir
            result["gaze_ratio"] = gaze_ratio

            head_dir, pitch, yaw, roll = get_head_pose(landmarks, w, h)
            result["head_direction"] = head_dir
            result["head_pitch"] = pitch
            result["head_yaw"] = yaw
            result["head_roll"] = roll

            if gaze_dir in ("LEFT", "RIGHT"):
                result["alerts"].append(f"GAZE_{gaze_dir}")
                result["violations"].append({"type":"SUSPICIOUS_GAZE","severity":"MEDIUM","message":f"Gaze {gaze_dir}"})
                write_activity_log(session_id, student_name, "GAZE", f"Gaze detected {gaze_dir}")

            _update_head_timer(session_id, head_dir, time.time())
            head_times = sessions.get(session_id, {}).get("head_times", {})

            for direction in ("LEFT", "RIGHT", "DOWN"):
                duration = head_times.get(direction, 0)
                if duration > 5:
                    result["alerts"].append(f"HEAD_{direction}_PROLONGED")
                    result["violations"].append({"type":f"HEAD_{direction}","severity":"HIGH",
                        "message":f"Head {direction} for {round(duration,1)}s","duration":round(duration,1)})
                    write_activity_log(session_id, student_name, f"HEAD_{direction}", f"{round(duration,1)}s")

            result["head_times"] = {k: round(v,1) for k,v in sessions.get(session_id,{}).get("head_times",{}).items()}
        else:
            result["head_direction"] = "FORWARD"
            result["gaze_direction"] = "CENTER"
    except Exception as e:
        logger.error(f"Landmark error: {e}")
        result["head_direction"] = "FORWARD"
        result["gaze_direction"] = "CENTER"

    return result


# ─── ROUTES ────────────────────────────────────────────────────────

@app.route('/api/health')
def health():
    return jsonify({"status": "ok", "version": "3.0.0", "mode": "MediaPipe Tasks + SQLite + JWT"})


@app.route('/api/session/start', methods=['POST'])
def start_session():
    data = request.json
    sid  = data.get('session_id', f"sess_{int(time.time())}")
    sessions[sid] = {
        "session_id":   sid,
        "student_name": data.get('student_name', 'Unknown'),
        "exam_name":    data.get('exam_name', 'Exam'),
        "start_time":   datetime.utcnow().isoformat(),
        "violations":   [], "tab_switches": 0,
        "head_times":   {"LEFT":0,"RIGHT":0,"DOWN":0,"UP":0,"MISSING":0},
        "_last_direction": "FORWARD", "_last_time": time.time()
    }
    # Save to DB
    with app.app_context():
        try:
            exam = ExamSession(
                session_id=sid,
                student_name=data.get('student_name','Unknown'),
                exam_name=data.get('exam_name','Exam'),
                status='active'
            )
            db.session.add(exam)
            db.session.commit()
        except Exception as e:
            logger.error(f"DB error: {e}")

    write_activity_log(sid, data.get('student_name','Unknown'), "SESSION_START", "Exam session started")
    return jsonify({"success": True, "session_id": sid})


@app.route('/api/session/end', methods=['POST'])
def end_session():
    data    = request.json
    sid     = data.get('session_id')
    session = sessions.get(sid)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    session["end_time"] = datetime.utcnow().isoformat()
    report = generate_report(session)

    # Update DB
    with app.app_context():
        try:
            exam = ExamSession.query.filter_by(session_id=sid).first()
            if exam:
                exam.end_time         = datetime.utcnow()
                exam.integrity_score  = report['integrity_score']
                exam.total_violations = report['total_violations']
                exam.high_violations  = report['high_severity']
                exam.medium_violations= report['medium_severity']
                exam.tab_switches     = report['tab_switches']
                exam.status           = 'completed'
                db.session.commit()

                # Save violations to DB
                for v in session.get("violations", [])[-50:]:
                    vlog = ViolationLog(
                        session_id=sid,
                        type=v.get('type',''),
                        severity=v.get('severity',''),
                        message=v.get('message','')
                    )
                    db.session.add(vlog)
                db.session.commit()
        except Exception as e:
            logger.error(f"DB end error: {e}")

    write_activity_log(sid, session.get('student_name','Unknown'), "SESSION_END",
                       f"Score={report['integrity_score']} Violations={report['total_violations']}")
    return jsonify({"success": True, "report": report})


@app.route('/api/analyze', methods=['POST'])
def analyze():
    data = request.json
    sid  = data.get('session_id')
    img  = decode_image(data.get('frame', ''))
    if img is None:
        return jsonify({"error": "Invalid image"}), 400
    result = analyze_frame(img, sid)
    if sid in sessions and result["violations"]:
        sessions[sid]["violations"].extend(result["violations"])
    return jsonify(result)


@app.route('/api/event/tab-switch', methods=['POST'])
def tab_switch():
    data = request.json
    sid  = data.get('session_id')
    if sid in sessions:
        sessions[sid]["tab_switches"] = sessions[sid].get("tab_switches", 0) + 1
        count = sessions[sid]["tab_switches"]
        write_activity_log(sid, sessions[sid].get('student_name','Unknown'),
                           "TAB_SWITCH", f"Tab switch #{count}")
        return jsonify({"success": True, "count": count})
    return jsonify({"error": "Not found"}), 404


@app.route('/api/event/audio', methods=['POST'])
def audio_event():
    data   = request.json
    sid    = data.get('session_id')
    volume = data.get('volume', 0)
    if sid in sessions and volume > 0.7:
        sessions[sid].setdefault("violations",[]).append({
            "type":"AUDIO_NOISE","severity":"MEDIUM",
            "message":f"High audio: {round(volume*100)}%",
            "timestamp": datetime.utcnow().isoformat()
        })
        write_activity_log(sid, sessions[sid].get('student_name','Unknown'),
                           "AUDIO_NOISE", f"Volume={round(volume*100)}%")
    return jsonify({"success": True})


def generate_report(session):
    v      = session.get("violations", [])
    high   = sum(1 for x in v if x.get("severity") == "HIGH")
    medium = sum(1 for x in v if x.get("severity") == "MEDIUM")
    score  = max(0, 100 - high*10 - medium*3 - session.get("tab_switches",0)*5)
    return {
        "session_id":       session.get("session_id"),
        "student_name":     session.get("student_name"),
        "exam_name":        session.get("exam_name"),
        "start_time":       session.get("start_time"),
        "end_time":         session.get("end_time", datetime.utcnow().isoformat()),
        "total_violations": len(v),
        "high_severity":    high,
        "medium_severity":  medium,
        "tab_switches":     session.get("tab_switches", 0),
        "head_times":       session.get("head_times", {}),
        "integrity_score":  score,
        "violations":       v[-50:]
    }


# ─── SOCKET EVENTS ─────────────────────────────────────────────────

@socketio.on('connect')
def on_connect():
    emit('connected', {'sid': request.sid})

@socketio.on('frame')
def on_frame(data):
    img = decode_image(data.get('frame', ''))
    if img is None: return
    result = analyze_frame(img, data.get('session_id'))
    sid = data.get('session_id')
    if sid in sessions and result["violations"]:
        sessions[sid]["violations"].extend(result["violations"])
    emit('analysis', result)


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        # Create default admin if not exists
        if not User.query.filter_by(email='admin@proctor.ai').first():
            import bcrypt
            hashed = bcrypt.hashpw(b'admin123', bcrypt.gensalt()).decode('utf-8')
            admin = User(name='Admin', email='admin@proctor.ai',
                        password_hash=hashed, role='admin')
            db.session.add(admin)
            db.session.commit()
            logger.info("Default admin created: admin@proctor.ai / admin123")

    logger.info("🚀 Starting AI Proctor Backend v3.0")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, use_reloader=False)