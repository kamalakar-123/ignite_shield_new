import joblib
import pandas as pd
from pathlib import Path

# Construct paths relative to the project root
# Using pathlib to build the path safely
BASE_DIR = Path(__file__).resolve().parent.parent.parent
MODEL_PATH = BASE_DIR / "ml" / "models" / "fire_risk_model.pkl"
LABEL_ENCODER_PATH = BASE_DIR / "ml" / "models" / "label_encoder.pkl"

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
            print("Successfully loaded ML models.")
        except Exception as e:
            print(f"Failed to load ML models: {e}")
            raise RuntimeError(f"Model loading failed: {e}")

def predict_risk(temperature: float, humidity: float, soil_moisture: float, wind_speed: float):
    """
    Takes sensor inputs, constructs DataFrame with exact feature order,
    predicts risk class and returns confidence.
    """
    if model is None or label_encoder is None:
        load_models()
        
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
    
    # Map class names to their probabilities with both Title and UPPERCASE keys
    probabilities = {}
    for name, prob in zip(class_names, probabilities_raw):
        val = round(float(prob), 4)
        probabilities[name] = val
        probabilities[name.upper()] = val

    # Predict the actual class (encoded)
    prediction_encoded = model.predict(input_data)[0]

    # Decode to actual label
    prediction_label = str(label_encoder.inverse_transform([prediction_encoded])[0])
    pred_upper = prediction_label.upper()

    # Probability of the predicted class
    pred_prob = probabilities.get(pred_upper, probabilities.get(prediction_label, float(probabilities_raw[0])))

    return {
        "prediction": pred_upper,
        "fire_risk": prediction_label,
        "probability": pred_prob,
        "confidence": pred_prob,
        "probabilities": probabilities
    }

