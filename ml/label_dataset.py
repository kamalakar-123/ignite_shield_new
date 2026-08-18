import pandas as pd
from pathlib import Path


# ============================================================
# IGNITE SHIELD
# FIRE CATCH LEVEL LABEL GENERATION
# ============================================================


# ============================================================
# 1. PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(
    r"C:\Users\vasan\OneDrive\Desktop\major_project"
)

INPUT_FILE = (
    PROJECT_ROOT
    / "data"
    / "training"
    / "ready_to_training_dataset.csv"
)

OUTPUT_FILE = (
    PROJECT_ROOT
    / "data"
    / "training"
    / "labeled_training_dataset.csv"
)


# ============================================================
# 2. REQUIRED SENSOR FEATURES
# ============================================================

FEATURES = [
    "Temperature (C)",
    "Relative Humidity (%)",
    "Soil Moisture (%)",
    "Wind Speed (m/s)"
]


# ============================================================
# 3. LOAD DATASET
# ============================================================

print("=" * 70)
print("IGNITE SHIELD - FIRE CATCH LEVEL LABEL GENERATION")
print("=" * 70)

print("\nInput file:")
print(INPUT_FILE)

if not INPUT_FILE.exists():
    raise FileNotFoundError(
        f"\nDataset not found:\n{INPUT_FILE}"
    )

df = pd.read_csv(INPUT_FILE)

print("\nDataset loaded successfully.")
print("Rows:", len(df))
print("Columns:", len(df.columns))


# ============================================================
# 4. CHECK REQUIRED FEATURES
# ============================================================

missing_columns = [
    column
    for column in FEATURES
    if column not in df.columns
]

if missing_columns:
    raise ValueError(
        f"\nMissing required columns: {missing_columns}"
    )


# ============================================================
# 5. CHECK MISSING VALUES
# ============================================================

print("\n" + "=" * 70)
print("MISSING VALUE CHECK")
print("=" * 70)

missing_values = df[FEATURES].isnull().sum()

print(missing_values)

total_missing = missing_values.sum()

if total_missing > 0:
    raise ValueError(
        f"\nDataset contains {total_missing} missing values."
        "\nRun the EDA/preprocessing step first."
    )

print("\n✓ No missing values found.")


# ============================================================
# 6. TEMPERATURE RISK SCORE
# ============================================================
#
# Higher temperature = higher fire risk.
#
# <= 29°C       → 0
# 30–32°C       → 25
# 33–35°C       → 50
# 36–38°C       → 75
# 39–40°C       → 100
# ============================================================

def temperature_risk(temp):

    if temp <= 29:
        return 0

    elif temp <= 32:
        return 25

    elif temp <= 35:
        return 50

    elif temp <= 38:
        return 75

    else:
        return 100


df["Temperature Risk"] = (
    df["Temperature (C)"]
    .apply(temperature_risk)
)


# ============================================================
# 7. HUMIDITY RISK SCORE
# ============================================================
#
# Lower humidity = higher fire risk.
#
# >= 70%       → 0
# 60–69%       → 20
# 50–59%       → 40
# 40–49%       → 60
# 30–39%       → 80
# < 30%        → 100
# ============================================================

def humidity_risk(humidity):

    if humidity >= 70:
        return 0

    elif humidity >= 60:
        return 20

    elif humidity >= 50:
        return 40

    elif humidity >= 40:
        return 60

    elif humidity >= 30:
        return 80

    else:
        return 100


df["Humidity Risk"] = (
    df["Relative Humidity (%)"]
    .apply(humidity_risk)
)


# ============================================================
# 8. SOIL MOISTURE RISK SCORE
# ============================================================
#
# Lower soil moisture = higher fire risk.
#
# >= 60%       → 0
# 50–59%       → 20
# 40–49%       → 40
# 30–39%       → 60
# 20–29%       → 80
# < 20%        → 100
# ============================================================

def soil_moisture_risk(moisture):

    if moisture >= 60:
        return 0

    elif moisture >= 50:
        return 20

    elif moisture >= 40:
        return 40

    elif moisture >= 30:
        return 60

    elif moisture >= 20:
        return 80

    else:
        return 100


df["Soil Moisture Risk"] = (
    df["Soil Moisture (%)"]
    .apply(soil_moisture_risk)
)


# ============================================================
# 9. WIND SPEED RISK SCORE
# ============================================================
#
# Wind is a supporting factor for fire-catch prediction.
#
# < 1 m/s      → 0
# 1–1.9 m/s    → 20
# 2–2.9 m/s    → 40
# 3–3.9 m/s    → 70
# >= 4 m/s     → 100
# ============================================================

def wind_speed_risk(wind):

    if wind < 1:
        return 0

    elif wind < 2:
        return 20

    elif wind < 3:
        return 40

    elif wind < 4:
        return 70

    else:
        return 100


df["Wind Speed Risk"] = (
    df["Wind Speed (m/s)"]
    .apply(wind_speed_risk)
)


# ============================================================
# 10. CALCULATE FIRE RISK SCORE
# ============================================================
#
# Temperature      = 40%
# Humidity         = 25%
# Soil Moisture    = 25%
# Wind Speed       = 10%
#
# Total            = 100%
# ============================================================

df["Fire Risk Score"] = (
    df["Temperature Risk"] * 0.40
    + df["Humidity Risk"] * 0.25
    + df["Soil Moisture Risk"] * 0.25
    + df["Wind Speed Risk"] * 0.10
)

df["Fire Risk Score"] = (
    df["Fire Risk Score"]
    .round(2)
)


# ============================================================
# 11. GENERATE FIRE CATCH LEVEL
# ============================================================
#
# Score 0–29     → LOW
# Score 30–59    → MEDIUM
# Score 60–100   → HIGH
# ============================================================

def generate_fire_level(score):

    if score < 30:
        return "Low"

    elif score < 60:
        return "Medium"

    else:
        return "High"


df["Fire Catch Level"] = (
    df["Fire Risk Score"]
    .apply(generate_fire_level)
)


# ============================================================
# 12. CHECK GENERATED LABELS
# ============================================================

print("\n" + "=" * 70)
print("FIRE CATCH LEVEL DISTRIBUTION")
print("=" * 70)

counts = df["Fire Catch Level"].value_counts()

percentages = (
    df["Fire Catch Level"]
    .value_counts(normalize=True)
    * 100
)

for level in ["Low", "Medium", "High"]:

    count = counts.get(level, 0)
    percentage = percentages.get(level, 0)

    print(
        f"{level:<10}: "
        f"{count:>6} records "
        f"({percentage:>6.2f}%)"
    )


# ============================================================
# 13. SHOW SAMPLE DATA
# ============================================================

print("\n" + "=" * 70)
print("SAMPLE LABELED DATA")
print("=" * 70)

sample_columns = [
    "Temperature (C)",
    "Relative Humidity (%)",
    "Soil Moisture (%)",
    "Wind Speed (m/s)",
    "Temperature Risk",
    "Humidity Risk",
    "Soil Moisture Risk",
    "Wind Speed Risk",
    "Fire Risk Score",
    "Fire Catch Level"
]

print(
    df[sample_columns]
    .head(15)
    .to_string(index=False)
)


# ============================================================
# 14. SHOW HIGHEST-RISK RECORDS
# ============================================================

print("\n" + "=" * 70)
print("HIGHEST-RISK CONDITIONS")
print("=" * 70)

highest_risk = (
    df.sort_values(
        "Fire Risk Score",
        ascending=False
    )
    [sample_columns]
    .head(10)
)

print(
    highest_risk.to_string(index=False)
)


# ============================================================
# 15. SHOW LOWEST-RISK RECORDS
# ============================================================

print("\n" + "=" * 70)
print("LOWEST-RISK CONDITIONS")
print("=" * 70)

lowest_risk = (
    df.sort_values(
        "Fire Risk Score",
        ascending=True
    )
    [sample_columns]
    .head(10)
)

print(
    lowest_risk.to_string(index=False)
)


# ============================================================
# 16. SAVE LABELED DATASET
# ============================================================

df.to_csv(
    OUTPUT_FILE,
    index=False
)


# ============================================================
# 17. FINAL MESSAGE
# ============================================================

print("\n" + "=" * 70)
print("LABEL GENERATION COMPLETED SUCCESSFULLY")
print("=" * 70)

print("\nOutput:")
print(OUTPUT_FILE)

print("\nFinal rows:", len(df))
print("Final columns:", len(df.columns))

print("\nGenerated columns:")
print("- Temperature Risk")
print("- Humidity Risk")
print("- Soil Moisture Risk")
print("- Wind Speed Risk")
print("- Fire Risk Score")
print("- Fire Catch Level")

print("\n✓ Dataset successfully labeled.")