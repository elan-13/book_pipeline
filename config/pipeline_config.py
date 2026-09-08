"""
Pipeline as Code — Programmatic Configuration Manager.
Loads YAML configurations and applies environment variable overrides (DEV/STAGING/PROD).
"""

import os
from pathlib import Path
from typing import Dict, Any

try:
    import yaml
except ImportError:
    yaml = None

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_FILE = BASE_DIR / "config" / "pipeline_config.yaml"

DEFAULT_CONFIG: Dict[str, Any] = {
    "app_env": "development",
    "pipeline": {
        "name": "OpenLibraryBatchETL",
        "version": "1.2.0",
        "request_timeout_seconds": 30,
        "max_retries": 3,
        "retry_delay_seconds": 2,
    },
    "endpoints": [
        {
            "name": "Open Library - Science",
            "url": "https://openlibrary.org/search.json",
            "subject": "science",
            "limit": 100,
        },
        {
            "name": "Open Library - Technology",
            "url": "https://openlibrary.org/search.json",
            "subject": "technology",
            "limit": 100,
        },
        {
            "name": "Open Library - Medicine",
            "url": "https://openlibrary.org/search.json",
            "subject": "medicine",
            "limit": 50,
        },
    ],
    "database": {
        "db_path": str(BASE_DIR / "outputs" / "week4" / "week4_api_batch.db"),
        "target_table": "api_books_fact",
        "log_table": "pipeline_run_log",
    },
    "validation_rules": {
        "min_rows_expected": 1,
        "max_allowed_null_pct": 0.05,
        "valid_rating_min": 0.0,
        "valid_rating_max": 5.0,
        "min_publish_year": 1000,
        "max_publish_year": 2030,
    }
}


def load_config(config_path: Path = CONFIG_FILE) -> Dict[str, Any]:
    """
    Load pipeline configuration with fallback to DEFAULT_CONFIG and environment overrides.
    """
    config = DEFAULT_CONFIG.copy()
    
    if yaml and config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                loaded = yaml.safe_load(f)
                if isinstance(loaded, dict):
                    config.update(loaded)
        except Exception:
            pass

    # Environment Variable Overrides
    env = os.getenv("APP_ENV", config.get("app_env", "development")).lower()
    config["app_env"] = env

    if env == "production":
        config["pipeline"]["request_timeout_seconds"] = int(os.getenv("PIPELINE_TIMEOUT", "45"))
        config["pipeline"]["max_retries"] = int(os.getenv("PIPELINE_RETRIES", "5"))
    elif env == "test":
        config["database"]["db_path"] = ":memory:"
        config["pipeline"]["max_retries"] = 1
        config["pipeline"]["retry_delay_seconds"] = 0

    return config
