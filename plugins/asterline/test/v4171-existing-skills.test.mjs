import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT_URL = new URL('../skills/', import.meta.url);
const ROOT = fileURLToPath(ROOT_URL);
const MAPPINGS = Object.freeze({
  'clean-ai-code': 'remove-ai-slops',
  'code-engineer': 'programming',
  'code-intel': 'lsp',
  'code-intel-setup': 'lsp-setup',
  'comment-guard': 'comment-checker',
  'debug-trace': 'debugging',
  'deep-research': 'ulw-research',
  'git-flow': 'git-master',
  'health-check': 'lcx-doctor',
  'init-knowledge': 'init-deep',
  'reshape-code': 'refactor',
  'review-pass': 'review-work',
  'rule-sync': 'rules',
  'run-plan': 'start-work',
  'ui-polish': 'frontend',
  'upstream-fix': 'lcx-contribute-bug-fix',
  'upstream-report': 'lcx-report-bug',
  'visual-check': 'visual-qa',
  'work-loop': 'ulw-loop',
  'work-plan': 'ulw-plan',
});

const REQUIRED_NEW_PATHS = Object.freeze({
  'clean-ai-code': ['agents/openai.yaml'],
  'code-engineer': ['agents/openai.yaml', 'references/code-smells.md', 'references/logging.md'],
  'code-intel': ['agents/openai.yaml'],
  'code-intel-setup': ['agents/openai.yaml'],
  'comment-guard': ['agents/openai.yaml'],
  'debug-trace': ['agents/openai.yaml'],
  'deep-research': ['ATTRIBUTION.md', 'agents/openai.yaml'],
  'init-knowledge': ['agents/openai.yaml'],
  'reshape-code': ['agents/openai.yaml'],
  'review-pass': ['agents/openai.yaml'],
  'rule-sync': ['agents/openai.yaml'],
  'run-plan': ['agents/openai.yaml'],
  'visual-check': ['agents/openai.yaml', 'references/agent-browser-setup.md', 'scripts/visual-qa.mjs'],
  'work-plan': ['references/intent-clear.md', 'references/intent-unclear.md', 'scripts/scaffold-plan.mjs'],
});

const EXPECTED_FILE_COUNTS = Object.freeze({
  'clean-ai-code': 2, 'code-engineer': 80, 'code-intel': 2, 'code-intel-setup': 26,
  'comment-guard': 2, 'debug-trace': 20, 'deep-research': 3, 'git-flow': 2,
  'health-check': 2, 'init-knowledge': 2, 'reshape-code': 2, 'review-pass': 2,
  'rule-sync': 2, 'run-plan': 2, 'ui-polish': 178, 'upstream-fix': 3,
  'upstream-report': 2, 'visual-check': 17, 'work-loop': 4, 'work-plan': 6,
});

const UI_POLISH_INTERNAL_FILES = Object.freeze([
  'references/ui-ux-db/scripts/design_system_parts/__init__.py',
  'references/ui-ux-db/scripts/design_system_parts/ascii.py',
  'references/ui-ux-db/scripts/design_system_parts/generator.py',
  'references/ui-ux-db/scripts/design_system_parts/markdown.py',
  'references/ui-ux-db/scripts/design_system_parts/master.py',
  'references/ui-ux-db/scripts/design_system_parts/pages.py',
  'references/ui-ux-db/scripts/design_system_parts/persistence.py',
]);

const VISUAL_CHECK_INTERNAL_FILES = Object.freeze([
  'scripts/image-diff.mjs', 'scripts/png-decode.mjs', 'scripts/terminal-width.mjs', 'scripts/tui-check.mjs',
]);

const CODE_ENGINEER_INTERNAL_FILES = Object.freeze([
  'scripts/python/basic_syntax_rules.py', 'scripts/python/checker_model.py',
  'scripts/python/control_flow_rules.py', 'scripts/python/data_model_rules.py',
  'scripts/python/file_boundary_rules.py',
]);

const walkFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  }));
  return nested.flat();
};

test('Given the v4.17.1 refresh, every existing skill keeps its Asterline public identity', async () => {
  for (const [name, upstream] of Object.entries(MAPPINGS)) {
    const skill = await readFile(new URL(`${name}/SKILL.md`, ROOT_URL), 'utf8');
    assert.match(skill, new RegExp(`^---\\nname: ${name.replaceAll('-', '\\-')}\\n`, 'm'));
    assert.doesNotMatch(skill, new RegExp(`^name: ${upstream.replaceAll('-', '\\-')}$`, 'm'));
  }
});

test('Given the public code-intel names, the underlying runtime contract remains lsp', async () => {
  const agents = await readFile(new URL('code-intel-setup/AGENTS.md', ROOT_URL), 'utf8');
  const setup = await readFile(new URL('code-intel-setup/SKILL.md', ROOT_URL), 'utf8');
  const usage = await readFile(new URL('code-intel/SKILL.md', ROOT_URL), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../.mcp.json', ROOT_URL), 'utf8'));
  const combined = `${agents}\n${setup}\n${usage}`;

  assert.ok(Object.hasOwn(manifest.mcpServers, 'lsp'));
  assert.equal(Object.hasOwn(manifest.mcpServers, 'code-intel'), false);
  assert.match(agents, /helper filenames retain `lsp`/);
  assert.match(agents, /top-level `lsp` map/);
  assert.match(agents, /Public MCP registration is `lsp`/);
  assert.match(agents, /committed `mcp\/lsp` bundle/);
  assert.match(combined, /\.asterline\/lsp-client\.json/);
  assert.doesNotMatch(combined, /\.asterline\/code-intel(?:-client)?\.json|top-level `code-intel` map|MCP registration is `code-intel`|mcp__code-intel/);
});

test('Given v4.17.1 added assets, every mapped path is packaged and non-empty', async () => {
  for (const [name, paths] of Object.entries(REQUIRED_NEW_PATHS)) {
    for (const path of paths) {
      const info = await stat(new URL(`${name}/${path}`, ROOT_URL));
      assert.ok(info.isFile() && info.size > 0, `${name}/${path} must be packaged`);
    }
  }
});

test('Given the pinned v4.17.1 inventories, every mapped skill has the exact packaged file count', async () => {
  for (const [name, expected] of Object.entries(EXPECTED_FILE_COUNTS)) {
    const files = (await walkFiles(fileURLToPath(new URL(`${name}/`, ROOT_URL))))
      .filter((path) => !path.endsWith('/AGENTS.md'));
    assert.equal(files.length, expected, `${name} inventory drifted`);
  }
  for (const path of UI_POLISH_INTERNAL_FILES) await stat(new URL(`ui-polish/${path}`, ROOT_URL));
  for (const path of VISUAL_CHECK_INTERNAL_FILES) await stat(new URL(`visual-check/${path}`, ROOT_URL));
  for (const path of CODE_ENGINEER_INTERNAL_FILES) await stat(new URL(`code-engineer/${path}`, ROOT_URL));
});

test('Given local Markdown links, every relative file target resolves inside its skill', async () => {
  for (const name of Object.keys(MAPPINGS)) {
    const directory = fileURLToPath(new URL(`${name}/`, ROOT_URL));
    for (const path of await walkFiles(directory)) {
      if (!path.endsWith('.md')) continue;
      const text = await readFile(path, 'utf8');
      for (const match of text.matchAll(/\[[^\]]*\]\((?!https?:|#|mailto:)([^)#]+)(?:#[^)]+)?\)/g)) {
        if (!/[./]/.test(match[1]) || /[<>{},\s]/.test(match[1])) continue;
        const target = new URL(match[1], new URL(`file://${path}`));
        const targetPath = target.pathname;
        assert.ok(targetPath.startsWith(directory), `${relative(directory, path)} escapes to ${match[1]}`);
        await stat(targetPath).catch(() => assert.fail(`${relative(directory, path)} has missing link ${match[1]}`));
      }
    }
  }
});

test('Given Auggie execution, skill contracts do not expose foreign public aliases or durable-team claims', async () => {
  const forbidden = /\$(?:omo:)?(?:remove-ai-slops|programming|lsp-setup|lsp|comment-checker|debugging|ulw-research|git-master|lcx-doctor|init-deep|refactor|review-work|rules|start-work|lcx-contribute-bug-fix|lcx-report-bug|visual-qa|ulw-loop|ulw-plan)\b|\$asterline:[a-z0-9-]+|team_(?:send_message|task_create|task_update|shutdown_request|approve_shutdown|delete)|resume_agent|close_agent|send_input|task\((?:subagent_type|category)=|\.opencode\/|\.codex\/|\bCODEX_HOME\b/g;
  const publicBranding = /\b(?:LazyCodex|OpenCode)\b/g;
  for (const name of Object.keys(MAPPINGS)) {
    for (const path of await walkFiles(fileURLToPath(new URL(`${name}/`, ROOT_URL)))) {
      if (!/\.(?:md|ya?ml|json|mjs|js|ts|py|sh|ps1)$/.test(path) || path.endsWith('ATTRIBUTION.md')) continue;
      const text = await readFile(path, 'utf8');
      assert.doesNotMatch(text, forbidden, `${relative(ROOT, path)} exposes an unsupported alias or team operation`);
      if (path.endsWith('SKILL.md') || path.endsWith('agents/openai.yaml')) {
        assert.doesNotMatch(text, publicBranding, `${relative(ROOT, path)} exposes foreign public branding`);
      }
    }
  }
});

test('Given Auggie parallel-only delegation, skill contracts avoid invented orchestration surfaces', async () => {
  const forbidden = /Auggie delegation surface|available delegation surface|host completion surface|terminal collection|one-shot assignment:|legacy_agent_call|^\s*task\s*\(|subagent_type\s*=|fork_context|agent_type|multi_agent_v|<owner>\/|<auggie-cli-source-repo>|<asterline-source-repo>/im;
  for (const name of Object.keys(MAPPINGS)) {
    const directory = fileURLToPath(new URL(`${name}/`, ROOT_URL));
    for (const path of await walkFiles(directory)) {
      if (!/SKILL\.md$|references\/full-workflow\.md$|agents\/openai\.yaml$/.test(path)) continue;
      assert.doesNotMatch(
        await readFile(path, 'utf8'),
        forbidden,
        `${relative(ROOT, path)} names an unsupported or unresolved Auggie surface`,
      );
    }
  }
});

test('Given no configured public Auggie source repository, health checks stay evidence-bound', async () => {
  const health = await readFile(new URL('health-check/SKILL.md', ROOT_URL), 'utf8');
  assert.match(health, /tosky1125\/auggie-asterline/);
  assert.match(health, /auggie --version/);
  assert.doesNotMatch(health, /gh release view[^\n]*Auggie|\/tmp\/auggie-cli-source/i);
});

test('Given no plugin bin link, work-loop docs invoke the committed CLI directly', async () => {
  const skill = await readFile(new URL('work-loop/SKILL.md', ROOT_URL), 'utf8');
  const workflow = await readFile(new URL('work-loop/references/full-workflow.md', ROOT_URL), 'utf8');
  const combined = `${skill}\n${workflow}`;
  assert.match(combined, /node \"\$ASTERLINE_PLUGIN_ROOT\/components\/work-loop\/dist\/cli\.js\" work-loop/);
  assert.doesNotMatch(combined, /\basterline (?:work-loop|sparkshell)\b/);
});

test('Given packaged executables, none auto-installs dependencies or emits telemetry', async () => {
  const forbidden = /(?:spawn|exec|execFile|system|subprocess\.(?:run|Popen))[^\n]{0,180}(?:npm|pnpm|yarn|bun|pip|uv)\s+(?:i|install|add)|(?:posthog|telemetry)\.(?:capture|send|track)/i;
  for (const name of Object.keys(MAPPINGS)) {
    for (const path of await walkFiles(fileURLToPath(new URL(`${name}/`, ROOT_URL)))) {
      if (!/\.(?:mjs|js|ts|py|sh|ps1)$/.test(path)) continue;
      assert.doesNotMatch(await readFile(path, 'utf8'), forbidden, `${relative(ROOT, path)} performs a forbidden runtime action`);
    }
  }
});
