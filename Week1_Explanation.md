# Week 1 — Data Ingestion & Exploratory Data Analysis (EDA)

> **Exercise 1 & 2 — Data Collection · Preprocessing Pipeline · Feature Engineering · EDA Charts**

---

## 📌 Overview

Week 1 focuses on the **first stage of any data engineering pipeline**: reading raw data from a source, cleaning it, enriching it with computed features, and understanding it through Exploratory Data Analysis (EDA). The output of this week feeds every subsequent exercise (Weeks 2–5).

---

## 🗂️ Files Involved

| File | Role |
|------|------|
| `main_dataset.csv` | Raw source CSV — 32,583 rows, 11 original columns |
| `app.py` → `load_and_preprocess()` | Core preprocessing pipeline |
| `app.py` → `analyze_df()` | Analytical metrics computation |
| `app.py` → `compute_pca()` | PCA dimensionality reduction |
| `templates/week1.html` | Interactive EDA dashboard UI |
| `outputs/week1/processed_books_week1.csv` | Final cleaned & enriched dataset (22,708 rows, 21 columns) |
| `outputs/week1/category_statistics.csv` | Per-category aggregate statistics |

---

## ⚙️ How the Pipeline Works (Step by Step)

### Stage 1 — Raw Ingestion (Extract)

```
main_dataset.csv ──► pd.read_csv() ──► Raw DataFrame (32,583 rows × 11 columns)
```

- Source file: `main_dataset.csv` loaded with `low_memory=False`
- **Original 11 columns**: `name`, `book_depository_stars`, `img_paths`, `author`, `format`, `category`, `price`, `old_price`, `rating`, `currency`, `isbn`
- At this stage: data has **missing values**, **duplicate ISBNs**, and **inconsistent types**

---

### Stage 2 — Column Standardisation (Transform)

```python
df.rename(columns={
    "name":                  "title",
    "book_depository_stars": "rating",
    "img_paths":             "img_path_raw",
})
```

- Renames ambiguous column names to meaningful, readable ones
- **Why?** Column names from raw datasets are often cryptic or inconsistent. Standardising them early avoids errors in downstream steps.

---

### Stage 3 — Missing Value Handling (Transform)

| Column | Strategy | Reason |
|--------|----------|--------|
| `old_price` | Fill with `price` | If no old price, assume no discount |
| `price` | Fill with **median** | Median is robust to price outliers |
| `rating` | Fill with **mode** | Most common rating is a safe default |
| `author`, `format`, `category`, `currency` | Fill with `"Unknown"` | Preserve record; flag for downstream review |
| `isbn` | Fill with empty string `""` | ISBN may be missing for older books |

---

### Stage 4 — Deduplication (Transform)

```python
df = df.drop_duplicates(subset=["isbn"], keep="first")
```

- Removes books with duplicate ISBNs — keeps the **first occurrence**
- Reduces from 32,583 → **22,708 unique books**
- **Why ISBN?** ISBN is the universal unique identifier for books

---

### Stage 5 — Type Coercion (Transform)

```python
df["price"]     = df["price"].astype(float)
df["old_price"] = df["old_price"].astype(float)
df["rating"]    = df["rating"].astype(float)
```

- Forces numeric types to prevent string/float comparison errors downstream
- Essential for mathematical feature engineering

---

### Stage 6 — Feature Engineering (Enrich)

8 new computed columns are derived from existing data:

| New Column | Formula / Logic | Purpose |
|------------|-----------------|---------|
| `discount_amount` | `old_price - price` (clipped ≥ 0) | Actual money saved |
| `discount_pct` | `(discount_amount / old_price) × 100` | Percentage discount |
| `price_gbp` | `price × 0.79` | USD → GBP conversion |
| `value_score` | `rating / price` | Higher = better value per £ |
| `is_bestseller` | `rating ≥ 4.5` (Boolean) | Highly-rated flag |
| `isbn13_valid` | Regex `^\d{13}$` | ISBN format check |
| `title_length` | `len(title)` | Title character count |
| `word_count` | `len(title.split())` | Title word count |

**2 categorical tier columns:**

| Tier Column | Bins | Logic |
|-------------|------|-------|
| `price_tier` | Budget (<$10) / Standard ($10-25) / Premium ($25-50) / Luxury (>$50) | Groups books by price range |
| `discount_tier` | No Discount / Low (<15%) / Medium (15-35%) / High (>35%) | Groups by discount depth |

---

### Stage 7 — Cover Path Remapping (Enrich)

```python
df["cover_url"] = df["img_path_raw"].apply(remap_cover)
# "dataset/Medical/0000001.jpg" → "/covers/Medical/0000001.jpg"
```

- Remaps raw cloud image URLs to **locally served cover images** from the `book-covers/` directory
- Enables the Cover Gallery UI to display actual book thumbnails

---

### Stage 8 — Analytical Store (Load)

```python
df_export.to_csv(WEEK1_PROCESSED_CSV, index=False)
# → outputs/week1/processed_books_week1.csv
pd.DataFrame(cat_stats).to_csv(WEEK1_CAT_STATS_CSV, index=False)
# → outputs/week1/category_statistics.csv
```

---

## 📊 EDA Diagrams — Purpose & Use

### 1. Pipeline Stage Flow Diagram

**Location:** `week1.html` → Tab 1: Pipeline & Summary

```
[Raw Ingestion] → [Standardisation] → [Cleaning & Dedup] → [Feature Engg.] → [Cover Resolution] → [Analytical Store]
 32,583 rows        32,583 rows          22,708 rows          22,708 rows        22,708 rows          22,708 rows
  11 cols            11 cols              11 cols               18 cols            19 cols               19 cols
```

**Purpose:**
- Shows the **before → after transformation** at each pipeline stage
- Communicates how many rows and columns change at each step
- Identifies where data loss (deduplication) occurs
- Helps data engineers **trace data lineage**

**Use:** Quality assurance, debugging, stakeholder communication

---

### 2. Statistical Percentile Bar Charts (7-Point)

**Location:** Tab 3 → Visual EDA Charts → Per-column stat bars

For each numeric column (`price`, `rating`, `old_price`, `discount_pct`, `value_score`), the chart shows:

> **Min → Q25 → Median → Mean → Q75 → Q90 → Max**

**Purpose:**
- Reveals **distribution shape** (skewed vs symmetric)
- Identifies if mean >> median (right-skewed; outliers exist)
- Shows data spread without a full histogram

**Use:** Outlier detection, sanity checking values, understanding what is "normal"

---

### 3. Category Breakdown Donut / Bar Chart

**Location:** Tab 1 → Category Statistics Section

Shows: total books per category, avg price, avg rating, avg discount %, bestseller count

**Purpose:**
- Identifies which categories dominate the catalog (e.g. Medical, Computing)
- Reveals which categories have the best discounts or highest ratings
- Drives business decisions: which genre to expand inventory?

**Use:** Market analysis, inventory planning, pricing strategy

---

### 4. PCA 2D Scatter Plot

**Location:** Tab 3 → Visual EDA Charts → PCA Dimensionality Reduction

```
5 numeric features: [price, rating, old_price, discount_pct, value_score]
    ↓  StandardScaler (z-score normalisation)
    ↓  PCA (n_components=2)
    ↓  PC1, PC2 axes
    → Scatter plot (120 sampled points, coloured by category)
```

**Purpose:**
- Projects 5-dimensional data onto a 2D plane for **visual inspection**
- Reveals natural **clusters** (are books from the same category grouped together?)
- Shows **variance explained** (PC1 + PC2 = X% of total variation)
- Identifies **outlier books** that sit far from their cluster

**Use:** Feature selection, anomaly detection, understanding which dimensions drive variance

---

### 5. Correlation Matrix Heatmap

**Location:** Tab 3 → Visual EDA Charts → Correlation Matrix

Shows pairwise correlations between numeric columns (values: -1 to +1)

**Purpose:**
- Detects **multicollinearity** (e.g. `price` and `old_price` are highly correlated — expected)
- Reveals unexpected relationships (e.g. does discount % correlate with rating?)
- Guides feature selection for ML models

**Use:** Avoid redundant features, understand causal relationships

---

### 6. Price Tier & Discount Tier Bar Charts

**Location:** Tab 1 → Pipeline Summary

Shows distribution of books across price and discount bins.

**Purpose:**
- Answers: "What fraction of our catalog is Budget vs Premium?"
- Shows if discounts are common or rare across the catalog

---

### 7. Cover Gallery Grid

**Location:** Tab 4 → Data & Cover Gallery

Shows actual book cover images with title, author, category, rating badges.

**Purpose:**
- Visual **sanity check**: confirms cover path remapping worked
- Allows quick browsing of the dataset's actual content

---

## 📂 Output Files Explained

### `outputs/week1/processed_books_week1.csv`

- **Rows:** 22,708 (deduplicated from 32,583)
- **Columns:** 21 (original 11 + 10 engineered features)

| Column | Type | Source |
|--------|------|--------|
| `title` | str | renamed from `name` |
| `author` | str | original |
| `format` | str | original |
| `rating` | float | renamed from `book_depository_stars` |
| `price` | float | original |
| `old_price` | float | imputed |
| `isbn` | str | original |
| `category` | str | original |
| `discount_amount` | float | **engineered** |
| `discount_pct` | float | **engineered** |
| `price_gbp` | float | **engineered** |
| `value_score` | float | **engineered** |
| `is_bestseller` | bool | **engineered** |
| `isbn13_valid` | bool | **engineered** |
| `title_length` | int | **engineered** |
| `word_count` | int | **engineered** |
| `price_tier` | str | **engineered** |
| `discount_tier` | str | **engineered** |
| `cover_url` | str | **remapped** |

### `outputs/week1/category_statistics.csv`

- Aggregate metrics per category: `total_books`, `avg_price_usd`, `avg_rating`, `avg_discount`, `bestsellers`
- Used by the Category Breakdown chart

---

## 🔗 Connection to Other Weeks

```
Week 1 Output (processed_books_week1.csv)
    │
    ├──► Week 2: ETL Pipeline (source for the 3-step ETL exercise)
    ├──► Week 3: Data Warehouse Design (populates Star Schema dimension tables)
    └──► Week 5: Resilient Pipelines (input for quality validation gates)
```

> **Week 1 is the foundation layer.** Every subsequent week consumes the enriched 22,708-row dataset produced here.

---

## ✅ Key Takeaways

| Concept | What Week 1 Demonstrates |
|---------|--------------------------|
| **Data Ingestion** | Reading CSV with Pandas, handling encoding |
| **Data Cleaning** | Null imputation, deduplication by key |
| **Feature Engineering** | Deriving business metrics from raw data |
| **EDA** | Statistical summaries, distributions, correlations, PCA |
| **Data Lineage** | Tracking row/column counts through each stage |
| **Output Materialisation** | Writing processed data to CSV for downstream use |
