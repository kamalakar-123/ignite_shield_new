import pandas as pd
import joblib

from pathlib import Path


# ============================================================
# IGNITE SHIELD
# FIRE RISK MODEL TESTING
# ============================================================


# ============================================================
# 1. PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(
    r"C:\Users\vasan\OneDrive\Desktop\major_project"
)

MODEL_PATH = (
    PROJECT_ROOT
    / "ml"
    / "models"
    / "fire_risk_model.pkl"
)

LABEL_ENCODER_PATH = (
    PROJECT_ROOT
    / "ml"
    / "models"
    / "label_encoder.pkl"
)


# ============================================================
# 2. FEATURE ORDER
# ============================================================

FEATURES = [
    "Temperature (C)",
    "Relative Humidity (%)",
    "Soil Moisture (%)",
    "Wind Speed (m/s)"
]


# ============================================================
# 3. LOAD MODEL
# ============================================================

print("=" * 70)
print("IGNITE SHIELD - FIRE RISK MODEL TEST")
print("=" * 70)


if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"\nModel not found:\n{MODEL_PATH}"
    )


if not LABEL_ENCODER_PATH.exists():
    raise FileNotFoundError(
        f"\nLabel encoder not found:\n{LABEL_ENCODER_PATH}"
    )


model = joblib.load(MODEL_PATH)

label_encoder = joblib.load(
    LABEL_ENCODER_PATH
)


print("\n✓ Model loaded successfully.")
print("✓ Label encoder loaded successfully.")

print("\nClasses:")

for class_name in label_encoder.classes_:
    print("-", class_name)


# ============================================================
# 4. PREDICTION FUNCTION
# ============================================================

def predict_fire_risk(
    temperature,
    humidity,
    soil_moisture,
    wind_speed
):

    # --------------------------------------------------------
    # Create input DataFrame
    # --------------------------------------------------------

    input_data = pd.DataFrame(
        [[
            temperature,
            humidity,
            soil_moisture,
            wind_speed
        ]],
        columns=FEATURES
    )


    # --------------------------------------------------------
    # Predict class
    # --------------------------------------------------------

    prediction_encoded = model.predict(
        input_data
    )[0]


    # --------------------------------------------------------
    # Convert encoded class to original class
    # --------------------------------------------------------

    prediction = label_encoder.inverse_transform(
        [prediction_encoded]
    )[0]


    # --------------------------------------------------------
    # Get prediction probabilities
    # --------------------------------------------------------

    probabilities = model.predict_proba(
        input_data
    )[0]


    # --------------------------------------------------------
    # Create probability dictionary
    # --------------------------------------------------------

    probability_dict = {}

    for class_name, probability in zip(
        label_encoder.classes_,
        probabilities
    ):

        probability_dict[class_name] = probability


    return prediction, probability_dict


# ============================================================
# 5. CONTINUOUS TESTING
# ============================================================

while True:

    print("\n" + "=" * 70)
    print("ENTER SENSOR VALUES")
    print("=" * 70)

    print("\nEnter 'q' to exit.")


    # ========================================================
    # TEMPERATURE
    # ========================================================

    temperature_input = input(
        "\nTemperature (°C): "
    )

    if temperature_input.lower() == "q":
        break


    # ========================================================
    # HUMIDITY
    # ========================================================

    humidity_input = input(
        "Relative Humidity (%): "
    )

    if humidity_input.lower() == "q":
        break


    # ========================================================
    # SOIL MOISTURE
    # ========================================================

    soil_input = input(
        "Soil Moisture (%): "
    )

    if soil_input.lower() == "q":
        break


    # ========================================================
    # WIND SPEED
    # ========================================================

    wind_input = input(
        "Wind Speed (m/s): "
    )

    if wind_input.lower() == "q":
        break


    # ========================================================
    # CONVERT INPUTS TO FLOAT
    # ========================================================
    #
    # There are NO range restrictions.
    #
    # Examples accepted:
    #
    # Temperature:
    # 27
    # 40
    # 65
    # 78
    # 100
    # -10
    #
    # Humidity:
    # Any numeric value
    #
    # Soil Moisture:
    # Any numeric value
    #
    # Wind Speed:
    # Any numeric value
    #
    # The only requirement is that the input must
    # be a valid number.
    # ========================================================

    try:

        temperature = float(
            temperature_input
        )

        humidity = float(
            humidity_input
        )

        soil_moisture = float(
            soil_input
        )

        wind_speed = float(
            wind_input
        )

    except ValueError:

        print(
            "\n❌ Invalid input."
        )

        print(
            "Please enter numeric values only."
        )

        continue


    # ========================================================
    # PREDICTION
    # ========================================================

    prediction, probabilities = predict_fire_risk(

        temperature,
        humidity,
        soil_moisture,
        wind_speed

    )


    # ========================================================
    # DISPLAY SENSOR DATA
    # ========================================================

    print("\n" + "=" * 70)
    print("SENSOR DATA")
    print("=" * 70)

    print(
        f"\nTemperature       : {temperature:.2f} °C"
    )

    print(
        f"Relative Humidity : {humidity:.2f} %"
    )

    print(
        f"Soil Moisture     : {soil_moisture:.2f} %"
    )

    print(
        f"Wind Speed        : {wind_speed:.2f} m/s"
    )


    # ========================================================
    # DISPLAY FIRE RISK
    # ========================================================

    print("\n" + "=" * 70)
    print("FIRE RISK PREDICTION")
    print("=" * 70)


    if prediction == "Low":

        print(
            "\n🔥 Fire Catch Level : 🟢 LOW"
        )

    elif prediction == "Medium":

        print(
            "\n🔥 Fire Catch Level : 🟡 MEDIUM"
        )

    elif prediction == "High":

        print(
            "\n🔥 Fire Catch Level : 🔴 HIGH"
        )

    else:

        print(
            f"\n🔥 Fire Catch Level : {prediction}"
        )


    # ========================================================
    # DISPLAY PROBABILITIES
    # ========================================================

    print("\nPrediction probabilities:")

    for class_name in label_encoder.classes_:

        probability = (
            probabilities[class_name]
            * 100
        )

        print(
            f"{class_name:<10}: "
            f"{probability:.2f}%"
        )


    # ========================================================
    # CONFIDENCE
    # ========================================================

    confidence = (
        probabilities[prediction]
        * 100
    )

    print(
        f"\nConfidence: {confidence:.2f}%"
    )


    print("\n" + "=" * 70)