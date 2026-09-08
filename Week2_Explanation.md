# Week 2 — ETL Pipeline (Extract, Transform, Load)

> **Exercise 2 — Step-by-step Extract · Transform · Load with live terminal output**

---

## 📌 Overview

Week 2 implements a **complete, interactive ETL (Extract-Transform-Load) pipeline** on the books dataset. Each step is executed independently via button clicks, with real-time terminal feedback. This week also introduces **Change Data Capture (CDC)** — tracking what changed between two data snapshots.

---

## 🗂️ Files Involved

| File | Role |
|------|------|
| `templates/week2.html` | Interactive ETL UI with 3-step execution flow |
| `app.py` → `execute_sqlite_etl()` | Performs physical ETL load to SQLite (Lines 570–647) |
| `app.py` → `simulate_etl()` | Simulates ETL steps with logs and timings (Lines 535–567) |
| `app.py` → `cdc_compare()` | Compares two CSV snapshots for CDC events (Lines 686–716) |
| `app.py` → `init_sqlite_db()` | Creates the SQLite target schema (Lines 41–99) |
| `outputs/week2/week2_etl.db` | Target SQLite database with 3 tables |

---

## ⚙️ How the ETL Pipeline Works (3 Steps)

### Step 1 — EXTRACT

**Button:** `Run Extract`  
**API call:** `/api/etl/extract`

```
main_dataset.csv → pd.read_csv() → Raw DataFrame (32,583 rows)
```

**What happens:**
1. Reads the raw `main_dataset.csv` from disk
2. Detects the schema: 11 original columns, their data types
3. Counts **null values** per column
4. Counts **duplicate ISBNs**
5. Returns a JSON summary to the live terminal

**Output displayed:**
```
[EXTRACT] Read main_dataset.csv: 32,583 records
[EXTRACT] Schema: 11 columns detected
[EXTRACT] Null values: 3,875 total
[EXTRACT] Duplicate ISBNs: 9,875
```

**Why this step exists:** In real pipelines, extraction is decoupled from transformation — this allows you to validate the source before spending compute time on transforms.

---

### Step 2 — TRANSFORM

**Button:** `Run Transform` *(unlocked after Step 1)*  
**API call:** `/api/etl/transform`

Takes the extracted DataFrame and applies the same preprocessing as Week 1, **plus 8 additional engineered features**:

| New Column | Computation | Description |
|------------|-------------|-------------|
| `discount_amount` | `old_price - price` | Absolute discount value |
| `discount_pct` | `(discount_amount / old_price) × 100` | Percentage discount |
| `price_gbp` | `price × 0.79` | USD → GBP converted price |
| `value_score` | `rating / price` | Value per unit price |
| `is_bestseller` | `rating ≥ 4.5` | Boolean bestseller flag |
| `isbn13_valid` | 13-digit regex check | ISBN format validity |
| `title_length` | `len(title)` | Title character count |
| `word_count` | `len(title.split())` | Title word count |

**Cleaning applied:**
- Null imputation (median/mode/placeholder strategies)
- Deduplication by ISBN: 32,583 → 22,708 rows
- String normalisation and type coercion

**Output displayed:**
```
[TRANSFORM] Column rename & standardise: 14 mappings
[TRANSFORM] Fill 3,875 null values (median/mode strategy)
[TRANSFORM] Remove 9,875 duplicate ISBNs
[TRANSFORM] Engineer discount_amount & discount_pct
[TRANSFORM] Engineer price_gbp (USD × 0.79)
[TRANSFORM] Final shape: 22,708 rows × 19 columns
```

---

### Step 3 — LOAD

**Button:** `Run Load` *(unlocked after Step 2)*  
**API call:** `/api/etl/load`

Loads the cleaned DataFrame into the **SQLite target database** (`outputs/week2/week2_etl.db`).

**Two load strategies available:**

| Strategy | Behaviour | When to Use |
|----------|-----------|-------------|
| **Full Load** | `DELETE FROM books_etl_fact` then reload entire dataset | Initial loads, complete refresh |
| **Incremental (Upsert)** | `INSERT OR REPLACE` — updates existing, inserts new | Daily/incremental refreshes |

**Physical SQLite tables created:**

```sql
-- Target fact table
CREATE TABLE books_etl_fact (
    isbn TEXT PRIMARY KEY,
    title TEXT,
    author TEXT,
    format TEXT,
    category TEXT,
    price REAL,
    old_price REAL,
    rating REAL,
    discount_amount REAL,
    discount_pct REAL,
    price_gbp REAL,
    value_score REAL,
    is_bestseller INTEGER,
    price_tier TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

-- Pipeline execution log
CREATE TABLE etl_execution_log (
    exec_id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT,
    load_strategy TEXT,
    extracted_records INTEGER,
    transformed_records INTEGER,
    loaded_records INTEGER,
    execution_time_ms INTEGER,
    status TEXT,
    timestamp TIMESTAMP
)

-- CDC audit trail
CREATE TABLE cdc_audit_log (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id TEXT,
    action TEXT,       -- INSERT | UPDATE | DELETE
    column_changed TEXT,
    old_value TEXT,
    new_value TEXT,
    timestamp TIMESTAMP
)
```

---

## 📊 Live Terminal (Pipeline Execution Log)

The **live terminal console** in `week2.html` streams timestamped log messages for each step:

```
$ Ready — Click "Run Extract" to start the pipeline...
08:15:22  [INFO]    [EXTRACT] Read main_dataset.csv: 32,583 records
08:15:22  [INFO]    [EXTRACT] Schema: 11 columns, 3,875 total nulls
08:15:23  [INFO]    [TRANSFORM] Cleaning & deduplication: 22,708 rows
08:15:24  [INFO]    [LOAD] Strategy: FULL LOAD
08:15:26  [INFO]    [LOAD] Loaded 22,708 records → books_etl_fact
08:15:26  [INFO]    [LOAD] DB size: 4,628 KB
08:15:26  [SUCCESS] ETL pipeline complete in 4,021ms
```

**Purpose:**
- Provides **real-time observability** into what the pipeline is doing
- Each log entry has a phase tag (`EXTRACT`, `TRANSFORM`, `LOAD`), helping locate issues
- Mirrors how production pipelines use logging frameworks (e.g. Python `logging`, Apache Airflow task logs)

---

## 🔄 Change Data Capture (CDC)

**Location:** Section below the 3-step pipeline  
**API call:** `/api/cdc/compare`

### What is CDC?

CDC tracks **what changed** between two snapshots of a dataset:
- **INSERT** — New records added in the new snapshot
- **UPDATE** — Existing records with changed values
- **DELETE** — Records present in old snapshot but gone in new snapshot

### How it Works Here

1. User uploads **two CSV files** (Old snapshot vs New snapshot)
2. A **key column** is specified (default: `isbn`)
3. The backend computes:

```python
old_keys = set(df_old[key_col])
new_keys = set(df_new[key_col])

inserted = new_keys - old_keys        # New records
deleted  = old_keys - new_keys        # Removed records
updated  = compare common keys field by field   # Changed values
```

4. Results shown: count of inserts / updates / deletes with sample rows

**Why CDC Matters:**
- In real systems, you cannot reload the entire dataset every run
- CDC lets you **only process what changed**, dramatically reducing compute
- CDC events are written to the `cdc_audit_log` table for compliance/auditing

---

## 📊 Diagrams — Purpose & Use

### 1. ETL Flow Architecture Diagram

**Location:** `week2.html` — top section

```
[EXTRACT]          →        [TRANSFORM]         →          [LOAD]
Read from Source         Cleanse & Enrich               Write to Target DB
main_dataset.csv         Null Imputation               SQLite (week2_etl.db)
32,583 raw rows          Deduplication                 books_etl_fact table
11 original columns      Feature Engineering            Full / Incremental
                         +8 Derived Columns
```

**Purpose:**
- Visualises the classic ETL pattern at a glance
- Each phase is colour-coded: Extract (blue), Transform (purple), Load (green)
- The `→` arrows show data flow direction

**Use:** Understanding the sequence, explaining ETL to non-technical stakeholders

---

### 2. Step-by-Step Execution Cards

**Location:** 3 cards in `week2.html` (unlocked sequentially)

Shows: step icon, description, lock/unlock status, run button

**Purpose:**
- Enforces correct order of execution (Step 2 is disabled until Step 1 is done)
- Provides visual feedback (opacity changes from 0.55 → 1.0 when unlocked)
- Mirrors the dependency model of DAG-based orchestrators (Airflow)

---

### 3. KPI Metrics Row (After Load)

**Location:** `week2.html` — appears after Step 3 completes

| KPI | Meaning |
|-----|---------|
| **Extracted Rows** | How many rows were read from source |
| **After Transform** | Rows after cleaning & deduplication |
| **Loaded to DB** | Rows successfully written to SQLite |
| **Total Time (ms)** | End-to-end pipeline execution time |

**Purpose:** Quick sanity check — if "Extracted" ≠ "Loaded", something was dropped during transforms.

---

### 4. Transformed Data Preview Table

**Location:** `week2.html` — appears after Step 2

Shows first 5 rows of the transformed DataFrame with all 19 columns.

**Purpose:**
- Inspect the actual data before loading
- Confirms column types, computed feature values look correct

---

### 5. Target Database Status Table

**Location:** `week2.html` — bottom section

Shows live query results from `books_etl_fact` in `week2_etl.db`:

| Field | Description |
|-------|-------------|
| ISBN | Primary key |
| Title | Book name |
| Category | Genre badge |
| Price | USD price |
| Rating | Stars |
| Discount % | Computed discount |
| Bestseller | Yes/No flag |

**Purpose:**
- Confirms the **load actually worked** by querying the target directly
- Shows last 10 records written

---

## 📂 Output Files Explained

### `outputs/week2/week2_etl.db`

SQLite database containing 3 tables:

| Table | Contents |
|-------|----------|
| `books_etl_fact` | 22,708 cleaned book records |
| `etl_execution_log` | One row per pipeline run (strategy, record counts, time, status) |
| `cdc_audit_log` | CDC events from snapshot comparisons |

---

## 🔗 Connection to Other Weeks

```
Week 1 Output (processed_books_week1.csv)
    │
    └──► Week 2: ETL loads into books_etl_fact in week2_etl.db
              │
              └──► Week 3: books_etl_fact is queried by OLAP operations
```

---

## ✅ Key Takeaways

| Concept | What Week 2 Demonstrates |
|---------|--------------------------|
| **ETL Pattern** | Three-phase pipeline: Extract → Transform → Load |
| **Load Strategies** | Full Load (overwrite) vs Incremental (upsert) |
| **SQLite as Target** | Writing structured data to a relational database |
| **Pipeline Logging** | Recording execution metadata in a log table |
| **CDC** | Detecting inserts/updates/deletes between two snapshots |
| **Pipeline Observability** | Real-time terminal output for each phase |
