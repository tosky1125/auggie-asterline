from __future__ import annotations

import json
from typing import Optional, Union

from .constants import AstGrepMatch, AstGrepPosition, AstGrepRange

JsonScalar = Union[None, bool, int, float, str]
JsonValue = Union[JsonScalar, list["JsonValue"], dict[str, "JsonValue"]]


def parse_position(value: JsonValue) -> AstGrepPosition:
    if not isinstance(value, dict):
        return {}
    position: AstGrepPosition = {}
    line = value.get("line")
    column = value.get("column")
    if isinstance(line, int):
        position["line"] = line
    if isinstance(column, int):
        position["column"] = column
    return position


def parse_range(value: JsonValue) -> AstGrepRange:
    if not isinstance(value, dict):
        return {}
    match_range: AstGrepRange = {}
    start = value.get("start")
    end = value.get("end")
    if start is not None:
        match_range["start"] = parse_position(start)
    if end is not None:
        match_range["end"] = parse_position(end)
    return match_range


def parse_match(value: JsonValue) -> Optional[AstGrepMatch]:
    if not isinstance(value, dict):
        return None
    file = value.get("file")
    if not isinstance(file, str):
        return None
    match = AstGrepMatch(file=file)
    match_range = value.get("range")
    text = value.get("text")
    replacement = value.get("replacement")
    if match_range is not None:
        match["range"] = parse_range(match_range)
    if isinstance(text, str):
        match["text"] = text
    if isinstance(replacement, str):
        match["replacement"] = replacement
    return match


def parse_compact_json(text: str) -> list[AstGrepMatch]:
    if not text.strip():
        return []
    try:
        data: JsonValue = json.loads(text)
        if isinstance(data, list):
            return [match for item in data if (match := parse_match(item)) is not None]
        return []
    except json.JSONDecodeError:
        results: list[AstGrepMatch] = []
        for raw_line in text.splitlines():
            line = raw_line.strip().rstrip(",")
            if not line.startswith("{"):
                continue
            try:
                item: JsonValue = json.loads(line)
            except json.JSONDecodeError:
                continue
            match = parse_match(item)
            if match is not None:
                results.append(match)
        return results


def format_matches(matches: list[AstGrepMatch], *, show_replacement: bool = False) -> None:
    if not matches:
        print("(no matches)")
        return
    by_file: dict[str, list[AstGrepMatch]] = {}
    for match in matches:
        by_file.setdefault(match.get("file", "?"), []).append(match)
    for path, items in sorted(by_file.items()):
        suffix = "es" if len(items) != 1 else ""
        print(f"{path} ({len(items)} match{suffix})")
        for match in items:
            match_range = match.get("range", {})
            start = match_range.get("start", {})
            line = start.get("line", "?")
            column = start.get("column", "?")
            text_lines = (match.get("text") or "").splitlines()
            preview = text_lines[0] if text_lines else ""
            print(f"  {path}:{line}:{column}  {preview}")
            if show_replacement and "replacement" in match:
                replacement_lines = (match.get("replacement") or "").splitlines()
                replacement_preview = replacement_lines[0] if replacement_lines else ""
                print(f"    -> {replacement_preview}")
