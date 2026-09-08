"""
Mock Tests for Batch Data Pipeline.
Isolates external API network calls and database transactions using mocking and in-memory fixtures.
"""

import pytest
import sqlite3
import requests
from unittest.mock import patch, MagicMock
import pandas as pd
from pipeline.batch_pipeline import (
    extract_from_api,
    extract_all_sources,
    load_to_sqlite,
    transform,
)


@pytest.mark.mock
class TestMockApiExtraction:

    @patch("requests.get")
    def test_extract_from_api_success(self, mock_get, sample_raw_api_payload):
        """Test API extraction returns parsed documents when API responds HTTP 200."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = sample_raw_api_payload
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        endpoint = {
            "name": "Test Endpoint",
            "url": "https://fake-openlibrary.org/search.json",
            "params": {"subject": "science", "limit": 10},
        }

        docs = extract_from_api(endpoint)
        
        assert len(docs) == 3
        assert docs[0]["title"] == "Clean Code in Python"
        assert docs[0]["key"] == "/works/OL123W"
        mock_get.assert_called_once()

    @patch("requests.get")
    def test_extract_from_api_rate_limit_429(self, mock_get):
        """Test API extraction raises RuntimeError when rate limited (HTTP 429)."""
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_get.return_value = mock_response

        endpoint = {
            "name": "Rate Limited Endpoint",
            "url": "https://fake-openlibrary.org/search.json",
            "params": {},
        }

        with pytest.raises(RuntimeError, match="Rate limited"):
            extract_from_api(endpoint)

    @patch("requests.get")
    def test_extract_from_api_service_unavailable_503(self, mock_get):
        """Test API extraction raises RuntimeError when service is unavailable (HTTP 503)."""
        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_get.return_value = mock_response

        endpoint = {
            "name": "Unavailable Endpoint",
            "url": "https://fake-openlibrary.org/search.json",
            "params": {},
        }

        with pytest.raises(RuntimeError, match="Service unavailable"):
            extract_from_api(endpoint)

    @patch("pipeline.batch_pipeline.time.sleep", return_value=None)
    @patch("requests.get")
    def test_extract_from_api_retry_on_connection_error(self, mock_get, mock_sleep):
        """Test that extract_from_api retries up to MAX_RETRIES upon ConnectionError."""
        mock_get.side_effect = requests.exceptions.ConnectionError("Connection timed out")

        endpoint = {
            "name": "Retry Endpoint",
            "url": "https://fake-openlibrary.org/search.json",
            "params": {},
        }

        with pytest.raises(requests.exceptions.ConnectionError):
            extract_from_api(endpoint)

        # Should be called initial attempt + 3 retries = 4 times
        assert mock_get.call_count == 4

    @patch("pipeline.batch_pipeline.extract_from_api")
    def test_extract_all_sources_integration(self, mock_extract, sample_raw_api_payload):
        """Test extract_all_sources iterates through endpoints and combines into DataFrame."""
        mock_extract.return_value = sample_raw_api_payload["docs"]

        df_raw, meta = extract_all_sources()

        assert isinstance(df_raw, pd.DataFrame)
        assert len(meta) == 3  # 3 endpoints configured in batch_pipeline
        assert "_source" in df_raw.columns
        assert len(df_raw) == 9  # 3 docs * 3 endpoints


@pytest.mark.mock
class TestMockDatabaseLoad:

    def test_load_to_sqlite_in_memory(self, sample_raw_df, in_memory_db, tmp_path):
        """Test that transformed data writes cleanly to target SQLite tables and updates the run log."""
        test_db_path = tmp_path / "test_batch.db"
        df_clean = transform(sample_raw_df)

        result = load_to_sqlite(
            df=df_clean,
            db_path=test_db_path,
            target_table="test_books_fact",
            log_table="test_run_log",
            run_type="MANUAL_TEST",
            raw_count=len(sample_raw_df)
        )

        assert result["loaded"] == len(df_clean)
        assert result["elapsed_ms"] >= 0

        # Verify physical table rows in SQLite
        conn = sqlite3.connect(test_db_path)
        cur = conn.cursor()
        
        cur.execute("SELECT COUNT(*) FROM test_books_fact")
        count = cur.fetchone()[0]
        assert count == len(df_clean)

        cur.execute("SELECT status, records_loaded FROM test_run_log ORDER BY run_id DESC LIMIT 1")
        log_entry = cur.fetchone()
        assert log_entry[0] == "SUCCESS"
        assert log_entry[1] == len(df_clean)

        conn.close()

