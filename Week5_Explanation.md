# Week 5 — CI/CD and Version Control for Data Pipelines

> **Exercise 5 — Git Branching Strategies · Pipeline as Code · Automated Testing · GitHub Actions CI/CD**

---

## 📌 Executive Summary

Modern data engineering requires the same engineering rigor as traditional software development. **DataOps** integrates **Version Control (Git)**, **Pipeline as Code**, and **Automated Continuous Integration / Continuous Deployment (CI/CD)** to ensure that data pipelines are reliable, reproducible, testable, and maintainable.

This guide details:
1. **Code Versioning & Branching Strategies**: Branching models tailored specifically for data engineering teams.
2. **Pipeline as Code**: Managing infrastructure, configurations, and DAG definitions programmatically.
3. **Automated Testing Suite**: Unit testing data transformation logic, mocking API and database dependencies, and data quality validation gates.
4. **GitHub Actions Workflows**: Multi-version test runners, linting, code coverage, and automated deployment verification.

---

## 🗂️ Project CI/CD Architecture & Files

```
book_pipeline/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Main CI Workflow: Linting + Multi-Python Test Matrix
│       └── pipeline_cd.yml        # CD Workflow: Staging Deployment & Quality Gates
├── config/
│   ├── __init__.py                # Config Package Initializer
│   ├── pipeline_config.py         # Programmatic Config Loader (DEV / STAGING / PROD)
│   └── pipeline_config.yaml       # Declarative Pipeline & Endpoint Specification
├── pipeline/
│   └── batch_pipeline.py          # Core Batch ETL Pipeline & Data Quality Gate Logic
├── tests/
│   ├── __init__.py
│   ├── conftest.py                # Shared Pytest Fixtures & Synthetic Payloads
│   ├── test_transformations.py    # Granular Unit Tests for Data Transformations
│   ├── test_mock_pipeline.py      # Mock Tests for API Retries & Database Boundaries
│   └── test_data_quality.py       # Data Quality & Integrity Validation Gates
├── pytest.ini                     # Pytest Discovery & Marker Configurations
├── run_ci.py                      # Local CI Runner (Simulates GitHub Actions locally)
├── requirements.txt               # Dependencies (Flask, Pandas, Pytest, etc.)
└── Week5_Explanation.md           # Comprehensive Technical Documentation
```

---

## 🌿 1. Code Versioning & Git Branching Strategies for Data Teams

Data engineering repositories have unique requirements compared to web apps: they handle **code evolution**, **database schema migrations**, **pipeline orchestration configs**, and **data contracts**.

```
                       [ feature/add-popularity-score ]
                                    \        /
[ main / prod ] ──●──────────────────●──────●───────●──> Production Pipeline
                   \                /      /
[ develop ]         ●──●──────────●───────●─────────> Staging / Integration
                        \        /
                   [ feature/api-retry-backoff ]
```

### Key Branching Models for Data Engineering

| Branch Strategy | How It Works in Data Teams | When to Use |
|-----------------|----------------------------|-------------|
| **Trunk-Based Development** | Developers commit short-lived feature branches directly into `main` after passing automated CI tests and schema checks. | Fast-paced teams with robust automated testing and feature flags. |
| **GitFlow for DataOps** | Separate long-lived branches: `main` (production warehouse), `develop` (staging/dev warehouse), `feature/*` (local development), `release/*` (pre-prod quality gates). | Enterprise data platforms with strict governance and staging data validation. |

### Best Practices Tailored for Data Teams

1. **Never Commit Raw Data or Credentials**:
   - Exclude `.csv`, `.db`, `.parquet`, `.env`, and secret keys via `.gitignore`.
2. **Atomic Commits for Schema Migrations**:
   - Keep SQL DDL changes and corresponding Pandas transformation updates in the same commit to prevent schema drift.
3. **Data Contract Versioning**:
   - When API schemas or table columns change, tag releases using **Semantic Versioning** (`vMAJOR.MINOR.PATCH`).
4. **Pull Request Validation Gates**:
   - Require 100% test pass on all unit and mock tests before merging into `main`.

---

## ⚙️ 2. Pipeline as Code: Programmatic Configuration

**Pipeline as Code** treats pipeline parameters, schedules, schema definitions, and validation rules as version-controlled code rather than manual UI settings.

### Declarative Configuration (`config/pipeline_config.yaml`)

```yaml
app_env: "development"

pipeline:
  name: "OpenLibraryBatchETL"
  version: "1.2.0"
  request_timeout_seconds: 30
  max_retries: 3
  retry_delay_seconds: 2

endpoints:
  - name: "Open Library - Science"
    url: "https://openlibrary.org/search.json"
    subject: "science"
    limit: 100
  - name: "Open Library - Technology"
    url: "https://openlibrary.org/search.json"
    subject: "technology"
    limit: 100

database:
  db_path: "outputs/week4/week4_api_batch.db"
  target_table: "api_books_fact"
  log_table: "pipeline_run_log"

validation_rules:
  min_rows_expected: 1
  max_allowed_null_pct: 0.05
  valid_rating_min: 0.0
  valid_rating_max: 5.0
```

### Programmatic Loader (`config/pipeline_config.py`)

The loader dynamically injects environment overrides (e.g., using in-memory databases during automated testing, or adjusting retry backoffs in production):

```python
from config import load_config

# Load config with automatic environment override
config = load_config()
print(f"Running pipeline '{config['pipeline']['name']}' in {config['app_env']} environment.")
```

---

## 🧪 3. Continuous Integration: Test Pyramid for Data Pipelines

Data pipeline testing is structured across three primary tiers:

```
        / \
       /   \     Data Quality Gates (Schema integrity, null thresholds, ranges)
      / ---- \
     / Mock   \  Mock Tests (API HTTP 429/503 responses, In-Memory DB loads)
    /  Tests   \
   / ----------- \
  /  Unit Tests   \  Unit Tests (Cleaning, flattening, type casting, feature eng)
 /_________________\
```

### A. Unit Testing Data Transformations (`tests/test_transformations.py`)

Unit tests validate pure transformation logic on synthetic DataFrames without making network requests or touching the disk:

1. **Column Standardisation**: Ensures raw API field names are mapped to standard fact table columns.
2. **List Flattening**: Verifies nested API arrays (e.g. `["Jane Doe", "John Smith"]`) are extracted to string scalars (`"Jane Doe"`).
3. **Type Coercion**: Verifies strings like `"2021"` are safely converted into numeric floats/ints.
4. **Missing Value Imputation**: Asserts all null values in critical fields are replaced with medians or descriptive defaults (e.g., `"Unknown Author"`).
5. **Deduplication**: Verifies duplicate records by `ol_key` and fallback `isbn` are eliminated.
6. **Feature Engineering**: Validates computed columns:
   - `publish_decade` (e.g., `2021` → `'2020s'`)
   - `page_tier` (`Short`, `Medium`, `Long`, `Comprehensive`)
   - `rating_category` (`Excellent (4.5+)`, `Good (4.0-4.5)`, `Average (3.0-4.0)`, `Below Average (<3.0)`)
   - `popularity_score` ($avg\_rating \times \ln(count + 1)$)

### B. Mock Testing External Boundaries (`tests/test_mock_pipeline.py`)

Mocking isolates the pipeline from flaky external networks and production databases:

- **Mocking REST API (`requests.get`)**: Uses `unittest.mock.patch` to return predefined JSON payloads.
- **Error Handling & Retry Verification**:
  - `HTTP 429` (Rate Limiting) → Confirms `RuntimeError` is raised.
  - `HTTP 503` (Service Unavailable) → Confirms graceful error reporting.
  - `requests.exceptions.ConnectionError` → Verifies retry loop executes up to 3 times before failing.
- **Mock Database Operations**: Uses SQLite `:memory:` or `pytest tmp_path` to test idempotent upserts and log updates without polluting real databases.

### C. Data Quality Validation Gates (`tests/test_data_quality.py`)

Validation gates execute automated assertions against transformed datasets before loading into downstream warehouse tables:

```python
passed, checks = verify_data_quality(df_clean)
assert passed is True
```

Checks performed:
- `Row count > 0`
- `Critical columns null threshold (< 5%)`
- `Rating range bounds [0.0 - 5.0]`
- `Publish year bounds [1000 - 2030]`
- `Primary key (ol_key) uniqueness`

---

## 🚀 4. GitHub Actions CI/CD Pipeline

The project includes an enterprise-grade GitHub Actions workflow (`.github/workflows/ci.yml`):

### Workflow Features

1. **Automated Triggers**: Runs automatically on every `push` and `pull_request` to `main`, `master`, and `feature/**` branches.
2. **Multi-Version Test Matrix**: Tests across **Python 3.10, 3.11, and 3.12** concurrently.
3. **Dependency Caching**: Caches pip dependencies between runs for sub-minute execution speeds.
4. **Linting & Syntax Verification**: Checks code quality and syntax with `py_compile` and `flake8`.
5. **Granular Test Stages**:
   - `pytest tests/test_transformations.py -m unit`
   - `pytest tests/test_mock_pipeline.py -m mock`
   - `pytest tests/test_data_quality.py -m quality`
6. **Artifact Upload**: Generates and uploads JUnit test reports for pull request visualization.

---

## 💻 5. Running Tests Locally

### Quick Execution with `pytest`

```bash
# Run all tests with verbose output
python -m pytest tests/ -v

# Run only unit tests for transformation logic
python -m pytest tests/test_transformations.py -v -m unit

# Run mock tests for API extraction & database loads
python -m pytest tests/test_mock_pipeline.py -v -m mock

# Run data quality gate tests
python -m pytest tests/test_data_quality.py -v -m quality
```

### Complete Local CI Simulation with `run_ci.py`

Run the entire CI pipeline locally with one command before pushing commits:

```bash
python run_ci.py
```

**Sample Output:**
```
======================================================================
  🚀  DATA ENGINEERING CI/CD LOCAL TEST RUNNER
======================================================================
  Working Directory : D:\Elan\Lab\DE\Ex(1-2)
  Python Version    : 3.10.8
  Environment       : development

▶ [14:53:14] RUNNING STAGE: Python Syntax & Compilation Check...
✅ [14:53:15] STAGE PASSED: Python Syntax & Compilation Check (0.12s)

▶ [14:53:15] RUNNING STAGE: Configuration as Code Validation...
Config validated successfully.
✅ [14:53:15] STAGE PASSED: Configuration as Code Validation (0.15s)

▶ [14:53:15] RUNNING STAGE: Unit Tests (Transformation Logic)...
✅ [14:53:16] STAGE PASSED: Unit Tests (Transformation Logic) (0.52s)

▶ [14:53:16] RUNNING STAGE: Mock Tests (API & Database Boundaries)...
✅ [14:53:16] STAGE PASSED: Mock Tests (API & Database Boundaries) (0.45s)

▶ [14:53:16] RUNNING STAGE: Data Quality & Schema Validation Gates...
✅ [14:53:17] STAGE PASSED: Data Quality & Schema Validation Gates (0.41s)

▶ [14:53:17] RUNNING STAGE: Full Test Suite Execution...
✅ [14:53:18] STAGE PASSED: Full Test Suite Execution (0.68s)

======================================================================
🎉  ALL CI/CD STAGES PASSED SUCCESSFULLY in 2.33s!
    Code is verified and ready for Git commit and GitHub Actions deployment.
======================================================================
```

---

## 📋 Summary of Deliverables

| Component | Status | Description |
|-----------|--------|-------------|
| **Git Versioning & Branching Strategy** | ✅ Complete | Documented branching strategies, commit isolation, and migration workflows. |
| **Pipeline as Code** | ✅ Complete | Declarative YAML config and dynamic environment loader (`config/`). |
| **Unit Testing Suite** | ✅ Complete | 8 granular tests covering all transformation, cleaning, and imputation logic. |
| **Mock Testing Suite** | ✅ Complete | 5 mock tests isolating API calls (HTTP 200, 429, 503, retry policies) and database. |
| **Data Quality Gate Tests** | ✅ Complete | 3 automated validation gates verifying schema, null percentages, and ranges. |
| **GitHub Actions Workflows** | ✅ Complete | Multi-Python matrix CI workflow (`ci.yml`) and staging CD workflow (`pipeline_cd.yml`). |
| **Local CI Runner** | ✅ Complete | Instantaneous pre-commit validation tool (`run_ci.py`). |
