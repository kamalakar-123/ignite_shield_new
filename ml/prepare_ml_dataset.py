import pandas as pd
from pathlib import Path


# ============================================================
# IGNITE SHIELD
# PREPARE FINAL ML TRAINING DATASET
# ============================================================

PROJECT_ROOT = Path(
    r"C:\Users\vasan\OneDrive\Desktop\major_project"
)

INPUT_FILE = (
    PROJECT_ROOT
    / "data"
    / "training"
    / "labeled_training_dataset.csv"
)

OUTPUT_FILE = (
    PROJECT_ROOT
    / "data"
    
    / "final_training_dataset.csv"
)


# ============================================================
# COLUMNS REQUIRED FOR MACHINE LEARNING
# ============================================================

ML_COLUMNS = [
    "Temperature (C)",
    "Relative Humidity (%)",
    "Soil Moisture (%)",
    "Wind Speed (m/s)",
    "Fire Catch Level"
]


# ============================================================
# LOAD DATASET
# ============================================================

print("=" * 70)
print("IGNITE SHIELD - FINAL ML DATASET PREPARATION")
print("=" * 70)

df = pd.read_csv(INPUT_FILE)

print("\nOriginal columns:")
print(df.columns.tolist())

print("\nOriginal shape:")
print(df.shape)


# ============================================================
# CHECK REQUIRED COLUMNS
# ============================================================

missing_columns = [
    column
    for column in ML_COLUMNS
    if column not in df.columns
]

if missing_columns:
    raise ValueError(
        f"Missing required columns: {missing_columns}"
    )


# ============================================================
# KEEP ONLY ML FEATURES + TARGET
# ============================================================

df_final = df[ML_COLUMNS].copy()


# ============================================================
# CHECK MISSING VALUES
# ============================================================

print("\nMissing values:")

print(
    df_final.isnull().sum()
)

if df_final.isnull().sum().sum() > 0:
    raise ValueError(
        "Final dataset contains missing values."
    )


# ============================================================
# CHECK DUPLICATES
# ============================================================

duplicates = df_final.duplicated().sum()

print("\nDuplicate rows:", duplicates)


# ============================================================
# CHECK TARGET CLASSES
# ============================================================

print("\nFire Catch Level distribution:")

print(
    df_final["Fire Catch Level"]
    .value_counts()
)


# ============================================================
# SAVE FINAL DATASET
# ============================================================

df_final.to_csv(
    OUTPUT_FILE,
    index=False
)


# ============================================================
# FINAL INFORMATION
# ============================================================

print("\n" + "=" * 70)
print("FINAL ML DATASET CREATED")
print("=" * 70)

print("\nOutput:")
print(OUTPUT_FILE)

print("\nFinal shape:")
print(df_final.shape)

print("\nFinal columns:")

for column in df_final.columns:
    print("-", column)

print("\n✓ Dataset ready for Random Forest training.")