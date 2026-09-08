# End-to-End Book Pipeline — Data Engineering Platform

An interactive, production-ready Data Engineering Laboratory Platform built with **Python**, **Pandas**, **Flask**, **SQLite**, **Pytest**, and **GitHub Actions**.

---

## 🌟 Key Features & Architecture

This application implements 5 core data engineering pipeline exercises:

### 1. Exercise 1 — Data Ingestion & Exploratory Data Analysis (EDA)
- **Visual Preprocessing Pipeline**: Raw CSV ingestion → Deduplication → Null Imputation → Feature Engineering → SQLite Fact Table load.
- **PCA 2D Dimensionality Reduction**: Standardizes 5 numerical features (`price`, `rating`, `old_price`, `discount_pct`, `value_score`) and projects them onto 2 principal component axes using `scikit-learn`.
- **7-Point Statistical Percentiles**: Intuitive metric bar charts showing `Min`, `Q25`, `Median`, `Mean`, `Q75`, `Q90`, and `Max`.
- **Catalog Category Breakdown**: Subject category volume metrics alongside binned Price Tier and Discount Tier distributions.

### 2. Exercise 2 — ETL Pipeline (Extract, Transform, Load)
- **Step-by-Step Execution**: 3 separate interactive step buttons:
  - **Step 1: Extract** — Reads source data, checks schema, counts nulls and duplicate ISBN keys.
  - **Step 2: Transform** — Cleans nulls, deduplicates, and computes 8 engineered features (`discount_amount`, `discount_pct`, `price_gbp`, `value_score`, `is_bestseller`, `isbn13_valid`, `title_length`, `word_count`).
  - **Step 3: Load** — Writes clean records to local target SQLite database (`outputs/week2/week2_etl.db`) using **Full Load** or **Incremental Load** strategies.
- **Live Terminal Console**: Real-time timestamped pipeline execution logs.
- **Change Data Capture (CDC)**: Compares 2 CSV snapshots to identify `INSERT`, `UPDATE`, and `DELETE` events.

### 3. Exercise 3 — Data Warehouse Design & Dimensional Modeling
- **3NF Relational OLTP**: Normalized schema (`books`, `authors`, `publishers`, `categories`, `orders`) stored in `outputs/week3/week3_oltp.db`.
- **Star Schema Data Warehouse**: Dimension tables (`dim_category`, `dim_publisher`, `dim_format`, `dim_time`) surrounding `fact_book_sales` in `outputs/week3/week3_olap.db`.
- **Live OLAP Operations**: Interactively execute **Slicing**, **Dicing**, **Rollup**, and **Drilldown** SQL queries against the physical SQLite Data Warehouse.

### 4. Exercise 4 — Resilient Data Pipelines & API Batch ETL
- **Batch API Ingestion**: Extracts live book records from the Open Library REST API with exponential back-off retries.
- **Automated Data Quality Validation Gates**: Null checks, schema verification, outlier boundaries (IQR $\times 1.5$), and primary key integrity checks.
- **Idempotency & ACID Transactions**: Deterministic SHA-256 checksum verification and atomic commits/rollbacks.

### 5. Exercise 5 — CI/CD & Version Control for Data
- **Git Branching Strategies**: Trunk-based vs GitFlow tailored for data engineering teams, schema evolution, and data contract testing.
- **Pipeline as Code**: Programmatic, declarative YAML configurations (`config/pipeline_config.yaml`) with environment overrides (`DEV`, `STAGING`, `PROD`).
- **Comprehensive Testing Suite**:
  - **Unit Tests**: Granular tests for cleaning, flattening, imputation, deduplication, and feature engineering (`tests/test_transformations.py`).
  - **Mock Tests**: Isolates external REST API endpoints (`requests.get`) and database loads (`tests/test_mock_pipeline.py`).
  - **Data Quality Gates**: Automated assertion tests enforcing zero critical nulls and valid rating/year boundaries (`tests/test_data_quality.py`).
- **GitHub Actions Workflows**: Multi-Python matrix CI (`3.10`, `3.11`, `3.12`), linting (`flake8`), automated test execution, and staging CD workflows (`.github/workflows/ci.yml`, `pipeline_cd.yml`).
- **Local CI Runner**: Fast pre-commit runner script (`python run_ci.py`).

---

## 🛠️ Tech Stack

- **Backend Framework**: Python 3, Flask, SQLite3
- **Data Engineering & Analytics**: Pandas, NumPy, Scikit-Learn (PCA), PyYAML, Requests
- **Testing & CI/CD**: Pytest, Pytest-Mock, Flake8, GitHub Actions
- **Frontend & Visualization**: Modern HTML5, CSS3 Glassmorphism UI, Vanilla JS, ApexCharts, FontAwesome 6

---

## 🚀 Getting Started

1. **Clone the repository**:
   ```bash
   git clone https://github.com/elan-13/book_pipeline.git
   cd book_pipeline
   ```

2. **Create and activate a Python virtual environment**:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate   # Windows
   # source .venv/bin/activate  # Linux/macOS
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the Automated CI/CD Test Suite Locally**:
   ```bash
   python run_ci.py
   # Or run pytest directly
   python -m pytest tests/ -v
   ```

5. **Run the Flask Web Dashboard**:
   ```bash
   python app.py
   ```
   Navigate to `http://127.0.0.1:5000`

---

## 📁 Repository Structure

```
book_pipeline/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # GitHub Actions CI Workflow (Lint + Test Matrix)
│       └── pipeline_cd.yml        # GitHub Actions CD Workflow (Staging Deployment)
├── config/
│   ├── pipeline_config.py         # Programmatic Configuration Loader
│   └── pipeline_config.yaml       # Declarative Pipeline & Endpoint Specification
├── pipeline/
│   └── batch_pipeline.py          # Core Batch ETL Pipeline & Transformation Logic
├── tests/
│   ├── conftest.py                # Pytest Fixtures & Mock Payloads
│   ├── test_transformations.py    # Unit Tests for Transformation Logic
│   ├── test_mock_pipeline.py      # Mock Tests for API & DB Boundaries
│   └── test_data_quality.py       # Data Quality Validation Gate Tests
├── templates/                     # HTML Jinja2 Templates (base, week1, week2, week3, week5)
├── static/                        # CSS / JS Static Assets
├── run_ci.py                      # Local CI Test Runner
├── pytest.ini                     # Pytest Configurations
├── requirements.txt               # Dependencies
├── .gitignore                     # Excludes CSVs, DBs, and outputs
├── Week1_Explanation.md           # Ex 1 Ingestion & EDA Documentation
├── Week2_Explanation.md           # Ex 2 ETL Pipeline Documentation
├── Week3_Explanation.md           # Ex 3 Data Warehouse & OLAP Documentation
├── Week4_Explanation.md           # Ex 4 API Batch Pipeline Documentation
├── Week5_Explanation.md           # Ex 5 CI/CD & Version Control Documentation
└── README.md                      # Project Documentation
```
