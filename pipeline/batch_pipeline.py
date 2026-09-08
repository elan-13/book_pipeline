"""
╔══════════════════════════════════════════════════════════════════════╗
║   Week 4 — Batch Pipeline: API Extract → Transform → SQLite Load     ║
║   DE Lab | Python + Pandas | Data Engineering Project Work I         ║
╚══════════════════════════════════════════════════════════════════════╝

RUN:
    python pipeline/batch_pipeline.py

The pipeline uses the Open Library Search API (no API key required):
    https://openlibrary.org/search.json?subject=science&limit=100

Sections:
  i.  Data Extraction from API Sources   (5 marks)
  ii. Data Cleaning & Transformation     (5 marks)
  iii.Data Loading into SQLite           (5 marks)
  iv. End-to-End Functionality, Error Handling & Verification (5 marks)
"""

import os
import sys
import json
import time
import logging
import sqlite3
import requests
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path

# Force UTF-8 output encoding for Windows standard out/err streams
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# ──────────────────────────────────────────────────
# Logging — structured, timestamped console output
# ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(levelname)-7s]  %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger("BatchPipeline")

# ──────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────
BASE_DIR    = Path(__file__).resolve().parent.parent
OUT_DIR     = BASE_DIR / "outputs" / "week4"
OUT_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH     = OUT_DIR / "week4_api_batch.db"
LOG_TABLE   = "pipeline_run_log"
TARGET_TABLE = "api_books_fact"

API_ENDPOINTS = [
    {
        "name": "Open Library - Science",
        "url": "https://openlibrary.org/search.json",
        "params": {"subject": "science", "limit": 100, "fields": "key,title,author_name,first_publish_year,publisher,isbn,number_of_pages_median,ratings_average,ratings_count,subject"},
    },
    {
        "name": "Open Library - Technology",
        "url": "https://openlibrary.org/search.json",
        "params": {"subject": "technology", "limit": 100, "fields": "key,title,author_name,first_publish_year,publisher,isbn,number_of_pages_median,ratings_average,ratings_count,subject"},
    },
    {
        "name": "Open Library - Medicine",
        "url": "https://openlibrary.org/search.json",
        "params": {"subject": "medicine", "limit": 50, "fields": "key,title,author_name,first_publish_year,publisher,isbn,number_of_pages_median,ratings_average,ratings_count,subject"},
    },
]

REQUEST_TIMEOUT = 30     # seconds
MAX_RETRIES     = 3
RETRY_DELAY     = 2      # seconds between retries


# ══════════════════════════════════════════════════
# PHASE i — DATA EXTRACTION FROM API
# ══════════════════════════════════════════════════

def extract_from_api(endpoint: dict, retry: int = 0) -> list[dict]:
    """
    Pull data from a REST API endpoint with retry logic.
    Returns a list of raw record dicts.
    """
    name    = endpoint["name"]
    url     = endpoint["url"]
    params  = endpoint["params"]

    log.info(f"[EXTRACT] Requesting -> {name}")
    log.info(f"          URL: {url}?subject={params.get('subject')}&limit={params.get('limit')}")

    try:
        t0 = time.time()
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        elapsed  = round((time.time() - t0) * 1000, 1)

        # ── HTTP Error Handling ──────────────────
        if response.status_code == 429:
            raise RuntimeError(f"Rate limited (429). Retry after {RETRY_DELAY * 2}s.")
        if response.status_code == 503:
            raise RuntimeError("Service unavailable (503).")
        response.raise_for_status()  # raises for 4xx / 5xx

        payload = response.json()
        docs    = payload.get("docs", [])

        log.info(f"          [OK] HTTP {response.status_code} | {elapsed}ms | {len(docs)} records returned")
        log.info(f"          Total found in API: {payload.get('numFound', '?')}")
        return docs

    except requests.exceptions.ConnectionError as e:
        log.error(f"[EXTRACT] Connection error: {e}")
        if retry < MAX_RETRIES:
            log.warning(f"[EXTRACT] Retrying ({retry + 1}/{MAX_RETRIES}) in {RETRY_DELAY}s...")
            time.sleep(RETRY_DELAY)
            return extract_from_api(endpoint, retry + 1)
        raise

    except requests.exceptions.Timeout:
        log.error(f"[EXTRACT] Request timed out after {REQUEST_TIMEOUT}s")
        if retry < MAX_RETRIES:
            log.warning(f"[EXTRACT] Retrying ({retry + 1}/{MAX_RETRIES})...")
            time.sleep(RETRY_DELAY)
            return extract_from_api(endpoint, retry + 1)
        raise

    except requests.exceptions.HTTPError as e:
        log.error(f"[EXTRACT] HTTP error: {e}")
        raise

    except json.JSONDecodeError as e:
        log.error(f"[EXTRACT] Malformed JSON response: {e}")
        raise


def extract_all_sources() -> tuple[pd.DataFrame, list[dict]]:
    """
    Extract from all configured API endpoints and combine into one raw DataFrame.
    """
    log.info("=" * 60)
    log.info("PHASE i — DATA EXTRACTION FROM API SOURCES")
    log.info("=" * 60)

    all_records = []
    extraction_meta = []

    for endpoint in API_ENDPOINTS:
        try:
            records = extract_from_api(endpoint)
            # Tag each record with its source
            for r in records:
                r["_source"] = endpoint["name"]
            all_records.extend(records)
            extraction_meta.append({
                "source": endpoint["name"],
                "url": endpoint["url"],
                "records_fetched": len(records),
                "status": "SUCCESS"
            })
        except Exception as e:
            log.error(f"[EXTRACT] FAILED for {endpoint['name']}: {e}")
            extraction_meta.append({
                "source": endpoint["name"],
                "url": endpoint["url"],
                "records_fetched": 0,
                "status": f"FAILED: {e}"
            })

    if not all_records:
        raise RuntimeError("No records extracted from any API source. Aborting pipeline.")

    df_raw = pd.DataFrame(all_records)
    log.info(f"\n[EXTRACT] [OK] Total records extracted: {len(df_raw)}")
    log.info(f"[EXTRACT]   Raw columns: {list(df_raw.columns)}\n")

    return df_raw, extraction_meta


# ══════════════════════════════════════════════════
# PHASE ii — DATA CLEANING & TRANSFORMATION
# ══════════════════════════════════════════════════

def transform(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Full cleaning and transformation pipeline:
      1. Column standardisation & rename
      2. Type coercion
      3. Missing value imputation
      4. Deduplication
      5. Feature Engineering:
           - isbn (first valid ISBN)
           - author (first author name)
           - publisher (first publisher)
           - pages (numeric)
           - avg_rating (numeric, 0 -> NaN -> filled with median)
           - rating_count (numeric)
           - publish_year (numeric)
           - price_tier (derived from pages as proxy)
           - is_highly_rated (rating >= 4.0)
           - has_isbn (boolean completeness flag)
      6. Outlier capping
      7. String normalisation
    """
    log.info("=" * 60)
    log.info("PHASE ii — DATA CLEANING & TRANSFORMATION")
    log.info("=" * 60)
    log.info(f"[TRANSFORM] Raw input shape: {df_raw.shape}")

    if df_raw.empty:
        log.warning("[TRANSFORM] Input DataFrame is empty. Returning empty schema.")
        return pd.DataFrame(columns=[
            "ol_key", "isbn", "title", "author", "publisher", "subject",
            "publish_year", "publish_decade", "pages", "page_tier",
            "avg_rating", "rating_count", "is_highly_rated", "rating_category",
            "has_isbn", "popularity_score", "title_word_count", "api_source"
        ])

    df = df_raw.copy()


    # ── 1. Standardise column names ─────────────
    log.info("[TRANSFORM] Step 1: Standardising column names")
    rename_map = {
        "key":                     "ol_key",
        "title":                   "title",
        "author_name":             "author_name_raw",
        "first_publish_year":      "publish_year",
        "publisher":               "publisher_raw",
        "isbn":                    "isbn_list",
        "number_of_pages_median":  "pages",
        "ratings_average":         "avg_rating",
        "ratings_count":           "rating_count",
        "subject":                 "subjects_raw",
        "_source":                 "api_source",
    }
    df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns}, inplace=True)

    # ── 2. Flatten list fields -> first item ─────
    log.info("[TRANSFORM] Step 2: Flattening list columns -> first item")

    def first_item(val):
        if isinstance(val, list) and len(val) > 0:
            return str(val[0])
        if pd.isna(val) or val is None or val == []:
            return None
        return str(val)

    for col in ["author_name_raw", "publisher_raw", "isbn_list", "subjects_raw"]:
        if col in df.columns:
            df[col] = df[col].apply(first_item)
        else:
            df[col] = None

    # Safe string conversion function
    def safe_str(val, max_len=100):
        if pd.isna(val) or val is None:
            return None
        s = str(val).strip()
        return s[:max_len] if s else None

    # Flatten to clean columns
    df["author"]    = df["author_name_raw"].apply(lambda x: safe_str(x, 100))
    df["publisher"] = df["publisher_raw"].apply(lambda x: safe_str(x, 100))
    df["isbn"]      = df["isbn_list"].apply(lambda x: safe_str(x, 13))
    df["subject"]   = df["subjects_raw"].apply(lambda x: safe_str(x, 80))

    # ── 3. Type coercion ────────────────────────
    log.info("[TRANSFORM] Step 3: Type coercion")
    df["publish_year"]  = pd.to_numeric(df.get("publish_year", pd.Series(dtype=float)), errors="coerce")
    df["pages"]         = pd.to_numeric(df.get("pages", pd.Series(dtype=float)), errors="coerce")
    df["avg_rating"]    = pd.to_numeric(df.get("avg_rating", pd.Series(dtype=float)), errors="coerce")
    df["rating_count"]  = pd.to_numeric(df.get("rating_count", pd.Series(dtype=float)), errors="coerce")

    raw_nulls = int(df.isnull().sum().sum())
    log.info(f"[TRANSFORM]   Nulls before imputation: {raw_nulls}")

    # ── 4. Missing value imputation ─────────────
    log.info("[TRANSFORM] Step 4: Missing value imputation")

    # Numeric: fill with median
    for col in ["publish_year", "pages", "avg_rating", "rating_count"]:
        if col in df.columns:
            median = df[col].median()
            df[col] = df[col].fillna(median if not np.isnan(median) else 0)

    # Strings: fill with placeholder
    df["title"]     = df["title"].fillna("Unknown Title").astype(str)
    df["author"]    = df["author"].fillna("Unknown Author").astype(str)
    df["publisher"] = df["publisher"].fillna("Unknown Publisher").astype(str)
    df["subject"]   = df["subject"].fillna("General").astype(str)
    df["isbn"]      = df["isbn"].fillna("").astype(str)
    df["ol_key"]    = df.get("ol_key", pd.Series(dtype=str)).fillna("").astype(str)
    df["api_source"]= df.get("api_source", pd.Series(dtype=str)).fillna("Unknown").astype(str)

    post_nulls = int(df.isnull().sum().sum())
    log.info(f"[TRANSFORM]   Nulls after imputation:  {post_nulls}")

    # ── 5. Deduplication ────────────────────────
    log.info("[TRANSFORM] Step 5: Deduplication")
    before_dedup = len(df)

    # Deduplicate by ol_key (primary), then by isbn where not blank
    df = df.drop_duplicates(subset=["ol_key"], keep="first")
    isbn_mask = df["isbn"] != ""
    df = pd.concat([
        df[~isbn_mask],
        df[isbn_mask].drop_duplicates(subset=["isbn"], keep="first")
    ]).reset_index(drop=True)

    dupes_removed = before_dedup - len(df)
    log.info(f"[TRANSFORM]   Rows before dedup: {before_dedup} | After: {len(df)} | Removed: {dupes_removed}")

    # ── 6. Feature Engineering ──────────────────
    log.info("[TRANSFORM] Step 6: Feature Engineering")

    # Publish decade
    df["publish_decade"] = ((df["publish_year"] // 10) * 10).astype(int).astype(str) + "s"

    # Page tier (proxy for content depth)
    def page_tier(p):
        if p < 100:   return "Short (<100 pages)"
        elif p < 300: return "Medium (100-300)"
        elif p < 600: return "Long (300-600)"
        else:         return "Comprehensive (600+)"
    df["page_tier"] = df["pages"].apply(page_tier)

    # High-rating flag
    df["is_highly_rated"] = df["avg_rating"] >= 4.0

    # Rating categorization
    def rating_cat(r):
        if r >= 4.5: return "Excellent (4.5+)"
        elif r >= 4.0: return "Good (4.0-4.5)"
        elif r >= 3.0: return "Average (3.0-4.0)"
        else: return "Below Average (<3.0)"
    df["rating_category"] = df["avg_rating"].apply(rating_cat)

    # ISBN completeness
    df["has_isbn"] = df["isbn"].str.match(r"^\d{10,13}$").fillna(False)

    # Popularity score: normalise rating * log(count+1)
    rc_clip = df["rating_count"].clip(lower=0)
    df["popularity_score"] = (df["avg_rating"] * np.log1p(rc_clip)).round(3)

    # Title word count
    df["title_word_count"] = df["title"].str.split().str.len().fillna(0).astype(int)

    # ── 7. Outlier capping (IQR method) ─────────
    log.info("[TRANSFORM] Step 7: Outlier capping (IQR x 1.5)")
    for col in ["pages", "avg_rating", "rating_count"]:
        if col in df.columns:
            q1 = df[col].quantile(0.25)
            q3 = df[col].quantile(0.75)
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            before = len(df[(df[col] < lower) | (df[col] > upper)])
            df[col] = df[col].clip(lower=lower, upper=upper)
            log.info(f"[TRANSFORM]   {col}: capped {before} outliers -> [{lower:.2f}, {upper:.2f}]")

    # ── 8. String normalisation ─────────────────
    df["title"]     = df["title"].str.strip().str[:255]
    df["author"]    = df["author"].str.strip().str[:100]
    df["publisher"] = df["publisher"].str.strip().str[:100]
    df["api_source"]= df["api_source"].str.strip()

    # ── Final column selection ───────────────────
    final_cols = [
        "ol_key", "isbn", "title", "author", "publisher", "subject",
        "publish_year", "publish_decade", "pages", "page_tier",
        "avg_rating", "rating_count", "is_highly_rated", "rating_category",
        "has_isbn", "popularity_score", "title_word_count", "api_source"
    ]
    df = df[[c for c in final_cols if c in df.columns]]
    df["is_highly_rated"] = df["is_highly_rated"].astype(int)
    df["has_isbn"]        = df["has_isbn"].astype(int)

    log.info(f"[TRANSFORM] [OK] Final shape after transformation: {df.shape}")
    log.info(f"[TRANSFORM]   Columns: {list(df.columns)}\n")
    return df


# ══════════════════════════════════════════════════
# PHASE iii — DATA LOADING INTO SQLITE
# ══════════════════════════════════════════════════

def init_target_table(conn: sqlite3.Connection, target_table: str = TARGET_TABLE, log_table: str = LOG_TABLE):
    """Create target fact table and pipeline run log table."""
    conn.execute(f"""
    CREATE TABLE IF NOT EXISTS {target_table} (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        ol_key           TEXT UNIQUE,
        isbn             TEXT,
        title            TEXT,
        author           TEXT,
        publisher        TEXT,
        subject          TEXT,
        publish_year     INTEGER,
        publish_decade   TEXT,
        pages            REAL,
        page_tier        TEXT,
        avg_rating       REAL,
        rating_count     REAL,
        is_highly_rated  INTEGER,
        rating_category  TEXT,
        has_isbn         INTEGER,
        popularity_score REAL,
        title_word_count INTEGER,
        api_source       TEXT,
        loaded_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.execute(f"""
    CREATE TABLE IF NOT EXISTS {log_table} (
        run_id            INTEGER PRIMARY KEY AUTOINCREMENT,
        run_timestamp     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sources_attempted INTEGER,
        records_extracted INTEGER,
        records_after_transform INTEGER,
        records_loaded    INTEGER,
        load_strategy     TEXT,
        total_ms          INTEGER,
        status            TEXT,
        error_msg         TEXT
    )
    """)
    conn.commit()


def load_to_sqlite(
    df: pd.DataFrame,
    strategy: str = "incremental",
    db_path: Path | str = None,
    target_table: str = None,
    log_table: str = None,
    run_type: str = "SCHEDULED",
    raw_count: int = None
) -> dict:
    """
    Load transformed DataFrame into SQLite.
    Strategies:
      full        — DROP + recreate table (full overwrite)
      incremental — INSERT OR REPLACE (upsert on ol_key)
    """
    target_db = Path(db_path) if db_path else DB_PATH
    tbl_name = target_table or TARGET_TABLE
    log_tbl = log_table or LOG_TABLE

    log.info("=" * 60)
    log.info("PHASE iii — DATA LOADING INTO TARGET DATABASE")
    log.info("=" * 60)
    log.info(f"[LOAD] Strategy: {strategy.upper()}")
    log.info(f"[LOAD] Target DB: {target_db}")
    log.info(f"[LOAD] Target table: {tbl_name}")

    t0 = time.time()
    conn = sqlite3.connect(str(target_db))

    try:
        init_target_table(conn, target_table=tbl_name, log_table=log_tbl)

        if strategy == "full":
            log.info("[LOAD] Full load - dropping existing table data...")
            conn.execute(f"DELETE FROM {tbl_name}")
            conn.commit()

        # ── Upsert / INSERT OR REPLACE ───────────
        loaded = 0
        skipped = 0
        for _, row in df.iterrows():
            try:
                conn.execute(f"""
                INSERT OR REPLACE INTO {tbl_name}
                  (ol_key, isbn, title, author, publisher, subject,
                   publish_year, publish_decade, pages, page_tier,
                   avg_rating, rating_count, is_highly_rated, rating_category, has_isbn,
                   popularity_score, title_word_count, api_source)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    row.get("ol_key"), row.get("isbn"), row.get("title"),
                    row.get("author"), row.get("publisher"), row.get("subject"),
                    row.get("publish_year"), row.get("publish_decade"), row.get("pages"),
                    row.get("page_tier"), row.get("avg_rating"), row.get("rating_count"),
                    int(row.get("is_highly_rated", 0)), row.get("rating_category", "Average (3.0-4.0)"),
                    int(row.get("has_isbn", 0)),
                    row.get("popularity_score"), row.get("title_word_count"), row.get("api_source")
                ))
                loaded += 1
            except Exception as e:
                log.warning(f"[LOAD] Row skipped: {row.get('ol_key', '?')} - {e}")
                skipped += 1

        conn.commit()

        # Verify load
        cursor = conn.cursor()
        cursor.execute(f"SELECT COUNT(*) FROM {tbl_name}")
        total_in_db = cursor.fetchone()[0]

        elapsed_ms = int((time.time() - t0) * 1000)
        
        # Write run log entry
        conn.execute(f"""
        INSERT INTO {log_tbl}
          (sources_attempted, records_extracted, records_after_transform,
           records_loaded, load_strategy, total_ms, status, error_msg)
        VALUES (?,?,?,?,?,?,?,?)
        """, (
            1, raw_count or len(df), len(df), loaded, strategy, elapsed_ms, "SUCCESS", ""
        ))
        conn.commit()

        log.info(f"[LOAD] [OK] Loaded: {loaded} records | Skipped: {skipped}")
        log.info(f"[LOAD]   Total records now in DB: {total_in_db}")
        log.info(f"[LOAD]   Execution time: {elapsed_ms}ms\n")

        conn.close()
        return {
            "loaded": loaded,
            "skipped": skipped,
            "total_in_db": total_in_db,
            "elapsed_ms": elapsed_ms,
        }

    except Exception as e:
        conn.rollback()
        conn.close()
        raise RuntimeError(f"Load failed: {e}") from e


def verify_data_quality(df: pd.DataFrame, report_path: Path | str = None) -> tuple[bool, list[dict]]:
    """
    Automated Data Quality Validation Gates.
    Validates:
      1. Row count sufficiency
      2. Critical field null threshold (<= 5%)
      3. Rating range boundaries (0.0 to 5.0)
      4. Publish year boundaries (1000 to 2030)
      5. Primary key (ol_key) uniqueness
    Returns: (passed: bool, checks: list[dict])
    """
    checks = []
    
    # 1. Non-empty check
    row_count = len(df)
    c1 = {
        "check": "Row count > 0",
        "status": "PASS" if row_count > 0 else "FAIL",
        "details": f"Total rows: {row_count}"
    }
    checks.append(c1)

    if row_count == 0:
        return False, checks

    # 2. Null percentage gate for critical columns
    crit_cols = ["ol_key", "title", "author", "publish_year", "avg_rating"]
    present_crit = [c for c in crit_cols if c in df.columns]
    null_count = df[present_crit].isnull().sum().sum()
    null_pct = null_count / (len(df) * max(1, len(present_crit)))
    c2 = {
        "check": "Critical columns null threshold (< 5%)",
        "status": "PASS" if null_pct <= 0.05 else "FAIL",
        "details": f"Null rate: {null_pct:.2%} ({null_count} nulls)"
    }
    checks.append(c2)

    # 3. Rating range validation
    if "avg_rating" in df.columns:
        invalid_ratings = df[(df["avg_rating"] < 0.0) | (df["avg_rating"] > 5.0)]
        c3 = {
            "check": "Rating range [0.0 - 5.0]",
            "status": "PASS" if len(invalid_ratings) == 0 else "FAIL",
            "details": f"Invalid ratings: {len(invalid_ratings)}"
        }
        checks.append(c3)

    # 4. Publish year validation
    if "publish_year" in df.columns:
        invalid_years = df[(df["publish_year"] < 1000) | (df["publish_year"] > 2030)]
        c4 = {
            "check": "Publish year range [1000 - 2030]",
            "status": "PASS" if len(invalid_years) == 0 else "FAIL",
            "details": f"Invalid years: {len(invalid_years)}"
        }
        checks.append(c4)

    # 5. Key uniqueness
    if "ol_key" in df.columns:
        dupes = df["ol_key"].duplicated().sum()
        c5 = {
            "check": "Primary key (ol_key) uniqueness",
            "status": "PASS" if dupes == 0 else "FAIL",
            "details": f"Duplicates: {dupes}"
        }
        checks.append(c5)

    all_passed = all(c["status"] == "PASS" for c in checks)

    if report_path:
        try:
            report_p = Path(report_path)
            report_p.parent.mkdir(parents=True, exist_ok=True)
            with open(report_p, "w", encoding="utf-8") as f:
                json.dump({
                    "passed": all_passed,
                    "timestamp": datetime.now().isoformat(),
                    "checks": checks
                }, f, indent=2)
        except Exception as e:
            log.warning(f"Could not write quality report to {report_path}: {e}")

    return all_passed, checks


# ══════════════════════════════════════════════════
# PHASE iv — VERIFICATION & RESULT REPORTING
# ══════════════════════════════════════════════════

def verify_and_report(df_transformed: pd.DataFrame):
    """
    Post-load verification:
      - Row count check (DB vs DataFrame)
      - Schema validation (columns present)
      - Sample query with aggregation
      - Data quality summary
    """
    log.info("=" * 60)
    log.info("PHASE iv — END-TO-END VERIFICATION & RESULT REPORT")
    log.info("=" * 60)

    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    # ── 1. Row Count Verification ────────────────
    cursor.execute(f"SELECT COUNT(*) FROM {TARGET_TABLE}")
    db_count = cursor.fetchone()[0]
    log.info(f"[VERIFY] DB row count: {db_count}")
    if db_count >= len(df_transformed):
        log.info("[VERIFY] [OK] Row count check PASSED")
    else:
        log.warning(f"[VERIFY] [WARN] Possible data loss: DataFrame had {len(df_transformed)}, DB has {db_count}")

    # ── 2. Schema Validation ─────────────────────
    cursor.execute(f"PRAGMA table_info({TARGET_TABLE})")
    db_cols = {row[1] for row in cursor.fetchall()}
    required = {"ol_key", "title", "author", "avg_rating", "api_source"}
    missing  = required - db_cols
    if not missing:
        log.info("[VERIFY] [OK] Schema validation PASSED - all required columns present")
    else:
        log.warning(f"[VERIFY] [WARN] Missing columns in DB: {missing}")

    # ── 3. Analytical Sample Query ───────────────
    log.info("\n[VERIFY] -- Sample Aggregation Query: Top API Sources --")
    cursor.execute(f"""
        SELECT api_source,
               COUNT(*)                      AS total_books,
               ROUND(AVG(avg_rating), 2)     AS avg_rating,
               ROUND(AVG(pages), 0)          AS avg_pages,
               SUM(is_highly_rated)          AS highly_rated_count,
               SUM(has_isbn)                 AS books_with_isbn
        FROM {TARGET_TABLE}
        GROUP BY api_source
        ORDER BY total_books DESC
    """)
    rows = cursor.fetchall()
    header = f"{'Source':<30}{'Books':>8}{'Avg Rating':>12}{'Avg Pages':>11}{'High Rated':>12}{'With ISBN':>11}"
    log.info(f"\n  {header}")
    log.info("  " + "-" * 84)
    for r in rows:
        log.info(f"  {str(r[0]):<30}{r[1]:>8}{r[2]:>12}{r[3]:>11}{r[4]:>12}{r[5]:>11}")

    # ── 4. Page Tier Distribution ────────────────
    log.info("\n[VERIFY] -- Page Tier Distribution --")
    cursor.execute(f"""
        SELECT page_tier, COUNT(*) AS cnt
        FROM {TARGET_TABLE}
        GROUP BY page_tier
        ORDER BY cnt DESC
    """)
    for r in cursor.fetchall():
        log.info(f"  {str(r[0]):<30} {r[1]:>5} books")

    # ── 5. Data Quality Summary ──────────────────
    log.info("\n[VERIFY] -- Data Quality Summary --")
    quality_queries = [
        ("Records with ISBN",       f"SELECT COUNT(*) FROM {TARGET_TABLE} WHERE has_isbn = 1"),
        ("Records without ISBN",    f"SELECT COUNT(*) FROM {TARGET_TABLE} WHERE has_isbn = 0"),
        ("Highly-rated books",      f"SELECT COUNT(*) FROM {TARGET_TABLE} WHERE is_highly_rated = 1"),
        ("Zero-rating records",     f"SELECT COUNT(*) FROM {TARGET_TABLE} WHERE avg_rating = 0"),
        ("Records with publisher",  f"SELECT COUNT(*) FROM {TARGET_TABLE} WHERE publisher != 'Unknown Publisher'"),
    ]
    for label, sql in quality_queries:
        cursor.execute(sql)
        val = cursor.fetchone()[0]
        log.info(f"  {label:<35} {val:>6}")

    # ── 6. Top 5 Books by Popularity ────────────
    log.info("\n[VERIFY] -- Top 5 Books by Popularity Score --")
    cursor.execute(f"""
        SELECT title, author, avg_rating, rating_count, popularity_score
        FROM {TARGET_TABLE}
        ORDER BY popularity_score DESC
        LIMIT 5
    """)
    for i, r in enumerate(cursor.fetchall(), 1):
        log.info(f"  {i}. {str(r[0])[:55]:<55} | Rating: {r[2]} | Score: {r[4]}")

    conn.close()
    log.info("\n[VERIFY] [OK] All verification checks completed.\n")


def log_pipeline_run(meta: dict):
    """Write pipeline run metadata to pipeline_run_log table."""
    conn = sqlite3.connect(str(DB_PATH))
    try:
        conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {LOG_TABLE} (
            run_id            INTEGER PRIMARY KEY AUTOINCREMENT,
            run_timestamp     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            sources_attempted INTEGER,
            records_extracted INTEGER,
            records_after_transform INTEGER,
            records_loaded    INTEGER,
            load_strategy     TEXT,
            total_ms          INTEGER,
            status            TEXT,
            error_msg         TEXT
        )
        """)
        conn.execute(f"""
        INSERT INTO {LOG_TABLE}
          (sources_attempted, records_extracted, records_after_transform,
           records_loaded, load_strategy, total_ms, status, error_msg)
        VALUES (?,?,?,?,?,?,?,?)
        """, (
            meta.get("sources_attempted", 0),
            meta.get("records_extracted", 0),
            meta.get("records_after_transform", 0),
            meta.get("records_loaded", 0),
            meta.get("load_strategy", "incremental"),
            meta.get("total_ms", 0),
            meta.get("status", "UNKNOWN"),
            meta.get("error_msg", ""),
        ))
        conn.commit()
    finally:
        conn.close()


# ══════════════════════════════════════════════════
# MAIN PIPELINE ORCHESTRATOR
# ══════════════════════════════════════════════════

def run_pipeline(load_strategy: str = "incremental") -> dict:
    """
    Orchestrates the full batch pipeline:
      i.  Extract from Open Library REST API
      ii. Transform (clean, engineer features)
      iii.Load into SQLite delab_books.db -> api_books_fact
      iv. Verify and report results
    Returns a summary dict with all run statistics.
    """
    pipeline_start = time.time()
    run_meta = {
        "sources_attempted": len(API_ENDPOINTS),
        "load_strategy": load_strategy,
        "status": "RUNNING",
        "error_msg": "",
    }

    log.info("\n" + "=" * 60)
    log.info("  Week 4 Batch Pipeline - Start")
    log.info(f"  Strategy:  {load_strategy.upper()}")
    log.info(f"  Target DB: {str(DB_PATH.name)}")
    log.info(f"  Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log.info("=" * 60 + "\n")

    try:
        # ── i. Extract ───────────────────────────
        df_raw, extraction_meta = extract_all_sources()
        run_meta["records_extracted"] = len(df_raw)

        # ── ii. Transform ────────────────────────
        df_clean = transform(df_raw)
        run_meta["records_after_transform"] = len(df_clean)

        # ── iii. Load ────────────────────────────
        load_result = load_to_sqlite(df_clean, strategy=load_strategy)
        run_meta["records_loaded"] = load_result["loaded"]
        run_meta["total_ms"] = load_result["elapsed_ms"]

        # ── iv. Verify ───────────────────────────
        verify_and_report(df_clean)

        run_meta["status"] = "SUCCESS"

    except Exception as e:
        log.error(f"\n[PIPELINE] [FAIL] Pipeline FAILED: {e}")
        import traceback
        traceback.print_exc()
        run_meta["status"] = "FAILED"
        run_meta["error_msg"] = str(e)

    finally:
        total_ms = int((time.time() - pipeline_start) * 1000)
        run_meta["total_ms"] = run_meta.get("total_ms", total_ms)
        log_pipeline_run(run_meta)

    log.info("=" * 60)
    log.info(f"PIPELINE COMPLETE  |  Status: {run_meta['status']}")
    log.info(f"  Extracted:    {run_meta.get('records_extracted', 0)} records")
    log.info(f"  Transformed:  {run_meta.get('records_after_transform', 0)} records")
    log.info(f"  Loaded:       {run_meta.get('records_loaded', 0)} records")
    log.info(f"  Total time:   {total_ms}ms")
    log.info("=" * 60 + "\n")

    return run_meta


# ──────────────────────────────────────────────────
# CLI Entry Point
# ──────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Week 4 Batch Pipeline: Open Library API -> Pandas -> SQLite"
    )
    parser.add_argument(
        "--strategy",
        choices=["full", "incremental"],
        default="incremental",
        help="Load strategy: 'full' (overwrite) or 'incremental' (upsert). Default: incremental"
    )
    args = parser.parse_args()

    result = run_pipeline(load_strategy=args.strategy)
    sys.exit(0 if result["status"] == "SUCCESS" else 1)
