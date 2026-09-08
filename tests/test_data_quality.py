"""
Data Quality Validation and Schema Gate Tests.
Ensures pipeline data satisfies integrity rules, range bounds, and data contracts.
"""

import pytest
import pandas as pd
from pipeline.batch_pipeline import verify_data_quality, transform


@pytest.mark.quality
class TestDataQualityGates:

    def test_verify_data_quality_clean_dataset(self, sample_raw_df, tmp_path):
        """Verify data quality checks pass with 0 failures on cleaned data."""
        df_clean = transform(sample_raw_df)
        report_path = tmp_path / "test_audit.json"

        passed, checks = verify_data_quality(df_clean, report_path=report_path)

        assert passed is True
        assert len(checks) > 0
        for check in checks:
            assert check["status"] == "PASS", f"Check failed: {check['check']} - {check.get('details')}"

    def test_null_percentage_gate(self):
        """Test that excessive nulls trigger a data quality failure."""
        bad_df = pd.DataFrame([
            {"ol_key": "K1", "title": None, "author": None, "publish_year": None, "pages": None, "avg_rating": None, "rating_count": None},
            {"ol_key": "K2", "title": None, "author": None, "publish_year": None, "pages": None, "avg_rating": None, "rating_count": None},
        ])

        passed, checks = verify_data_quality(bad_df)
        assert passed is False
        
        # Check specific failure reason
        failed_checks = [c for c in checks if c["status"] == "FAIL"]
        assert len(failed_checks) > 0

    def test_rating_bounds_gate(self):
        """Test that out-of-range ratings (e.g. > 5.0 or < 0.0) trigger quality violation."""
        out_of_bounds_df = pd.DataFrame([
            {
                "ol_key": "K1",
                "title": "Invalid Rating Book",
                "author": "Author",
                "publish_year": 2020,
                "pages": 150,
                "avg_rating": 9.9,  # Invalid rating > 5.0
                "rating_count": 10,
                "subject": "Tech",
                "api_source": "Test",
            }
        ])

        passed, checks = verify_data_quality(out_of_bounds_df)
        assert passed is False
        assert any("Rating range" in c["check"] and c["status"] == "FAIL" for c in checks)
