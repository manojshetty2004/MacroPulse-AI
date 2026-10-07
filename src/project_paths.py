from pathlib import Path
import shutil


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
REPORTS_DIR = PROJECT_ROOT / "reports"
DATABASE_PATH = DATA_DIR / "macro_data.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH.as_posix()}"
LEGACY_DATABASE_PATH = PROJECT_ROOT / "macro_data.db"


def ensure_project_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    if not DATABASE_PATH.exists() and LEGACY_DATABASE_PATH.exists():
        shutil.copy2(LEGACY_DATABASE_PATH, DATABASE_PATH)


ensure_project_dirs()
