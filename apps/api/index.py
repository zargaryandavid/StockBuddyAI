"""Vercel entry point for the StockBuddyAI API.

Vercel finds `app` here and sends every request to it (settings in vercel.json). The
package lives in src/; putting it first on the import path keeps file paths such as
mandates/ pointing at this folder.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from stockbuddy.main import app  # noqa: E402

__all__ = ["app"]
