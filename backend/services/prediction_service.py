import joblib
import logging
import pandas as pd
from pathlib import Path

logger = logging.getLogger("ignite_shield.prediction")

# Construct paths relative to the project root with container fallbacks
BASE_DIR = Path(__file__).resolve().parent.parent.parent
MODEL_PATH = BASE_DIR / "ml" / "models" / "fire_risk_model.pkl"
LABEL_ENCODER_PATH = BASE_DIR / "ml" / "models" / "label_encoder.pkl"

if not MODEL_PATH.exists():
    alt_base = Path(__file__).resolve().parent.parent
    if (alt_base / "ml" / "models" / "fire_risk_model.pkl").exists():
        MODEL_PATH = alt_base / "ml" / "models" / "fire_risk_model.pkl"
        LABEL_ENCODER_PATH = alt_base / "ml" / "models" / "label_encoder.pkl"
    elif Path("/app/ml/models/fire_risk_model.pkl").exists():
        MODEL_PATH = Path("/app/ml/models/fire_risk_model.pkl")
        LABEL_ENCODER_PATH = Path("/app/ml/models/label_encoder.pkl")

# Initialize variables
model = None
label_encoder = None

def load_models():
    """Load the model and label encoder ONCE."""
    global model, label_encoder
    if model is None or label_encoder is None:
        try:
            model = joblib.load(MODEL_PATH)
            label_encoder = joblib.load(LABEL_ENCODER_PATH)
            logger.info("Successfully loaded ML models.")
        except Exception as e:
            logger.error(f"Failed to load ML models: {e}")
            raise RuntimeError(f"Model loading failed: {e}")

def predict_risk(temperature: float, humidity: float, soil_moisture: float, wind_speed: float):
    """
    Takes sensor inputs, constructs DataFrame with exact feature order,
    predicts risk class and returns confidence.
    """
    if model is None or label_encoder is None:
        load_models()
        
    logger.info("Running fire risk prediction...")

    # The feature order MUST remain exactly:
    # "Temperature (C)", "Relative Humidity (%)", "Soil Moisture (%)", "Wind Speed (m/s)"
    input_data = pd.DataFrame([{
        "Temperature (C)": temperature,
        "Relative Humidity (%)": humidity,
        "Soil Moisture (%)": soil_moisture,
        "Wind Speed (m/s)": wind_speed
    }])
    
    # Predict probabilities for all classes
    probabilities_raw = model.predict_proba(input_data)[0]
    
    # Get the class names corresponding to the probabilities
    class_indices = model.classes_
    class_names = label_encoder.inverse_transform(class_indices)
    
    # Map class names to their probabilities (percentages and decimals)
    probabilities = {}
    for name, prob in zip(class_names, probabilities_raw):
        val = round(float(prob), 4)
        pct = round(float(prob) * 100, 2)
        probabilities[str(name)] = val
        probabilities[str(name).upper()] = pct

    # Predict the actual class (encoded)
    prediction_encoded = model.predict(input_data)[0]

    # Decode to actual label
    prediction_label = str(label_encoder.inverse_transform([prediction_encoded])[0])
    pred_upper = prediction_label.upper()

    # Raw probability of predicted class
    pred_idx = list(class_indices).index(prediction_encoded) if prediction_encoded in class_indices else 0
    raw_class_prob = float(probabilities_raw[pred_idx])
    
    # Actual confidence percentage (e.g. 91.25)
    confidence_pct = round(raw_class_prob * 100, 2)

    logger.info(f"Prediction: {pred_upper} (Confidence: {confidence_pct}%)")

    return {
        "prediction": pred_upper,
        "fire_risk": pred_upper,
        "confidence": confidence_pct,
        "probability": confidence_pct,
        "raw_confidence": raw_class_prob,
        "probabilities": probabilities
    }

