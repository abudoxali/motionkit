// Regenerates the thin Claude Code adapters in .claude/skills/ from the canonical skills in
// .agents/skills/. Adapters copy the canonical name and description (which drive skill
// triggering) and point to the canonical body, so there is one source of truth.
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

export const adapterFor = (name, description) => `---
name: ${name}
description: ${description}
---

Claude Code adapter. Read and follow the canonical skill at \`../../../.agents/skills/${name}/SKILL.md\` and load its references only as it directs. \`AGENTS.md\` is the controlling project contract, including the owner-only export boundary, and overrides anything in a skill.
`;

export const readFrontmatter = (text) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const fields = Object.fromEntries(
    match[1].split(/\r?\n/).map((line) => {
      const index = line.indexOf(':');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
  );
  return fields;
};

const canonicalRoot = path.resolve('.agents/skills');
const adapterRoot = path.resolve('.claude/skills');
const check = process.argv.includes('--check');
let drift = 0;

for (const entry of await readdir(canonicalRoot, {withFileTypes: true})) {
  if (!entry.isDirectory()) continue;
  const fields = readFrontmatter(await readFile(path.join(canonicalRoot, entry.name, 'SKILL.md'), 'utf8'));
  if (!fields?.name || !fields.description) throw new Error(`${entry.name}: SKILL.md needs name and description frontmatter`);
  const target = path.join(adapterRoot, entry.name, 'SKILL.md');
  const expected = adapterFor(fields.name, fields.description);
  const current = await readFile(target, 'utf8').catch(() => '');
  if (current.replace(/\r\n/g, '\n') === expected) continue;
  drift += 1;
  if (check) {
    console.error(`stale adapter: ${path.relative(process.cwd(), target)}`);
  } else {
    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, expected);
    console.log(`wrote ${path.relative(process.cwd(), target)}`);
  }
}

if (check && drift > 0) process.exit(1);
console.log(drift === 0 ? 'adapters in sync' : `${drift} adapter(s) ${check ? 'stale' : 'updated'}`);
