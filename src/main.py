from features.macro_features import build_features
from ingestion.apify_macro import get_macro_events
from ingestion.tavily_news import get_news
from models.macro_model import train_model
from project_paths import DATA_DIR, REPORTS_DIR, ensure_project_dirs
from visualization.macro_chart import plot_macro_sentiment


def main() -> None:
    ensure_project_dirs()
    print("Collecting macroeconomic events...")
    get_macro_events()

    print("\nCollecting economic news...")
    get_news()

    print("\nBuilding daily features and macro outlook...")
    build_features()

    print("\nCreating macro sentiment visualization...")
    plot_macro_sentiment()

    print("\nTraining and evaluating the model...")
    metrics = train_model()

    if metrics is None:
        print("\nPipeline completed, but model evaluation was skipped for insufficient history.")
    else:
        print("\nPipeline complete.")
    print(f"Data: {DATA_DIR}")
    print(f"Reports: {REPORTS_DIR}")


if __name__ == "__main__":
    main()
