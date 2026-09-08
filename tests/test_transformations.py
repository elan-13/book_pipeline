"""
Unit Tests for Data Pipeline Transformation Logic.
Tests data cleaning, column standardisation, type casting, imputation, deduplication, and feature engineering.
"""

import pytest
import pandas as pd
import numpy as np
from pipeline.batch_pipeline import transform


@pytest.mark.unit
class TestDataTransformations:

    def test_column_standardisation(self, sample_raw_df):
        """Verify raw API column names are standardized into expected warehouse schema."""
        df_clean = transform(sample_raw_df)
        
        expected_columns = [
            "ol_key", "title", "author", "publish_year", "publisher",
            "isbn", "pages", "avg_rating", "rating_count", "subject",
            "api_source", "publish_decade", "page_tier", "is_highly_rated",
            "has_isbn", "rating_category"
        ]
        
        for col in expected_columns:
            assert col in df_clean.columns, f"Expected column '{col}' missing after transformation"

    def test_list_field_flattening(self, sample_raw_df):
        """Verify list fields (author, publisher, isbn, subject) are flattened to string scalars."""
        df_clean = transform(sample_raw_df)
        
        # In sample_raw_df, Bob Jones & Carol White are authors -> should extract first author 'Bob Jones'
        row_bob = df_clean[df_clean["ol_key"] == "/works/OL200W"].iloc[0]
        assert row_bob["author"] == "Bob Jones"
        assert row_bob["publisher"] == "AI Press"
        assert isinstance(row_bob["author"], str)
        assert isinstance(row_bob["isbn"], str)

    def test_type_coercion(self, sample_raw_df):
        """Verify numerical and date fields are coerced to proper numeric types."""
        df_clean = transform(sample_raw_df)
        
        assert pd.api.types.is_numeric_dtype(df_clean["publish_year"])
        assert pd.api.types.is_numeric_dtype(df_clean["pages"])
        assert pd.api.types.is_numeric_dtype(df_clean["avg_rating"])
        assert pd.api.types.is_numeric_dtype(df_clean["rating_count"])

    def test_missing_value_imputation(self, sample_raw_df):
        """Verify missing values in string and numeric fields are properly imputed without NaNs."""
        df_clean = transform(sample_raw_df)
        
        # Check that there are zero nulls across all final columns
        null_count = df_clean.isnull().sum().sum()
        assert null_count == 0, f"Found {null_count} unexpected null values in clean DataFrame"

        # Check placeholder defaults for missing string columns
        row_null = df_clean[df_clean["ol_key"] == "/works/OL300W"].iloc[0]
        assert row_null["author"] == "Unknown Author"
        assert row_null["publisher"] == "Unknown Publisher"
        assert row_null["subject"] == "General"

    def test_deduplication(self, sample_raw_df):
        """Verify duplicate records by ol_key and isbn are eliminated."""
        # sample_raw_df has 4 rows, with 1 duplicate ol_key (/works/OL100W)
        assert len(sample_raw_df) == 4
        
        df_clean = transform(sample_raw_df)
        assert len(df_clean) == 3
        assert df_clean["ol_key"].duplicated().sum() == 0

    def test_feature_engineering_publish_decade(self):
        """Verify publish_decade computes correct decade string (e.g., 2021 -> '2020s')."""
        raw = pd.DataFrame([{
            "key": "K1", "title": "T1", "first_publish_year": 1995,
            "number_of_pages_median": 200, "ratings_average": 4.2, "ratings_count": 10
        }])
        df = transform(raw)
        assert df.iloc[0]["publish_decade"] == "1990s"

    def test_feature_engineering_page_tier(self):
        """Verify page_tier bucket classifications based on page count boundaries."""
        raw = pd.DataFrame([
            {"key": "K1", "title": "T1", "number_of_pages_median": 50},
            {"key": "K2", "title": "T2", "number_of_pages_median": 200},
            {"key": "K3", "title": "T3", "number_of_pages_median": 450},
            {"key": "K4", "title": "T4", "number_of_pages_median": 800},
        ])
        df = transform(raw)
        
        tiers = dict(zip(df["ol_key"], df["page_tier"]))
        assert tiers["K1"] == "Short (<100 pages)"
        assert tiers["K2"] == "Medium (100-300)"
        assert tiers["K3"] == "Long (300-600)"
        assert tiers["K4"] == "Comprehensive (600+)"


    def test_feature_engineering_rating_metrics(self):
        """Verify is_highly_rated boolean and rating_category buckets."""
        raw = pd.DataFrame([
            {"key": "K1", "title": "T1", "ratings_average": 4.8},
            {"key": "K2", "title": "T2", "ratings_average": 4.2},
            {"key": "K3", "title": "T3", "ratings_average": 3.5},
            {"key": "K4", "title": "T4", "ratings_average": 2.1},
        ])
        df = transform(raw)
        
        categories = dict(zip(df["ol_key"], df["rating_category"]))
        high_rated = dict(zip(df["ol_key"], df["is_highly_rated"]))
        
        assert categories["K1"] == "Excellent (4.5+)"
        assert high_rated["K1"] == 1
        assert categories["K2"] == "Good (4.0-4.5)"
        assert high_rated["K2"] == 1
        assert categories["K3"] == "Average (3.0-4.0)"
        assert high_rated["K3"] == 0
        assert categories["K4"] == "Below Average (<3.0)"
        assert high_rated["K4"] == 0

    def test_empty_dataframe_handling(self):
        """Verify transformation handles empty DataFrames without raising exceptions."""
        empty_df = pd.DataFrame()
        result = transform(empty_df)
        assert len(result) == 0
        assert isinstance(result, pd.DataFrame)
