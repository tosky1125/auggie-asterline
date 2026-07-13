#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
# ─── How to run ───
# python3 ast_grep_helper.py --help
from __future__ import annotations

import runpy


if __name__ == "__main__":
    runpy.run_module("structure_search", run_name="__main__")
