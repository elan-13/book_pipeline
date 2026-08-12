# End-to-End Book Pipeline — Data Engineering Platform

An interactive, web-based Data Engineering Laboratory Platform built with **Flask**, **Pandas**, **NumPy**, **Scikit-Learn**, and **SQLite**.

---

## 🌟 Key Features & Architecture

This application implements 4 core data engineering pipeline exercises:

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

### 4. Exercise 4 — Resilient Data Pipelines
- **Automated Data Quality Validation Gates**: Null checks, schema verification, outlier boundaries (IQR $\times 1.5$), and primary key integrity checks.
- **Idempotency**: Deterministic SHA-256 checksum verification across repeated pipeline runs.
- **Atomicity Visualizer**: Demonstrates ACID transaction control (all-or-nothing commits vs rollback on error).
- **Error Handling & Backfill Simulator**: Exponential back-off retry logic and historical partition recovery.

---

## 🛠️ Tech Stack

- **Backend Framework**: Python 3, Flask, SQLite3
- **Data Engineering & Analytics**: Pandas, NumPy, Scikit-Learn (PCA), PapaParse
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
   pip install flask pandas numpy scikit-learn
   ```

4. **Run the Flask application**:
   ```bash
   python app.py
   ```

5. **Open in your browser**:
   Navigate to `http://127.0.0.1:5000`

---

## 📁 Repository Structure

```
book_pipeline/
├── app.py                   # Main Flask Application & API Routes
├── templates/               # HTML Jinja2 Templates (base, week1, week2, week3, week5)
├── static/                  # Client Assets
│   ├── css/style.css        # Premium Dark-Mode CSS Design Tokens
│   └── js/main.js           # Client-Side Interactivity & ApexCharts Rendering
├── pipeline/                # Core ETL Pipeline Modules
├── requirements.txt         # Dependency List
├── .gitignore               # Excludes large CSVs, DBs, and outputs/
└── README.md                # Project Documentation
```
