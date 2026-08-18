import pandas as pd
import joblib

from pathlib import Path

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier

from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    confusion_matrix
)


# ============================================================
# IGNITE SHIELD
# RANDOM FOREST FIRE CATCH LEVEL MODEL
# ============================================================


# ============================================================
# 1. PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(
    r"C:\Users\vasan\OneDrive\Desktop\major_project"
)

DATASET_PATH = (
    PROJECT_ROOT
    / "data"
    / "final_training_dataset.csv"
)

MODEL_DIR = (
    PROJECT_ROOT
    / "ml"
    / "models"
)

MODEL_PATH = (
    MODEL_DIR
    / "fire_risk_model.pkl"
)

LABEL_ENCODER_PATH = (
    MODEL_DIR
    / "label_encoder.pkl"
)

TESTING_DIR = (
    PROJECT_ROOT
    / "data"
    / "testing"
)

TESTING_RESULTS_PATH = (
    TESTING_DIR
    / "test_predictions_5952.csv"
)


# ============================================================
# 2. FEATURES AND TARGET
# ============================================================

FEATURES = [
    "Temperature (C)",
    "Relative Humidity (%)",
    "Soil Moisture (%)",
    "Wind Speed (m/s)"
]

TARGET = "Fire Catch Level"


# ============================================================
# 3. CREATE DIRECTORIES
# ============================================================

MODEL_DIR.mkdir(
    parents=True,
    exist_ok=True
)

TESTING_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# 4. LOAD DATASET
# ============================================================

print("=" * 70)
print("IGNITE SHIELD - RANDOM FOREST TRAINING")
print("=" * 70)

print("\nLoading dataset:")
print(DATASET_PATH)

if not DATASET_PATH.exists():

    raise FileNotFoundError(
        f"\nDataset not found:\n{DATASET_PATH}"
    )


df = pd.read_csv(
    DATASET_PATH
)


print("\nDataset loaded successfully.")

print(
    "Total records:",
    len(df)
)

print(
    "Total columns:",
    len(df.columns)
)


# ============================================================
# 5. CHECK REQUIRED COLUMNS
# ============================================================

required_columns = FEATURES + [TARGET]

missing_columns = [
    column
    for column in required_columns
    if column not in df.columns
]

if missing_columns:

    raise ValueError(
        f"\nMissing required columns: {missing_columns}"
    )


# ============================================================
# 6. CHECK MISSING VALUES
# ============================================================

print("\n" + "=" * 70)
print("MISSING VALUE CHECK")
print("=" * 70)

missing_values = df[
    required_columns
].isnull().sum()

print(
    missing_values
)

total_missing = (
    missing_values.sum()
)

if total_missing > 0:

    raise ValueError(
        f"\nDataset contains {total_missing} missing values."
    )

print(
    "\n✓ No missing values found."
)


# ============================================================
# 7. PREPARE FEATURES AND TARGET
# ============================================================

X = df[
    FEATURES
]

y = df[
    TARGET
]


print("\n" + "=" * 70)
print("FEATURES AND TARGET")
print("=" * 70)

print("\nFeatures:")

for feature in FEATURES:

    print(
        "-",
        feature
    )


print("\nTarget:")

print(
    "-",
    TARGET
)


# ============================================================
# 8. CLASS DISTRIBUTION
# ============================================================

print("\n" + "=" * 70)
print("CLASS DISTRIBUTION")
print("=" * 70)

class_counts = y.value_counts()

print(
    class_counts
)

print("\nClass percentages:")

class_percentages = (
    y.value_counts(
        normalize=True
    ) * 100
).round(2)

print(
    class_percentages
)


# ============================================================
# 9. ENCODE TARGET
# ============================================================

label_encoder = LabelEncoder()

y_encoded = label_encoder.fit_transform(
    y
)


print("\n" + "=" * 70)
print("LABEL ENCODING")
print("=" * 70)

for class_number, class_name in enumerate(
    label_encoder.classes_
):

    print(
        f"{class_name} -> {class_number}"
    )


# ============================================================
# 10. TRAIN / TEST SPLIT
# ============================================================
#
# Total:
# 29,760
#
# Training:
# 80% = 23,808
#
# Testing:
# 20% = 5,952
#
# Stratified split keeps class proportions similar.
# ============================================================

X_train, X_test, y_train, y_test = train_test_split(

    X,
    y_encoded,

    test_size=0.20,

    random_state=42,

    stratify=y_encoded
)


print("\n" + "=" * 70)
print("TRAIN / TEST SPLIT")
print("=" * 70)

print(
    "\nTotal records      :",
    len(df)
)

print(
    "Training records   :",
    len(X_train)
)

print(
    "Testing records    :",
    len(X_test)
)


# ============================================================
# 11. VERIFY TESTING RECORD COUNT
# ============================================================

EXPECTED_TEST_RECORDS = 5952

if len(X_test) != EXPECTED_TEST_RECORDS:

    raise ValueError(
        f"\nExpected {EXPECTED_TEST_RECORDS} "
        f"testing records, but got {len(X_test)}."
    )

print(
    "\n✓ Exactly 5,952 records are reserved for testing."
)


# ============================================================
# 12. CREATE RANDOM FOREST
# ============================================================

model = RandomForestClassifier(

    n_estimators=300,

    max_depth=None,

    min_samples_split=2,

    min_samples_leaf=1,

    max_features="sqrt",

    class_weight="balanced",

    random_state=42,

    n_jobs=-1
)


print("\n" + "=" * 70)
print("RANDOM FOREST CONFIGURATION")
print("=" * 70)

print(
    "\nNumber of trees:",
    model.n_estimators
)

print(
    "Class weight:",
    model.class_weight
)

print(
    "Random state:",
    model.random_state
)


# ============================================================
# 13. TRAIN MODEL
# ============================================================

print("\n" + "=" * 70)
print("TRAINING MODEL")
print("=" * 70)

model.fit(
    X_train,
    y_train
)

print(
    "\n✓ Random Forest training completed."
)


# ============================================================
# 14. TRAINING PREDICTIONS
# ============================================================

y_train_pred = model.predict(
    X_train
)


# ============================================================
# 15. TRAINING ACCURACY
# ============================================================

training_accuracy = accuracy_score(
    y_train,
    y_train_pred
)


print("\n" + "=" * 70)
print("TRAINING PERFORMANCE")
print("=" * 70)

print(
    f"\nTraining records tested : {len(X_train)}"
)

print(
    f"Training correct        : "
    f"{(y_train == y_train_pred).sum()}"
)

print(
    f"Training incorrect      : "
    f"{(y_train != y_train_pred).sum()}"
)

print(
    f"\nTraining Accuracy       : "
    f"{training_accuracy:.4f}"
)

print(
    f"Training Accuracy       : "
    f"{training_accuracy * 100:.2f}%"
)


# ============================================================
# 16. TEST ALL 5,952 RECORDS
# ============================================================
#
# IMPORTANT:
#
# model.predict(X_test)
#
# predicts EVERY record in X_test.
#
# X_test contains exactly 5,952 records.
# ============================================================

print("\n" + "=" * 70)
print("TESTING ALL 5,952 RECORDS")
print("=" * 70)

y_pred = model.predict(
    X_test
)


print(
    "\nTotal testing records:",
    len(X_test)
)

print(
    "Total predictions:",
    len(y_pred)
)


# ============================================================
# 17. VERIFY ALL TEST RECORDS WERE PREDICTED
# ============================================================

if len(y_pred) != 5952:

    raise ValueError(
        f"\nExpected 5,952 predictions, "
        f"but received {len(y_pred)}."
    )


print(
    "\n✓ All 5,952 testing records were predicted."
)


# ============================================================
# 18. COUNT CORRECT / INCORRECT PREDICTIONS
# ============================================================

correct_predictions = (
    y_test == y_pred
).sum()

incorrect_predictions = (
    y_test != y_pred
).sum()


# ============================================================
# 19. TESTING ACCURACY
# ============================================================

testing_accuracy = accuracy_score(
    y_test,
    y_pred
)


print("\n" + "=" * 70)
print("TESTING PERFORMANCE - 5,952 RECORDS")
print("=" * 70)

print(
    f"\nTesting records       : {len(X_test)}"
)

print(
    f"Correct predictions   : {correct_predictions}"
)

print(
    f"Incorrect predictions : {incorrect_predictions}"
)

print(
    f"\nTesting Accuracy      : "
    f"{testing_accuracy:.4f}"
)

print(
    f"Testing Accuracy      : "
    f"{testing_accuracy * 100:.2f}%"
)


# ============================================================
# 20. PRECISION / RECALL / F1
# ============================================================

precision = precision_score(

    y_test,
    y_pred,

    average="weighted",

    zero_division=0
)


recall = recall_score(

    y_test,
    y_pred,

    average="weighted",

    zero_division=0
)


f1 = f1_score(

    y_test,
    y_pred,

    average="weighted",

    zero_division=0
)


print("\n" + "=" * 70)
print("TESTING METRICS")
print("=" * 70)

print(
    f"\nAccuracy  : {testing_accuracy:.4f}"
)

print(
    f"Precision : {precision:.4f}"
)

print(
    f"Recall    : {recall:.4f}"
)

print(
    f"F1 Score  : {f1:.4f}"
)


# ============================================================
# 21. CLASSIFICATION REPORT
# ============================================================

print("\n" + "=" * 70)
print("CLASSIFICATION REPORT - ALL 5,952 TEST RECORDS")
print("=" * 70)

print(
    classification_report(

        y_test,

        y_pred,

        target_names=label_encoder.classes_,

        zero_division=0
    )
)


# ============================================================
# 22. CONFUSION MATRIX
# ============================================================

cm = confusion_matrix(

    y_test,

    y_pred
)


print("\n" + "=" * 70)
print("CONFUSION MATRIX - 5,952 TEST RECORDS")
print("=" * 70)

print(
    "\nRows    = Actual"
)

print(
    "Columns = Predicted\n"
)


confusion_df = pd.DataFrame(

    cm,

    index=[
        f"Actual {class_name}"
        for class_name in label_encoder.classes_
    ],

    columns=[
        f"Predicted {class_name}"
        for class_name in label_encoder.classes_
    ]
)


print(
    confusion_df
)


# ============================================================
# 23. FEATURE IMPORTANCE
# ============================================================

importance = pd.DataFrame({

    "Feature": FEATURES,

    "Importance": model.feature_importances_

})


importance = importance.sort_values(

    by="Importance",

    ascending=False
)


print("\n" + "=" * 70)
print("FEATURE IMPORTANCE")
print("=" * 70)

print(
    importance.to_string(
        index=False
    )
)


# ============================================================
# 24. CREATE TEST PREDICTION DATASET
# ============================================================
#
# Save every one of the 5,952 testing records.
# ============================================================

test_results = X_test.copy()


# ------------------------------------------------------------
# Actual class
# ------------------------------------------------------------

test_results[
    "Actual Fire Catch Level"
] = label_encoder.inverse_transform(
    y_test
)


# ------------------------------------------------------------
# Predicted class
# ------------------------------------------------------------

test_results[
    "Predicted Fire Catch Level"
] = label_encoder.inverse_transform(
    y_pred
)


# ------------------------------------------------------------
# Correct / Incorrect
# ------------------------------------------------------------

test_results[
    "Prediction Correct"
] = (

    test_results[
        "Actual Fire Catch Level"
    ]

    ==

    test_results[
        "Predicted Fire Catch Level"
    ]

)


# ============================================================
# 25. PREDICTION PROBABILITIES
# ============================================================

probabilities = model.predict_proba(
    X_test
)


for index, class_name in enumerate(
    label_encoder.classes_
):

    test_results[
        f"{class_name} Probability"
    ] = (
        probabilities[:, index]
    )


# ============================================================
# 26. SAVE ALL 5,952 TEST PREDICTIONS
# ============================================================

test_results.to_csv(

    TESTING_RESULTS_PATH,

    index=False
)


# ============================================================
# 27. VERIFY SAVED TEST FILE
# ============================================================

saved_test_data = pd.read_csv(
    TESTING_RESULTS_PATH
)


print("\n" + "=" * 70)
print("TEST RESULTS SAVED")
print("=" * 70)

print(
    "\nTesting result file:"
)

print(
    TESTING_RESULTS_PATH
)

print(
    "\nRecords saved:",
    len(saved_test_data)
)


if len(saved_test_data) == 5952:

    print(
        "\n✓ All 5,952 test predictions "
        "were saved successfully."
    )

else:

    print(
        "\n⚠ Warning: saved test record count "
        "is not 5,952."
    )


# ============================================================
# 28. SAVE MODEL
# ============================================================

joblib.dump(

    model,

    MODEL_PATH
)


# ============================================================
# 29. SAVE LABEL ENCODER
# ============================================================

joblib.dump(

    label_encoder,

    LABEL_ENCODER_PATH
)


# ============================================================
# 30. FINAL SUMMARY
# ============================================================

print("\n" + "=" * 70)
print("IGNITE SHIELD - TRAINING COMPLETED")
print("=" * 70)

print("\nDATASET:")

print(
    "Total records       :",
    len(df)
)

print(
    "Training records    :",
    len(X_train)
)

print(
    "Testing records     :",
    len(X_test)
)


print("\nTRAINING:")

print(
    f"Training accuracy   : "
    f"{training_accuracy * 100:.2f}%"
)


print("\nTESTING:")

print(
    "Testing records     :",
    len(X_test)
)

print(
    "Correct predictions :",
    correct_predictions
)

print(
    "Incorrect predictions:",
    incorrect_predictions
)

print(
    f"Testing accuracy    : "
    f"{testing_accuracy * 100:.2f}%"
)


print("\nMODEL:")

print(
    "Model:",
    MODEL_PATH
)

print(
    "Label encoder:",
    LABEL_ENCODER_PATH
)


print("\nTEST RESULTS:")

print(
    TESTING_RESULTS_PATH
)


print("\n" + "=" * 70)
print("✓ ALL 5,952 TEST RECORDS WERE EVALUATED")
print("=" * 70)