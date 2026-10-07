import pandas as pd
from matplotlib import pyplot as plt

from project_paths import DATA_DIR, REPORTS_DIR


def plot_macro_sentiment():
    """Plot the daily macro score and save the chart under reports/."""
    feature_path = DATA_DIR / "daily_features.csv"
    if not feature_path.exists():
        raise FileNotFoundError(
            f"{feature_path} does not exist. Build daily features before plotting."
        )

    features = pd.read_csv(feature_path)
    required_columns = {"date", "macro_score"}
    missing_columns = required_columns.difference(features.columns)
    if missing_columns:
        raise ValueError(
            "daily_features.csv is missing required columns: "
            f"{', '.join(sorted(missing_columns))}"
        )

    features["date"] = pd.to_datetime(features["date"], errors="coerce")
    features["macro_score"] = pd.to_numeric(features["macro_score"], errors="coerce")
    features = features.dropna(subset=["date", "macro_score"]).sort_values("date")
    if features.empty:
        raise ValueError("daily_features.csv has no valid dates and macro scores to plot.")

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    figure, axis = plt.subplots(figsize=(10, 5))
    axis.plot(features["date"], features["macro_score"], color="#3569a8")
    axis.axhline(0, color="black", linewidth=0.8, alpha=0.6)
    axis.fill_between(
        features["date"],
        features["macro_score"],
        0,
        where=features["macro_score"] >= 0,
        color="#4caa72",
        alpha=0.2,
    )
    axis.fill_between(
        features["date"],
        features["macro_score"],
        0,
        where=features["macro_score"] < 0,
        color="#d65f5f",
        alpha=0.2,
    )
    axis.set_title("Daily Macro Sentiment Score")
    axis.set_xlabel("Date")
    axis.set_ylabel("Macro score")
    figure.autofmt_xdate()
    figure.tight_layout()
    output_path = REPORTS_DIR / "macro_sentiment.png"
    figure.savefig(output_path, dpi=150)
    plt.close(figure)
    print(f"Saved {output_path}")
    return output_path


if __name__ == "__main__":
    plot_macro_sentiment()
