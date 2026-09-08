"""
Pytest Shared Test Fixtures and Configurations.
Provides synthetic API payloads, edge cases, and in-memory test databases.
"""

import pytest
import sqlite3
import pandas as pd
import numpy as np


@pytest.fixture
def sample_raw_api_payload():
    """Returns sample raw payload returned by the Open Library search API."""
    return {
        "numFound": 3,
        "docs": [
            {
                "key": "/works/OL123W",
                "title": "Clean Code in Python",
                "author_name": ["Jane Doe", "Second Author"],
                "first_publish_year": 2018,
                "publisher": ["O'Reilly Media", "Other Pub"],
                "isbn": ["9780132350884", "0132350882"],
                "number_of_pages_median": 464,
                "ratings_average": 4.65,
                "ratings_count": 120,
                "subject": ["Computer Science", "Programming"],
            },
            {
                "key": "/works/OL456W",
                "title": "Quantum Mechanics Intro",
                "author_name": ["Richard Roe"],
                "first_publish_year": 2005,
                "publisher": ["MIT Press"],
                "isbn": ["9780262033848"],
                "number_of_pages_median": 85,
                "ratings_average": 3.80,
                "ratings_count": 45,
                "subject": ["Physics"],
            },
            {
                "key": "/works/OL789W",
                "title": "Pocket Guide to Data",
                "author_name": [],
                "first_publish_year": None,
                "publisher": None,
                "isbn": [],
                "number_of_pages_median": None,
                "ratings_average": None,
                "ratings_count": 0,
                "subject": None,
            },
        ]
    }


@pytest.fixture
def sample_raw_df():
    """Returns a raw Pandas DataFrame representing extracted data before transformation."""
    return pd.DataFrame([
        {
            "key": "/works/OL100W",
            "title": "Python Data Engineering",
            "author_name": ["Alice Smith"],
            "first_publish_year": 2021,
            "publisher": ["Tech Pubs"],
            "isbn": ["9781234567890"],
            "number_of_pages_median": 350,
            "ratings_average": 4.5,
            "ratings_count": 250,
            "subject": ["Data Engineering"],
            "_source": "Open Library - Technology",
        },
        {
            "key": "/works/OL200W",
            "title": "Deep Learning Basics",
            "author_name": ["Bob Jones", "Carol White"],
            "first_publish_year": 2019,
            "publisher": ["AI Press"],
            "isbn": ["9789876543210"],
            "number_of_pages_median": 520,
            "ratings_average": 3.9,
            "ratings_count": 80,
            "subject": ["Artificial Intelligence"],
            "_source": "Open Library - Science",
        },
        {
            "key": "/works/OL300W",
            "title": "Quick Reference Guide",
            "author_name": None,
            "first_publish_year": None,
            "publisher": None,
            "isbn": None,
            "number_of_pages_median": None,
            "ratings_average": None,
            "ratings_count": None,
            "subject": None,
            "_source": "Open Library - Technology",
        },
        {
            # Duplicate key for deduplication testing
            "key": "/works/OL100W",
            "title": "Python Data Engineering - Duplicate",
            "author_name": ["Alice Smith"],
            "first_publish_year": 2021,
            "publisher": ["Tech Pubs"],
            "isbn": ["9781234567890"],
            "number_of_pages_median": 350,
            "ratings_average": 4.5,
            "ratings_count": 250,
            "subject": ["Data Engineering"],
            "_source": "Open Library - Technology",
        },
    ])


@pytest.fixture
def in_memory_db():
    """Provides an in-memory SQLite connection for test execution."""
    conn = sqlite3.connect(":memory:")
    yield conn
    conn.close()
