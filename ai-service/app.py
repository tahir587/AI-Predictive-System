"""
AI Predictive Maintenance - ML Service (Flask)
Endpoint: POST /predict
Uses RandomForestClassifier trained on synthetic maintenance data.
"""

import os
import json
import numpy as np
import pickle
from flask import Flask, request, jsonify
from flask_cors import CORS
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

app = Flask(__name__)
CORS(app)

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model.pkl')

def generate_training_data(n_samples=2000):
    """Generate realistic synthetic training data for predictive maintenance."""
    np.random.seed(42)
    
    X = []
    y = []
    
    # Normal samples (60%)
    n_normal = int(n_samples * 0.6)
    for _ in range(n_normal):
        temp = np.random.normal(35, 5)       # 25-45°C normal
        vib = np.random.choice([0, 1], p=[0.8, 0.2])  # mostly no vibration
        sound = np.random.normal(800, 200)    # low sound
        current = np.random.normal(1.0, 0.3)  # low current
        X.append([temp, vib, sound, current])
        y.append(0)
    
    # Failure samples (40%) - various failure modes
    n_failure = n_samples - n_normal
    for i in range(n_failure):
        mode = i % 5
        if mode == 0:  # Overheating
            temp = np.random.normal(65, 10)
            vib = np.random.choice([0, 1], p=[0.3, 0.7])
            sound = np.random.normal(1500, 300)
            current = np.random.normal(2.0, 0.5)
        elif mode == 1:  # Bearing failure (high vibration + sound)
            temp = np.random.normal(45, 8)
            vib = 1
            sound = np.random.normal(2500, 400)
            current = np.random.normal(1.8, 0.4)
        elif mode == 2:  # Electrical fault (high current)
            temp = np.random.normal(50, 7)
            vib = np.random.choice([0, 1], p=[0.4, 0.6])
            sound = np.random.normal(1800, 350)
            current = np.random.normal(3.5, 0.8)
        elif mode == 3:  # General degradation
            temp = np.random.normal(55, 8)
            vib = 1
            sound = np.random.normal(2000, 300)
            current = np.random.normal(2.5, 0.6)
        else:  # Combined failure
            temp = np.random.normal(70, 12)
            vib = 1
            sound = np.random.normal(3000, 500)
            current = np.random.normal(4.0, 1.0)
        X.append([temp, vib, sound, current])
        y.append(1)
    
    return np.array(X), np.array(y)


def train_model():
    """Train and save the RandomForest model."""
    print("[AI] Generating training data...")
    X, y = generate_training_data(2000)
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    print("[AI] Training RandomForestClassifier...")
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"[AI] Model Accuracy: {accuracy:.4f}")
    print(f"[AI] Feature Importances: temp={model.feature_importances_[0]:.3f}, "
          f"vib={model.feature_importances_[1]:.3f}, "
          f"sound={model.feature_importances_[2]:.3f}, "
          f"current={model.feature_importances_[3]:.3f}")
    print("\n[AI] Classification Report:")
    print(classification_report(y_test, y_pred, target_names=['Normal', 'Failure']))
    
    # Save model
    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(model, f)
    print(f"[AI] Model saved to {MODEL_PATH}")
    
    return model


def load_model():
    """Load model from disk, or train a new one."""
    if os.path.exists(MODEL_PATH):
        print(f"[AI] Loading model from {MODEL_PATH}")
        with open(MODEL_PATH, 'rb') as f:
            return pickle.load(f)
    else:
        print("[AI] No saved model found, training new model...")
        return train_model()


# Load model on startup
model = load_model()


@app.route('/predict', methods=['POST'])
def predict():
    """Predict maintenance need from sensor data."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No JSON data received'}), 400
        
        required = ['temperature', 'vibration', 'sound', 'current']
        for field in required:
            if field not in data:
                return jsonify({'error': f'Missing field: {field}'}), 400
        
        features = np.array([[
            float(data['temperature']),
            float(data['vibration']),
            float(data['sound']),
            float(data['current'])
        ]])
        
        proba = model.predict_proba(features)[0]
        prediction = model.predict(features)[0]
        confidence = float(proba[prediction])
        failure_probability = float(proba[1])
        normal_probability = float(proba[0])
        
        result = {
            'prediction': int(prediction),
            'confidence': round(confidence, 4),
            'label': 'Failure Predicted' if prediction == 1 else 'Normal',
            'failure_probability': round(failure_probability, 4),
            'normal_probability': round(normal_probability, 4),
            'features_received': {
                'temperature': data['temperature'],
                'vibration': data['vibration'],
                'sound': data['sound'],
                'current': data['current']
            }
        }
        
        print(f"[AI] Prediction: {result['label']} (conf: {confidence:.2%})")
        return jsonify(result)
        
    except Exception as e:
        print(f"[AI] Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model': 'RandomForestClassifier'})


@app.route('/', methods=['GET'])
def index():
    return jsonify({
        'service': 'ai-predictive-maintenance',
        'status': 'ok',
        'health': '/health',
        'predict': '/predict',
        'retrain': '/retrain'
    })


@app.route('/retrain', methods=['POST'])
def retrain():
    """Retrain the model."""
    global model
    model = train_model()
    return jsonify({'status': 'Model retrained successfully'})


if __name__ == '__main__':
    print("\n" + "="*50)
    print("  AI Predictive Maintenance - ML Service")
    print("  Running on http://0.0.0.0:5001")
    print("="*50 + "\n")
    app.run(host='0.0.0.0', port=5001, debug=True)
