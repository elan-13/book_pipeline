# Week 4 — Batch Pipeline: API Extract → Transform → SQLite Load

> **Exercise 4 — Python Batch Pipeline · Apache Airflow DAG · Apache Kafka · API → Transform → Warehouse**

---

## 📌 Overview

Week 4 implements a **production-grade batch pipeline** that extracts data from a **live REST API** (Open Library), applies Pandas-based cleaning and feature engineering, and loads the results into a SQLite data warehouse. The UI also demonstrates **Apache Airflow DAG orchestration** and **Apache Kafka streaming architecture** as conceptual extensions.

---

## 🗂️ Files Involved

| File | Role |
|------|------|
| `pipeline/batch_pipeline.py` | Core batch ETL pipeline script (721 lines) |
| `templates/week4.html` | UI showing pipeline architecture, DAG, Kafka, execution logs |
| `app.py` → `/week4` route | Renders week4 page with live DB data |
| `app.py` → `/api/week4/run-pipeline` | Triggers the batch pipeline via Flask |
| `outputs/week4/week4_api_batch.db` | Target SQLite database (api_books_fact + pipeline_run_log) |

---

## ⚙️ How the Batch Pipeline Works (4 Phases)

The pipeline is fully contained in `pipeline/batch_pipeline.py` and is organised into 4 phases:

---

### Phase i — DATA EXTRACTION FROM API

**Function:** `extract_from_api()` and `extract_all_sources()`

**3 API endpoints configured:**

| Source | Subject | Limit |
|--------|---------|-------|
| Open Library - Science | `subject=science` | 100 records |
| Open Library - Technology | `subject=technology` | 100 records |
| Open Library - Medicine | `subject=medicine` | 50 records |

**Extraction process:**

```
https://openlibrary.org/search.json?subject=science&limit=100
    ↓  HTTP GET (timeout=30s)
    ↓  Parse JSON → payload["docs"]
    ↓  Tag each record with _source = "Open Library - Science"
    ↓  Repeat for all 3 endpoints
    → Raw DataFrame (up to 250 records combined)
```

**Fields extracted per book:**

```
key, title, author_name, first_publish_year, publisher,
isbn, number_of_pages_median, ratings_average, ratings_count, subject
```

**Error handling:**
- `HTTP 429` (rate limit) → raises RuntimeError
- `HTTP 503` (service down) → raises RuntimeError
- `ConnectionError` → retry up to 3 times with 2-second delay
- `Timeout` → retry up to 3 times
- `JSONDecodeError` → raises immediately (malformed response)

---

### Phase ii — DATA CLEANING & TRANSFORMATION

**Function:** `transform(df_raw: pd.DataFrame)`

**8 transformation steps:**

#### Step 1 — Column Standardisation
```python
rename_map = {
    "key":                    "ol_key",
    "title":                  "title",
    "author_name":            "author_name_raw",
    "first_publish_year":     "publish_year",
    "publisher":              "publisher_raw",
    "isbn":                   "isbn_list",
    "number_of_pages_median": "pages",
    "ratings_average":        "avg_rating",
    "ratings_count":          "rating_count",
    "subject":                "subjects_raw",
    "_source":                "api_source",
}
```

#### Step 2 — Flatten List Fields
API returns lists (multiple authors, multiple ISBNs). Extract first item:
```python
def first_item(val):
    if isinstance(val, list) and len(val) > 0:
        return str(val[0])
    return None
```

Applied to: `author_name_raw`, `publisher_raw`, `isbn_list`, `subjects_raw`

#### Step 3 — Type Coercion
```python
df["publish_year"] = pd.to_numeric(..., errors="coerce")
df["pages"]        = pd.to_numeric(..., errors="coerce")
df["avg_rating"]   = pd.to_numeric(..., errors="coerce")
df["rating_count"] = pd.to_numeric(..., errors="coerce")
```

#### Step 4 — Missing Value Imputation
- Numeric columns → fill with **median**
- String columns → fill with placeholder (`"Unknown Title"`, `"Unknown Author"`, etc.)

#### Step 5 — Deduplication
```python
df = df.drop_duplicates(subset=["ol_key"], keep="first")  # by Open Library key
# Also dedup by ISBN for records with valid ISBNs:
df = pd.concat([df[~isbn_mask],
                df[isbn_mask].drop_duplicates(subset=["isbn"], keep="first")])
```

#### Step 6 — Feature Engineering

| New Column | Logic | Purpose |
|------------|-------|---------|
| `publish_decade` | `(year // 10) × 10` + "s" → "1990s" | Group by decade |
| `page_tier` | <100 / 100-300 / 300-600 / 600+ pages | Content depth category |
| `is_highly_rated` | `avg_rating >= 4.0` | Quality flag |
| `has_isbn` | Regex `^\d{10,13}$` | ISBN completeness flag |
| `popularity_score` | `avg_rating × log(rating_count + 1)` | Combined quality+popularity |
| `title_word_count` | `len(title.split())` | Title length |

#### Step 7 — Outlier Capping (IQR Method)
```python
for col in ["pages", "avg_rating", "rating_count"]:
    q1 = df[col].quantile(0.25)
    q3 = df[col].quantile(0.75)
    iqr = q3 - q1
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr
    df[col] = df[col].clip(lower=lower, upper=upper)
```

**Why IQR outlier capping?** Extreme values (e.g. a 50,000-page book or a 5-star rating with 1 vote) would skew aggregations.

#### Step 8 — String Normalisation
- Strip whitespace from `title`, `author`, `publisher`
- Truncate: `title` to 255 chars, `author`/`publisher` to 100 chars

---

### Phase iii — DATA LOADING INTO SQLITE

**Function:** `load_to_sqlite(df, strategy="incremental")`

**Two strategies:**

| Strategy | SQL | When to Use |
|----------|-----|-------------|
| `full` | `DELETE FROM api_books_fact` then insert all | Complete refresh |
| `incremental` | `INSERT OR REPLACE` (upsert on `ol_key`) | Daily update runs |

**Target table schema:**

```sql
CREATE TABLE IF NOT EXISTS api_books_fact (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ol_key           TEXT UNIQUE,    -- Open Library book key
    isbn             TEXT,
    title            TEXT,
    author           TEXT,
    publisher        TEXT,
    subject          TEXT,
    publish_year     INTEGER,
    publish_decade   TEXT,           -- e.g. "1990s"
    pages            REAL,
    page_tier        TEXT,           -- e.g. "Medium (100-300)"
    avg_rating       REAL,
    rating_count     REAL,
    is_highly_rated  INTEGER,        -- 0 or 1
    has_isbn         INTEGER,        -- 0 or 1
    popularity_score REAL,
    title_word_count INTEGER,
    api_source       TEXT,           -- which endpoint it came from
    loaded_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

**Pipeline run log table:**

```sql
CREATE TABLE IF NOT EXISTS pipeline_run_log (
    run_id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    run_timestamp           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sources_attempted       INTEGER,
    records_extracted       INTEGER,
    records_after_transform INTEGER,
    records_loaded          INTEGER,
    load_strategy           TEXT,
    total_ms                INTEGER,
    status                  TEXT,    -- SUCCESS or FAILED
    error_msg               TEXT
)
```

---

### Phase iv — END-TO-END VERIFICATION & REPORTING

**Function:** `verify_and_report(df_transformed)`

5 verification checks performed automatically after every pipeline run:

| Check | What It Verifies |
|-------|-----------------|
| **Row Count Check** | DB row count ≥ DataFrame rows (no data loss during load) |
| **Schema Validation** | Required columns (`ol_key`, `title`, `author`, `avg_rating`, `api_source`) all present |
| **Sample Aggregation** | GROUP BY api_source → total books, avg rating, avg pages |
| **Page Tier Distribution** | COUNT per tier (Short / Medium / Long / Comprehensive) |
| **Data Quality Summary** | Records with/without ISBN, highly rated, zero-rating records |
| **Top 5 by Popularity** | Top books by `popularity_score` |

---

## 🛩️ Apache Airflow DAG (Conceptual)

**Location:** `week4.html` → Apache Airflow section

The UI shows a visual **DAG (Directed Acyclic Graph)** of the pipeline:

```
[start] → [check_api_health] → [extract_api_data] → [stage_raw_data]
                                                              ↓
[transform_clean] → [feature_engineer] → [validate_schema] → [load_warehouse] → [end]
```

**DAG Code:**
```python
with DAG(
    dag_id='books_etl',
    schedule_interval='@daily',
    start_date=datetime(2026, 8, 1),
    catchup=False,
) as dag:
    extract   = PythonOperator(task_id='extract_api_data',  python_callable=extract_fn)
    transform = PythonOperator(task_id='transform_clean',   python_callable=transform_fn)
    load      = PythonOperator(task_id='load_warehouse',    python_callable=load_fn)

    extract >> transform >> load  # DAG dependency chain
```

**What each node means:**

| DAG Node | What it Does |
|----------|--------------|
| `start` | Trigger point — pipeline begins |
| `check_api_health` | HTTP health check before extracting |
| `extract_api_data` | Calls Open Library API endpoints |
| `stage_raw_data` | Writes raw response to staging area |
| `transform_clean` | Runs the 8-step cleaning pipeline |
| `feature_engineer` | Derives new columns |
| `validate_schema` | Checks required columns exist |
| `load_warehouse` | Writes to SQLite target |
| `end` | Marks DAG run as complete |

**Node status colours:**
- 🟢 `success` — completed successfully
- 🔵 `running` — currently executing
- ⚪ `pending` — waiting for upstream dependencies
- 🔴 `failed` — encountered an error

---

## 📡 Apache Kafka (Conceptual Streaming Architecture)

**Location:** `week4.html` → Apache Kafka section

Demonstrates how the same pipeline would work in a **streaming (real-time) context** instead of batch:

```
[Producer: Books API] ──messages──► [Kafka Broker (3 partitions)] ──messages──► [Consumer: PySpark] → [Data Warehouse]
Topic: books.raw                     Replication Factor: 2                        Offset: latest
```

**Kafka code shown:**
```python
# Producer — publishes book records to 'books.raw' topic
producer = KafkaProducer(
    bootstrap_servers=['localhost:9092'],
    value_serializer=lambda v: json.dumps(v).encode('utf-8')
)
producer.send('books.raw', {'isbn': '9781509858637', 'price': 7.6})

# Consumer — reads from 'books.raw' and transforms
consumer = KafkaConsumer('books.raw', bootstrap_servers=['localhost:9092'])
for msg in consumer:
    record = json.loads(msg.value)
    process_and_load(record)
```

**Key concepts:**
- **Topic:** Named channel (`books.raw`) where messages are published
- **Partitions:** 3 parallel lanes for scalability
- **Replication Factor:** 2 copies of each message for fault tolerance
- **Consumer Group:** PySpark cluster consuming and processing messages
- **Offset:** Tracks how far the consumer has read (`latest` = only new messages)

---

## 🔥 PySpark Batch Code

**Location:** `week4.html` → PySpark section

Shows equivalent Spark code for large-scale batch processing:

```python
spark = SparkSession.builder.appName("BooksETL").getOrCreate()

# EXTRACT
df = spark.read.option("header", True).csv("s3://de-lab/books/raw/*.csv")

# TRANSFORM
df_clean = (
    df.dropDuplicates(["isbn"])
      .filter(col("price").isNotNull())
      .withColumn("discount_pct", (col("old_price") - col("price")) / col("old_price") * 100)
      .withColumn("is_bestseller", when(col("book_depository_stars") >= 4.5, True).otherwise(False))
)

# AGGREGATE
cube = df_clean.groupBy("category", "format", "publisher_region").agg(
    count("isbn").alias("total_books"),
    avg("price").alias("avg_price"),
    avg("book_depository_stars").alias("avg_rating")
)

# LOAD
cube.write.mode("overwrite").parquet("s3://de-lab/warehouse/books_cube/")
```

**Difference from Pandas pipeline:**
- Runs on **distributed cluster** instead of single machine
- Reads from **S3 cloud storage** instead of local CSV
- Writes to **Parquet format** for efficient columnar storage
- `groupBy().agg()` produces a multi-dimensional data cube

---

## 📊 Diagrams — Purpose & Use

### 1. Pipeline Architecture Flow

**Location:** `week4.html` — top section

```
[REST API Source] → [Extract: HTTP Pull] → [Kafka: Message Queue] → [Transform: Pandas/PySpark] → [Load: Data Warehouse]
```

**Purpose:**
- Shows the **end-to-end data flow** in a production batch pipeline
- Identifies each technology component and its role
- Shows where the Kafka streaming layer sits (between extract and transform)

---

### 2. Pipeline Throughput Chart

**Location:** `week4.html` — Pipeline Metrics Chart (ApexCharts area chart)

Shows simulated throughput over time: records processed per minute

**Purpose:**
- Visualises pipeline **performance** (how fast is it processing?)
- Identifies slowdowns or bottlenecks
- Baseline for capacity planning

---

### 3. Pipeline KPIs Progress Bars

**Location:** `week4.html` — Pipeline KPIs card

| KPI | Value | Bar |
|-----|-------|-----|
| Throughput | ~8,000 rec/min | 80% |
| Success Rate | 99.98% | 99% |
| Data Quality Score | 96.2% | 96% |
| Error Rate | 0.02% | 2% |

**Purpose:**
- At-a-glance pipeline health status
- Shows that quality targets are being met

---

### 4. Airflow DAG Visualisation

**Location:** `week4.html` → Apache Airflow section

Shows the DAG as animated node graph with success/running/pending/failed states.

**Purpose:**
- Teaches how real Airflow pipelines are structured
- Shows task dependency chains visually
- Each node represents one callable Python function

---

### 5. Kafka Message Flow Diagram

**Location:** `week4.html` → Apache Kafka section

Shows animated messages flowing from Producer → Broker → Consumer → Warehouse.

**Purpose:**
- Contrasts batch (once a day) with streaming (real-time) architecture
- Shows partitioning, replication, and consumer group concepts
- Animated `msg` bubbles simulate real message flow

---

### 6. Execution Log Table

**Location:** `week4.html` → Pipeline Execution Log

Shows logged runs from `pipeline_run_log` table:

```
Run #1  2026-08-12 21:05:00  Extracted: 250 | Transformed: 247 | Loaded: 247 | Strategy: INCREMENTAL | Time: 3421ms
```

**Purpose:**
- Audit trail — when did the pipeline run, how many records?
- Reproducibility — each run is logged for retrospective investigation

---

### 7. Live Target Warehouse Table

**Location:** `week4.html` → api_books_fact table

Shows sample records from the loaded warehouse:

| ol_key | Title | Author | Publisher | Year | Pages | Avg Rating | API Source |
|--------|-------|--------|-----------|------|-------|------------|------------|
| /works/OL12345W | The Gene | Siddhartha Mukherjee | Scribner | 2016 | 495 | 4.2 | Open Library - Science |

**Purpose:**
- Confirms the pipeline succeeded by showing actual loaded data
- Shows both raw data columns and engineered features

---

## 🚀 Running the Pipeline

```bash
# Default (incremental upsert)
python pipeline/batch_pipeline.py

# Full overwrite
python pipeline/batch_pipeline.py --strategy full
```

---

## 📂 Output Files Explained

### `outputs/week4/week4_api_batch.db`

SQLite database containing:

| Table | Contents |
|-------|----------|
| `api_books_fact` | Books extracted from Open Library API (all subjects combined) |
| `pipeline_run_log` | One row per pipeline execution with statistics |

---

## ✅ Key Takeaways

| Concept | What Week 4 Demonstrates |
|---------|--------------------------|
| **API Extraction** | HTTP GET with retry logic, timeout, error handling |
| **List Flattening** | API returns arrays; take first valid item |
| **IQR Outlier Capping** | Clip extreme values to IQR × 1.5 bounds |
| **Popularity Score** | Composite metric: `rating × log(count + 1)` |
| **Upsert Pattern** | `INSERT OR REPLACE` for idempotent incremental loads |
| **Pipeline Logging** | Metadata table tracks every run |
| **Airflow DAGs** | Dependency-graph-based pipeline orchestration |
| **Kafka Streaming** | Real-time alternative to batch processing |
| **PySpark** | Distributed batch processing at scale |
