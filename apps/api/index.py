"""Vercel entry point for the MyPortfolioBuddy API.

Vercel loads `app` from here (see the api service in the root vercel.json). The
package lives in src/; putting it first on the import path keeps file paths such as
mandates/ pointing at this folder.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from stockbuddy.main import app  # noqa: E402

__all__ = ["app"]
