# Week 3 — Data Warehouse Design & Dimensional Modeling

> **Exercise 3 — OLTP vs OLAP · Star & Snowflake Schemas · Dimensional Modeling · Live SQL Queries**

---

## 📌 Overview

Week 3 introduces **Data Warehouse architecture concepts** — the difference between OLTP and OLAP systems, dimensional modeling with Star and Snowflake schemas, Data Cubes, and live interactive OLAP SQL operations. The schemas are populated with real data from the Week 1 processed dataset.

---

## 🗂️ Files Involved

| File | Role |
|------|------|
| `templates/week3.html` | Interactive data warehouse UI |
| `app.py` → `build_star_schema_data()` | Builds dimension and fact table samples (Lines 719–756) |
| `app.py` → `build_cube_data()` | Builds multi-dimensional Data Cube aggregations (Lines 759–782) |
| `app.py` → `init_week3_databases()` | Creates OLTP and OLAP physical SQLite databases |
| `outputs/week3/week3_oltp.db` | 3NF Normalised OLTP database (647 KB) |
| `outputs/week3/week3_olap.db` | Star Schema OLAP data warehouse (1.8 MB) |

---

## 🏗️ OLTP vs OLAP — Conceptual Overview

### OLTP — Online Transaction Processing

```
Purpose:     Day-to-day operational transactions (CRUD)
Schema:      Normalised (3NF) — no data redundancy
Query type:  Simple, fast, indexed lookups
Optimised:   Write throughput
Example:     Order entry system, banking app, library system
Data volume: Gigabytes
```

**OLTP in this project:**
- Stored in `outputs/week3/week3_oltp.db`
- Tables: `books`, `authors`, `publishers`, `categories`, `orders`
- Each entity in its own table → relationships enforced via foreign keys
- Fast inserts/updates but complex JOINs needed for analysis

---

### OLAP — Online Analytical Processing

```
Purpose:     Complex analytical queries across large datasets
Schema:      Denormalised — Star or Snowflake schema
Query type:  Complex aggregations, GROUP BY, multi-table JOINs
Optimised:   Read throughput / query speed
Example:     Data warehouse, BI dashboards, trend analysis
Data volume: Terabytes
```

**OLAP in this project:**
- Stored in `outputs/week3/week3_olap.db`
- Central `fact_book_sales` surrounded by `dim_category`, `dim_publisher`, `dim_format`, `dim_time`
- Pre-joined, denormalised → fast for analytics

---

## ⭐ Star Schema Design

### Structure

```
                    ┌──────────────┐
                    │  dim_category│
                    │  PK: cat_key │
                    │  cat_name    │
                    │  parent_cat  │
                    └──────┬───────┘
                           │ FK
         ┌─────────────────▼─────────────────┐
┌────────┤                                   ├────────┐
│dim_time│     ⭐ fact_book_sales             │dim_pub │
│PK:t_key│     PK:  sale_id                 │PK:p_key│
│year    │     FK:  isbn VARCHAR(13)         │pub_name│
│quarter │     FK:  category_key INT         │region  │
│month   │     FK:  publisher_key INT        └────────┘
└────────┘     FK:  format_key INT
               FK:  time_key INT         ┌────────────┐
               price DECIMAL             │  dim_format│
               old_price DECIMAL         │  PK: f_key │
               discount DECIMAL          │  format_name│
               rating FLOAT              └────────────┘
```

### Why Star Schema?

| Feature | Benefit |
|---------|---------|
| **One central fact table** | Clear focal point for all queries |
| **Denormalised dimensions** | Fewer JOINs needed for aggregations |
| **Foreign keys** | Maintain referential integrity |
| **Simple queries** | `SELECT category, SUM(price) FROM fact JOIN dim GROUP BY category` |

### Dimension Tables

**`dim_category`**
```sql
category_key INT  (PK)
category_name VARCHAR  -- e.g. "Medical", "Computing"
parent_category VARCHAR -- e.g. "Medical" → "Medical"
```

**`dim_publisher`**
```sql
publisher_key INT (PK)
publisher_name VARCHAR
region VARCHAR  -- e.g. "UK"
```

**`dim_format`**
```sql
format_key INT (PK)
format_name VARCHAR  -- e.g. "Paperback", "Hardcover", "Kindle"
```

**`dim_time`**
```sql
time_key INT (PK)
year INT      -- e.g. 2024
quarter VARCHAR -- e.g. "Q1"
month INT     -- e.g. 1
```

### Fact Table: `fact_book_sales`

```sql
sale_id BIGINT (PK)
isbn VARCHAR(13) (FK → book identifier)
category_key INT (FK → dim_category)
publisher_key INT (FK → dim_publisher)
format_key INT (FK → dim_format)
time_key INT (FK → dim_time)
price DECIMAL(10,2)
old_price DECIMAL(10,2)
discount DECIMAL(10,2)
rating FLOAT
```

---

## ❄️ Snowflake Schema Design

The Snowflake schema **normalises** the dimension tables further by splitting them into sub-dimensions:

```
dim_category ──FK──► dim_genre
    (category_key, category_name, genre_key)   (genre_key, genre_name, description)

dim_publisher ──FK──► dim_region
    (publisher_key, publisher_name, region_key)  (region_key, region_name, country)
```

### Star vs Snowflake Comparison

| Feature | Star Schema | Snowflake Schema |
|---------|-------------|------------------|
| Dimension normalisation | Denormalised (flat) | Normalised (sub-tables) |
| Storage | More redundancy | Less redundancy |
| Query complexity | Simple (fewer JOINs) | More JOINs required |
| Query speed | Faster | Slightly slower |
| Maintenance | Easier | More complex |
| Use case | Analytics dashboards | Large-scale DWH |

---

## 🧊 Data Cube — Multi-Dimensional Analysis

**Location:** `week3.html` → Data Cube section  
**Dimensions:** Category × Format × Region

### What is a Data Cube?

A Data Cube aggregates data across **multiple dimensions simultaneously**:

```
Axis 1: Category  (Medical, Computing, Science, ...)
Axis 2: Format    (Paperback, Hardcover, Kindle, ...)
Axis 3: Region    (Global, UK, US, ...)
```

Each **cell** in the cube = aggregate metrics for that combination:
- `COUNT(isbn)` — number of books
- `AVG(price)` — average price
- `AVG(rating)` — average rating

### Interactive Filters

The Data Cube table supports live filtering:
- Select **Category** → filter to one genre
- Select **Format** → filter to one book format
- Select **Region** → filter to one geographic region

**Purpose:**
- Enables **ad-hoc slice-and-dice analysis** without writing SQL
- Shows how data warehouses support multi-dimensional queries efficiently

---

## ⚡ Live OLAP Query Engine

**Location:** `week3.html` → Interactive OLAP Analytical Query Engine  
**Target:** `books_etl_fact` table in `delab_books.db`  
**API call:** `/api/olap/<operation>`

### 4 OLAP Operations

#### 1. SLICE (Filter on one dimension)

```sql
SELECT category, format, COUNT(*) as book_count,
       ROUND(AVG(price), 2) as avg_price_usd
FROM books_etl_fact
WHERE category = 'Computing'
GROUP BY category, format;
```

**Concept:** Fix one dimension to a single value (like slicing a cube with a knife)
**Use:** "Show me all Computing books by format"

---

#### 2. DICE (Filter on multiple dimensions)

```sql
SELECT category, format, COUNT(*) as book_count, AVG(price) as avg_price
FROM books_etl_fact
WHERE category IN ('Medical', 'Computing')
  AND price BETWEEN 10 AND 30
GROUP BY category, format;
```

**Concept:** Apply filters on multiple dimensions simultaneously
**Use:** "Show me Medical and Computing books priced between $10-$30"

---

#### 3. ROLLUP (Aggregate upward through hierarchy)

```sql
SELECT category, NULL as format,
       COUNT(*) as total_books,
       SUM(price) as total_revenue
FROM books_etl_fact
GROUP BY ROLLUP(category);
```

**Concept:** Summarise from detail level to total level (e.g. day → month → year)
**Use:** "Show me total book count and revenue by category, then grand total"

---

#### 4. DRILLDOWN (Navigate from summary to detail)

```sql
SELECT isbn, title, author, category, format, price, rating
FROM books_etl_fact
WHERE category = 'Medical'
ORDER BY rating DESC
LIMIT 15;
```

**Concept:** Opposite of rollup — go from summary to individual record level
**Use:** "Show me individual medical books sorted by highest rating"

---

## 📊 Diagrams — Purpose & Use

### 1. OLTP vs OLAP Comparison Cards

**Location:** `week3.html` — top section, side-by-side cards

Each card lists: Purpose, Schema, Query Type, Data Volume, Example, Optimised For

**Purpose:**
- Immediately communicates the **fundamental difference** between two system types
- Helps students understand when to use each architecture
- Green checkmarks visually reinforce key properties

---

### 2. Star Schema Diagram

**Location:** `week3.html` → Dimensional Schema Diagrams → Star Schema tab

Visual layout: fact table in centre, dimension tables in corners, connected by FK lines

**Purpose:**
- Shows the **hub-and-spoke** design visually
- Each table box shows field names with PK/FK labels
- Immediately recognisable architectural pattern

**Use:** Explaining schema design to developers, architects, business analysts

---

### 3. Snowflake Schema Diagram

**Location:** `week3.html` → Dimensional Schema Diagrams → Snowflake tab

Visual layout: fact table + dimension tables + sub-dimension tables branching further

**Purpose:**
- Contrasts with Star Schema — shows sub-normalisation
- `dim_publisher → dim_region` and `dim_category → dim_genre` sub-links visible

---

### 4. Dimension Tables (Real Data)

**Location:** `week3.html` → "Example Dimension Tables"

Shows live HTML tables: `dim_category`, `dim_publisher`, `dim_format`, `dim_time` populated from actual book data.

**Purpose:**
- Grounds the theoretical schema design in **real data**
- Demonstrates how raw `category` text becomes a surrogate key integer

---

### 5. fact_book_sales Sample Rows

**Location:** `week3.html` → Fact Table section

Shows 15 sample rows with foreign key integers and measure columns.

**Purpose:**
- Demonstrates how the fact table references dimensions via FK integers instead of repeating category name text
- Shows price, rating, and discount as **measures** (facts) vs keys (dimensions)

---

### 6. Data Cube Interactive Table

**Location:** `week3.html` → Data Cube section

A filterable table showing: Category × Format × Region → Count, Avg Price, Avg Rating

**Purpose:**
- Demonstrates what a "cube" query looks like in tabular form
- Shows how filtering collapses dimensions interactively

---

### 7. OLAP SQL Preview Panel

**Location:** `week3.html` → Interactive OLAP Query Engine

Shows the exact SQL statement that is being executed, along with execution time and row count.

**Purpose:**
- Transparency — you see exactly what SQL runs when you click SLICE/DICE/ROLLUP/DRILLDOWN
- Educational: teaches real OLAP SQL patterns

---

## 📂 Output Files Explained

### `outputs/week3/week3_oltp.db` (647 KB)

3NF normalised operational database:

| Table | Contents |
|-------|----------|
| `books` | Individual book records |
| `authors` | Author entities |
| `publishers` | Publisher entities |
| `categories` | Category entities |
| `orders` | Simulated order transactions |

**Schema type:** 3rd Normal Form (3NF)  
**Query strength:** Fast individual lookups, CRUD operations

---

### `outputs/week3/week3_olap.db` (1.8 MB)

Star Schema data warehouse:

| Table | Contents |
|-------|----------|
| `fact_book_sales` | Central fact table with FK references and measures |
| `dim_category` | Category dimension |
| `dim_publisher` | Publisher dimension |
| `dim_format` | Format dimension |
| `dim_time` | Time dimension (year, quarter, month) |

**Schema type:** Star Schema  
**Query strength:** Fast GROUP BY aggregations, OLAP operations

---

## 🔗 Connection to Other Weeks

```
Week 1 Output (processed_books_week1.csv)
    │
    └──► Week 3: build_star_schema_data() reads this DataFrame
         → Populates dim_category, dim_publisher, dim_format, dim_time
         → Populates fact_book_sales
         → Stored in week3_olap.db
         → Live OLAP queries run against books_etl_fact in delab_books.db
```

---

## ✅ Key Takeaways

| Concept | What Week 3 Demonstrates |
|---------|--------------------------|
| **OLTP** | 3NF normalised schema for transactional systems |
| **OLAP** | Denormalised Star Schema for analytical queries |
| **Star Schema** | Fact table + dimension tables (hub-and-spoke) |
| **Snowflake Schema** | Further normalised dimensions (sub-tables) |
| **Data Cube** | Multi-dimensional aggregation across dimensions |
| **SLICE** | Filter on a single dimension value |
| **DICE** | Filter on multiple dimension values simultaneously |
| **ROLLUP** | Aggregate upward through a hierarchy |
| **DRILLDOWN** | Navigate from summary to row-level detail |
