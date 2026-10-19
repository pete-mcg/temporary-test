"""
Metadata Returner Module

This module provides functionality to retrieve case metadata from Azure Search
using vector/semantic search with relevance scoring.
"""

from backend.metadata_returner.search_metadata import (
    search_metadata_by_query,
)

__all__ = ["search_metadata_by_query"]
