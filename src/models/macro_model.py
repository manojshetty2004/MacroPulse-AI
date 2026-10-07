import numpy as np
import pandas as pd
from matplotlib import pyplot as plt
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit

from project_paths import DATA_DIR, REPORTS_DIR


FEATURE_COLUMNS = ["inflation", "growth", "employment", "rates", "sentiment"]
MODEL_COLUMNS = ["date", *FEATURE_COLUMNS, "macro_score"]


def _write_insufficient_data_reports(
    observed_scores: pd.DataFrame, feature_rows: int
) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    required_rows = 4
    reason = (
        f"Walk-forward evaluation requires at least {required_rows} valid daily "
        f"feature rows; only {feature_rows} are available."
    )
    (REPORTS_DIR / "evaluation_report.md").write_text(
        f"""# Model Evaluation Report

## Status: Not evaluated

{reason}

MAE, RMSE, R², feature importance, and out-of-sample predictions are unavailable.
No model was fitted and no validation results have been fabricated. Add more dated
macro-event history, rebuild the features, and rerun the pipeline.
""",
        encoding="utf-8",
    )

    figure, axis = plt.subplots(figsize=(8, 5))
    axis.text(
        0.5,
        0.5,
        "Unavailable\nInsufficient training history",
        ha="center",
        va="center",
        transform=axis.transAxes,
    )
    axis.set_title("Random Forest Feature Importance")
    axis.set_axis_off()
    figure.tight_layout()
    figure.savefig(REPORTS_DIR / "feature_importance.png", dpi=150)
    plt.close(figure)

    figure, axis = plt.subplots(figsize=(10, 5))
    if not observed_scores.empty:
        axis.plot(
            observed_scores["date"],
            observed_scores["macro_score"],
            label="Observed macro score",
        )
        figure.autofmt_xdate()
        axis.legend()
    axis.text(
        0.5,
        0.5,
        "No validated predictions\nInsufficient training history",
        ha="center",
        va="center",
        transform=axis.transAxes,
    )
    axis.set_title("Walk-Forward Predictions Unavailable")
    axis.set_xlabel("Date")
    axis.set_ylabel("Macro score")
    figure.tight_layout()
    figure.savefig(REPORTS_DIR / "prediction_results.png", dpi=150)
    plt.close(figure)


def train_model() -> dict[str, float] | None:
    """Train and evaluate a next-day macro-score model with walk-forward splits."""
    feature_path = DATA_DIR / "daily_features.csv"
    if not feature_path.exists():
        raise FileNotFoundError(
            f"{feature_path} does not exist. Run feature engineering before model training."
        )

    df = pd.read_csv(feature_path)
    missing_columns = set(MODEL_COLUMNS).difference(df.columns)
    if missing_columns:
        raise ValueError(
            "daily_features.csv is missing required columns: "
            f"{', '.join(sorted(missing_columns))}"
        )

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    for column in [*FEATURE_COLUMNS, "macro_score"]:
        df[column] = pd.to_numeric(df[column], errors="coerce")
    df = df.dropna(subset=MODEL_COLUMNS).sort_values("date").reset_index(drop=True)
    observed_scores = df[["date", "macro_score"]].copy()
    df["target_date"] = df["date"].shift(-1)
    df["target"] = df["macro_score"].shift(-1)
    df = df.dropna(subset=["target", "target_date"]).reset_index(drop=True)

    if len(df) < 3:
        _write_insufficient_data_reports(observed_scores, len(observed_scores))
        print(
            "Model training skipped: walk-forward validation requires at least "
            f"four daily feature rows; found {len(observed_scores)}. "
            f"See {REPORTS_DIR / 'evaluation_report.md'}."
        )
        return None

    X = df[FEATURE_COLUMNS]
    y = df["target"]
    n_splits = min(5, max(2, len(X) // 5), len(X) - 1)
    splitter = TimeSeriesSplit(n_splits=n_splits)

    predictions: list[float] = []
    actuals: list[float] = []
    prediction_dates: list[pd.Timestamp] = []
    fold_metrics: list[tuple[int, float, float]] = []

    for fold, (train_indices, test_indices) in enumerate(splitter.split(X), start=1):
        model = RandomForestRegressor(
            n_estimators=200,
            max_depth=5,
            random_state=42,
            n_jobs=-1,
        )
        model.fit(X.iloc[train_indices], y.iloc[train_indices])
        fold_predictions = model.predict(X.iloc[test_indices])
        fold_actuals = y.iloc[test_indices].to_numpy()

        predictions.extend(fold_predictions.tolist())
        actuals.extend(fold_actuals.tolist())
        prediction_dates.extend(df["target_date"].iloc[test_indices].tolist())
        fold_metrics.append(
            (
                fold,
                mean_absolute_error(fold_actuals, fold_predictions),
                np.sqrt(mean_squared_error(fold_actuals, fold_predictions)),
            )
        )

    mae = float(mean_absolute_error(actuals, predictions))
    rmse = float(np.sqrt(mean_squared_error(actuals, predictions)))
    r2 = float(r2_score(actuals, predictions))

    final_model = RandomForestRegressor(
        n_estimators=200,
        max_depth=5,
        random_state=42,
        n_jobs=-1,
    )
    final_model.fit(X, y)

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    importance = (
        pd.DataFrame(
            {"feature": FEATURE_COLUMNS, "importance": final_model.feature_importances_}
        )
        .sort_values("importance", ascending=False)
        .reset_index(drop=True)
    )

    figure, axis = plt.subplots(figsize=(8, 5))
    axis.bar(importance["feature"], importance["importance"], color="#3569a8")
    axis.set_title("Random Forest Feature Importance")
    axis.set_ylabel("Importance")
    figure.tight_layout()
    figure.savefig(REPORTS_DIR / "feature_importance.png", dpi=150)
    plt.close(figure)

    prediction_frame = pd.DataFrame(
        {"date": prediction_dates, "actual": actuals, "predicted": predictions}
    ).sort_values("date")
    figure, axis = plt.subplots(figsize=(10, 5))
    axis.plot(prediction_frame["date"], prediction_frame["actual"], label="Actual")
    axis.plot(
        prediction_frame["date"],
        prediction_frame["predicted"],
        label="Predicted",
    )
    axis.set_title("Walk-Forward Next-Day Macro Score Predictions")
    axis.set_xlabel("Target date")
    axis.set_ylabel("Macro score")
    axis.legend()
    figure.autofmt_xdate()
    figure.tight_layout()
    figure.savefig(REPORTS_DIR / "prediction_results.png", dpi=150)
    plt.close(figure)

    fold_rows = "\n".join(
        f"| {fold} | {fold_mae:.4f} | {fold_rmse:.4f} |"
        for fold, fold_mae, fold_rmse in fold_metrics
    )
    importance_rows = "\n".join(
        f"| {row.feature} | {row.importance:.4f} |"
        for row in importance.itertuples(index=False)
    )
    report = f"""# Model Evaluation Report

## Setup

- Estimator: `RandomForestRegressor` (200 trees, maximum depth 5, random state 42)
- Target: following day's `macro_score`
- Validation: expanding-window `TimeSeriesSplit` with {n_splits} splits
- Evaluated predictions: {len(predictions)}
- Input rows used: {len(df)}

## Walk-Forward Metrics

| Metric | Score |
|---|---:|
| MAE | {mae:.4f} |
| RMSE | {rmse:.4f} |
| R² | {r2:.4f} |

### Fold Metrics

| Fold | MAE | RMSE |
|---:|---:|---:|
{fold_rows}

## Final-Model Feature Importance

| Feature | Importance |
|---|---:|
{importance_rows}

## Interpretation and Limitations

These metrics evaluate prediction of a constructed macro-score proxy, not asset returns,
trade profitability, risk-adjusted performance, or execution quality. No trading logs
were provided, so no backtest, position sizing, or P&L claims are made. The model is
trained on the available daily feature history and should not be treated as investment
advice.
"""
    (REPORTS_DIR / "evaluation_report.md").write_text(report, encoding="utf-8")

    print(f"Walk-forward MAE: {mae:.4f}")
    print(f"Walk-forward RMSE: {rmse:.4f}")
    print(f"Walk-forward R²: {r2:.4f}")
    print(f"Saved evaluation and plots in {REPORTS_DIR}")
    return {"mae": mae, "rmse": rmse, "r2": r2}


if __name__ == "__main__":
    train_model()
