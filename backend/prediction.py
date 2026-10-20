"""Linear Regression model that predicts delivery duration (minutes).

The model is trained ONCE when the backend starts, on synthetic data.
"""
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

TRAFFIC_LEVELS = {"Low": 0, "Medium": 1, "High": 2}
FEATURES = ["distance_km", "traffic_level", "hour_of_day", "num_stops"]
DEPARTURE_HOUR = 10  # simulated departure time is 10:00


def generate_dataset(rows=300, seed=42):
    rng = np.random.default_rng(seed)  # fixed seed -> repeatable data
    distance = rng.uniform(0.5, 18, rows)
    traffic = rng.integers(0, 3, rows)
    hour = rng.integers(8, 21, rows)
    stops = rng.integers(0, 6, rows)
    # Made-up "true" relationship + random noise
    minutes = 6 + 2.6 * distance + 5.5 * traffic + 0.35 * (hour - 8) + 3.5 * stops \
        + rng.normal(0, 2.5, rows)
    return np.column_stack([distance, traffic, hour, stops]), minutes


def train_model():
    X, y = generate_dataset()
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = LinearRegression().fit(X_train, y_train)
    mae = mean_absolute_error(y_test, model.predict(X_test))
    return model, round(float(mae), 2), len(X_train), len(X_test)


MODEL, MAE, TRAIN_ROWS, TEST_ROWS = train_model()


def predict_duration(distance_km, traffic, stops, hour=DEPARTURE_HOUR):
    row = [[distance_km, TRAFFIC_LEVELS[traffic], hour, stops]]
    return round(float(MODEL.predict(row)[0]), 1)


def format_time(total_minutes):
    total = int(round(total_minutes))
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


def model_info():
    return {"mae": MAE, "train_rows": TRAIN_ROWS, "test_rows": TEST_ROWS,
            "features": FEATURES, "coefficients": [round(float(c), 3) for c in MODEL.coef_],
            "intercept": round(float(MODEL.intercept_), 3)}
