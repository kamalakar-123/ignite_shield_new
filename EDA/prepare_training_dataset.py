import pandas as pd
from pathlib import Path


# ============================================================
# IGNITE SHIELD
# PREPARE DATASET FOR TRAINING
# ============================================================


# ============================================================
# 1. PROJECT PATH
# ============================================================

# Current file:
# major_project/EDA/prepare_training_dataset.py
#
# Project root:
# major_project/

BASE_DIR = Path(__file__).resolve().parent.parent


# Input:
# major_project/data/forest_fire_dataset.csv

INPUT_FILE = (
    BASE_DIR
    / "data"
    / "forest_fire_dataset.csv"
)


# Output:
# major_project/data/training/ready_to_training_dataset.csv

OUTPUT_FILE = (
    BASE_DIR
    / "data"
    / "training"
    / "ready_to_training_dataset.csv"
)


# ============================================================
# 2. CREATE TRAINING FOLDER
# ============================================================

OUTPUT_FILE.parent.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# 3. LOAD DATASET
# ============================================================

print("=" * 70)
print("IGNITE SHIELD - DATASET PREPARATION")
print("=" * 70)

print("\nLoading dataset:")
print(INPUT_FILE)

df = pd.read_csv(INPUT_FILE)

print("\nOriginal Shape:")
print(df.shape)

print("\nOriginal Columns:")
print(df.columns.tolist())


# ============================================================
# 4. REMOVE TIMESTAMP
# ============================================================

columns_to_remove = [
    "Timestamp",
    "Hour",
    "Day",
    "Month"
]

existing_columns = [
    column
    for column in columns_to_remove
    if column in df.columns
]

df.drop(
    columns=existing_columns,
    inplace=True
)

print("\nRemoved columns:")
print(existing_columns)


# ============================================================
# 5. DEFINE SENSOR FEATURES
# ============================================================

sensor_columns = [
    "Temperature (C)",
    "Relative Humidity (%)",
    "Soil Moisture (%)",
    "Wind Speed (m/s)"
]


# ============================================================
# 6. CHECK REQUIRED COLUMNS
# ============================================================

missing_columns = [
    column
    for column in sensor_columns
    if column not in df.columns
]

if missing_columns:

    raise ValueError(
        f"Required columns are missing: {missing_columns}"
    )


# ============================================================
# 7. KEEP ONLY SENSOR FEATURES
# ============================================================

df = df[sensor_columns].copy()


# ============================================================
# 8. CONVERT SENSOR VALUES TO NUMERIC
# ============================================================

for column in sensor_columns:

    df[column] = pd.to_numeric(
        df[column],
        errors="coerce"
    )


# ============================================================
# 9. REMOVE MISSING-VALUE ROWS
# ============================================================

print("\n" + "=" * 70)
print("MISSING VALUE ANALYSIS")
print("=" * 70)

print("\nMissing values:")
print(df.isnull().sum())

missing_rows = df.isnull().any(axis=1).sum()

print(
    "\nRows containing missing values:",
    missing_rows
)

rows_before = len(df)

df.dropna(
    inplace=True
)

rows_after = len(df)

print(
    "Rows removed:",
    rows_before - rows_after
)


# ============================================================
# 10. REMOVE DUPLICATE ROWS
# ============================================================

print("\n" + "=" * 70)
print("DUPLICATE ANALYSIS")
print("=" * 70)

duplicate_rows = df.duplicated().sum()

print(
    "Duplicate rows found:",
    duplicate_rows
)

df.drop_duplicates(
    keep="first",
    inplace=True
)


# ============================================================
# 11. RESET INDEX
# ============================================================

df.reset_index(
    drop=True,
    inplace=True
)


# ============================================================
# 12. FINAL VALIDATION
# ============================================================

print("\n" + "=" * 70)
print("FINAL DATASET VALIDATION")
print("=" * 70)

print("\nFinal Shape:")
print(df.shape)

print("\nFinal Columns:")

for column in df.columns:
    print("-", column)

print("\nMissing Values:")
print(df.isnull().sum())

print(
    "\nTotal Missing Values:",
    df.isnull().sum().sum()
)

print(
    "Duplicate Rows:",
    df.duplicated().sum()
)


# ============================================================
# 13. STATISTICAL SUMMARY
# ============================================================

print("\n" + "=" * 70)
print("STATISTICAL SUMMARY")
print("=" * 70)

print(
    df.describe().round(2)
)


# ============================================================
# 14. SAVE READY-TO-TRAIN DATASET
# ============================================================

df.to_csv(
    OUTPUT_FILE,
    index=False
)


# ============================================================
# 15. COMPLETION
# ============================================================

print("\n" + "=" * 70)
print("DATASET PREPARATION COMPLETED")
print("=" * 70)

print("\nInput:")
print(INPUT_FILE)

print("\nOutput:")
print(OUTPUT_FILE)

print("\nFinal Rows:")
print(len(df))

print("\nFinal Columns:")
print(len(df.columns))

print("\nReady-to-training features:")

for column in df.columns:
    print("-", column)