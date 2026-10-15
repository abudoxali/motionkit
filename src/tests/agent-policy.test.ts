import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
// @ts-expect-error -- plain ESM helper shared with the sync script; no type declarations.
import {adapterFor, readFrontmatter} from '../../scripts/sync-skill-adapters.mjs';

const read = (file: string) => readFileSync(path.resolve(file), 'utf8').replace(/\r\n/g, '\n');
const canonical = readdirSync(path.resolve('.agents/skills')).filter((name) => statSync(path.resolve('.agents/skills', name)).isDirectory());
const skillFiles = (root: string): string[] =>
  readdirSync(root, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? skillFiles(full) : entry.name.endsWith('.md') ? [full] : [];
  });
const instructionFiles = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', ...skillFiles(path.resolve('.agents/skills')), ...skillFiles(path.resolve('.claude/skills'))];

describe('agent operating system', () => {
  it('keeps the required skills, including the original two', () => {
    expect(canonical.sort()).toEqual([
      'abud-creative-director',
      'arabic-typography',
      'motion-engineering',
      'motion-from-reference',
      'quality-assurance',
      'repo-intelligence',
    ]);
  });

  it('gives every canonical skill valid frontmatter and success criteria', () => {
    for (const name of canonical) {
      const text = read(`.agents/skills/${name}/SKILL.md`);
      const fields = readFrontmatter(text);
      expect(fields?.name, name).toBe(name);
      expect(fields?.description.length, name).toBeGreaterThan(120);
      expect(fields?.description.length, name).toBeLessThan(1024);
      expect(fields?.description, name).not.toMatch(/[<>]/);
      expect(text, name).toMatch(/AGENTS\.md/);
      expect(text, name).toMatch(/## (When to use|Route the work)/);
      expect(text, name).toMatch(/## Done means/);
      expect(text.split('\n').length, name).toBeLessThan(500);
    }
  });

  it('has an in-sync Claude Code adapter for every canonical skill and nothing else', () => {
    const adapters = readdirSync(path.resolve('.claude/skills'));
    expect(adapters.sort()).toEqual([...canonical].sort());
    for (const name of canonical) {
      const fields = readFrontmatter(read(`.agents/skills/${name}/SKILL.md`));
      expect(read(`.claude/skills/${name}/SKILL.md`), name).toBe(adapterFor(fields!.name, fields!.description));
    }
  });

  it('resolves every relative markdown link in skills and instructions', () => {
    for (const file of instructionFiles) {
      const text = read(file);
      for (const [, target] of text.matchAll(/\]\(([^)#\s]+)\)/g)) {
        if (/^[a-z]+:/i.test(target)) continue;
        expect(existsSync(path.resolve(path.dirname(file), target)), `${path.relative(process.cwd(), file)} → ${target}`).toBe(true);
      }
      for (const [, target] of text.matchAll(/`(\.\.\/\.\.\/\.\.\/[^`]+)`/g)) {
        expect(existsSync(path.resolve(path.dirname(file), target)), `${path.relative(process.cwd(), file)} → ${target}`).toBe(true);
      }
    }
  });

  it('routes Claude Code and Antigravity through the single canonical contract', () => {
    expect(read('CLAUDE.md').startsWith('@AGENTS.md')).toBe(true);
    expect(read('GEMINI.md').startsWith('@AGENTS.md')).toBe(true);
    expect(read('CLAUDE.md').split('\n').length).toBeLessThan(10);
    expect(read('GEMINI.md').split('\n').length).toBeLessThan(10);
    const agents = read('AGENTS.md');
    for (const name of canonical) expect(agents, name).toContain(`\`${name}\``);
  });

  it('never points agents at files or APIs that do not exist', () => {
    for (const file of instructionFiles) {
      const text = read(file);
      const label = path.relative(process.cwd(), file);
      expect(text, label).not.toMatch(/Video\.tsx|PLAN\.md|@remotion\/google-fonts|\bprog\(|\btoSec\(/);
      expect(text, label).not.toMatch(/font-?family[^\n]*(Segoe|Tahoma)/i);
    }
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
    for (const file of instructionFiles) {
      for (const [, script] of read(file).matchAll(/npm run ([a-z0-9:-]+)/g)) {
        expect(scripts, `${path.relative(process.cwd(), file)} → npm run ${script}`).toHaveProperty(script);
      }
    }
  });
});

describe('export boundary in agent instructions', () => {
  it('states the mandatory export rules in the canonical contract', () => {
    const agents = read('AGENTS.md');
    expect(agents).toContain('Never run `npm run export`, `remotion render`, `npx remotion render`');
    expect(agents).toContain('Never provide confirmation input to `scripts/manual-export.ts`');
    expect(agents).toContain('Only Abdullah initiates the interactive manual export');
    expect(agents).toMatch(/Never modify, move, or delete owner media in `out\/`/);
  });

  it('only ever mentions full renders as prohibitions or as the owner-only command', () => {
    for (const file of instructionFiles) {
      const lines = read(file).split('\n').filter((line) => /npm run export|remotion render/.test(line));
      for (const line of lines) {
        expect(line, path.relative(process.cwd(), file)).toMatch(/\b(never|not|owner|refuses?)\b|المالك|ممنوع/i);
      }
    }
  });

  it('keeps render commands out of package scripts except the guarded export', () => {
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
    for (const [name, command] of Object.entries(scripts)) {
      if (name === 'export') {
        expect(command).toBe('tsx scripts/manual-export.ts');
        continue;
      }
      expect(command, name).not.toMatch(/remotion render|renderMedia|manual-export/);
    }
    // Recursive, so helper folders such as scripts/media/ are held to the same rule.
    const walk = (dir: string): string[] =>
      readdirSync(path.resolve('scripts', dir), {withFileTypes: true}).flatMap((entry) => (entry.isDirectory() ? walk(`${dir}${entry.name}/`) : [`${dir}${entry.name}`]));
    for (const file of walk('')) {
      if (file === 'manual-export.ts') continue;
      expect(read(`scripts/${file}`), file).not.toMatch(/renderMedia|['"]render['"]/);
    }
  });

  it('installs no hooks or settings that could run an export', () => {
    for (const file of ['.claude/settings.json', '.claude/settings.local.json']) {
      if (!existsSync(path.resolve(file))) continue;
      expect(read(file), file).not.toMatch(/export|remotion render|manual-export/);
    }
  });
});
