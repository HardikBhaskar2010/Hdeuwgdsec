"""
Pytest configuration and test environment setup.
Ensures backend/src is always in sys.path regardless of execution working directory.
"""

import sys
from pathlib import Path

# Add backend/src to sys.path
SRC_DIR = Path(__file__).resolve().parents[1] / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
