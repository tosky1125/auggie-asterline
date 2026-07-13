#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Design System Generator - Aggregates search results and applies reasoning
to generate comprehensive design system recommendations.

Usage:
    from design_system import generate_design_system
    result = generate_design_system("SaaS dashboard", "My Project")
    
    # With persistence (Master + Overrides pattern)
    result = generate_design_system("SaaS dashboard", "My Project", persist=True)
    result = generate_design_system("SaaS dashboard", "My Project", persist=True, page="dashboard")
"""
def format_markdown(design_system: dict) -> str:
    """Format design system as markdown."""
    project = design_system.get("project_name", "PROJECT")
    pattern = design_system.get("pattern", {})
    style = design_system.get("style", {})
    colors = design_system.get("colors", {})
    typography = design_system.get("typography", {})
    effects = design_system.get("key_effects", "")
    anti_patterns = design_system.get("anti_patterns", "")

    lines = []
    lines.append(f"## Design System: {project}")
    lines.append("")

    # Pattern section
    lines.append("### Pattern")
    lines.append(f"- **Name:** {pattern.get('name', '')}")
    if pattern.get('conversion'):
        lines.append(f"- **Conversion Focus:** {pattern.get('conversion', '')}")
    if pattern.get('cta_placement'):
        lines.append(f"- **CTA Placement:** {pattern.get('cta_placement', '')}")
    if pattern.get('color_strategy'):
        lines.append(f"- **Color Strategy:** {pattern.get('color_strategy', '')}")
    lines.append(f"- **Sections:** {pattern.get('sections', '')}")
    lines.append("")

    # Style section
    lines.append("### Style")
    lines.append(f"- **Name:** {style.get('name', '')}")
    light = style.get("light_mode", "")
    dark = style.get("dark_mode", "")
    if light or dark:
        lines.append(f"- **Mode Support:** Light {light} | Dark {dark}")
    if style.get('keywords'):
        lines.append(f"- **Keywords:** {style.get('keywords', '')}")
    if style.get('best_for'):
        lines.append(f"- **Best For:** {style.get('best_for', '')}")
    if style.get('performance') or style.get('accessibility'):
        lines.append(f"- **Performance:** {style.get('performance', '')} | **Accessibility:** {style.get('accessibility', '')}")
    lines.append("")

    # Colors section (extended palette)
    lines.append("### Colors")
    lines.append("| Role | Hex | CSS Variable |")
    lines.append("|------|-----|--------------|")
    md_color_entries = [
        ("Primary",      "primary",      "--color-primary"),
        ("On Primary",   "on_primary",   "--color-on-primary"),
        ("Secondary",    "secondary",    "--color-secondary"),
        ("Accent/CTA",   "accent",       "--color-accent"),
        ("Background",   "background",   "--color-background"),
        ("Foreground",   "foreground",   "--color-foreground"),
        ("Muted",        "muted",        "--color-muted"),
        ("Border",       "border",       "--color-border"),
        ("Destructive",  "destructive",  "--color-destructive"),
        ("Ring",         "ring",         "--color-ring"),
    ]
    for label, key, css_var in md_color_entries:
        hex_val = colors.get(key, "")
        if hex_val:
            lines.append(f"| {label} | `{hex_val}` | `{css_var}` |")
    if colors.get("notes"):
        lines.append(f"\n*Notes: {colors.get('notes', '')}*")
    lines.append("")

    # Typography section
    lines.append("### Typography")
    lines.append(f"- **Heading:** {typography.get('heading', '')}")
    lines.append(f"- **Body:** {typography.get('body', '')}")
    if typography.get("mood"):
        lines.append(f"- **Mood:** {typography.get('mood', '')}")
    if typography.get("best_for"):
        lines.append(f"- **Best For:** {typography.get('best_for', '')}")
    if typography.get("google_fonts_url"):
        lines.append(f"- **Google Fonts:** {typography.get('google_fonts_url', '')}")
    if typography.get("css_import"):
        lines.append(f"- **CSS Import:**")
        lines.append(f"```css")
        lines.append(f"{typography.get('css_import', '')}")
        lines.append(f"```")
    lines.append("")

    # Key Effects section
    if effects:
        lines.append("### Key Effects")
        lines.append(f"{effects}")
        lines.append("")

    # Anti-patterns section
    if anti_patterns:
        lines.append("### Avoid (Anti-patterns)")
        newline_bullet = '\n- '
        lines.append(f"- {anti_patterns.replace(' + ', newline_bullet)}")
        lines.append("")

    # Pre-Delivery Checklist section
    lines.append("### Pre-Delivery Checklist")
    lines.append("- [ ] No emojis as icons (use SVG: Heroicons/Lucide)")
    lines.append("- [ ] cursor-pointer on all clickable elements")
    lines.append("- [ ] Hover states with smooth transitions (150-300ms)")
    lines.append("- [ ] Light mode: text contrast 4.5:1 minimum")
    lines.append("- [ ] Focus states visible for keyboard nav")
    lines.append("- [ ] prefers-reduced-motion respected")
    lines.append("- [ ] Responsive: 375px, 768px, 1024px, 1440px")
    lines.append("")

    return "\n".join(lines)
