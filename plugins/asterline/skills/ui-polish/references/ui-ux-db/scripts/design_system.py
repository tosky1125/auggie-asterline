#!/usr/bin/env python3
from __future__ import annotations

import argparse

from design_system_parts.ascii import (
    BOX_WIDTH,
    ansi_ljust,
    format_ascii_box,
    hex_to_ansi,
    section_header,
)
from design_system_parts.generator import (
    REASONING_FILE,
    SEARCH_CONFIG,
    DesignSystemGenerator,
)
from design_system_parts.markdown import format_markdown
from design_system_parts.master import format_master_md
from design_system_parts.pages import (
    _detect_page_type,
    _generate_intelligent_overrides,
    format_page_override_md,
)
from design_system_parts.persistence import persist_design_system


def generate_design_system(
    query: str,
    project_name: str | None = None,
    output_format: str = "ascii",
    persist: bool = False,
    page: str | None = None,
    output_dir: str | None = None,
) -> str:
    design_system = DesignSystemGenerator().generate(query, project_name)
    if persist:
        persist_design_system(design_system, page, output_dir, query)
    if output_format == "markdown":
        return format_markdown(design_system)
    return format_ascii_box(design_system)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate Design System")
    parser.add_argument("query", help="Search query (e.g., 'SaaS dashboard')")
    parser.add_argument("--project-name", "-p", default=None, help="Project name")
    parser.add_argument("--format", "-f", choices=("ascii", "markdown"), default="ascii")
    return parser


def main() -> int:
    args = _parser().parse_args()
    print(generate_design_system(args.query, args.project_name, args.format))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
