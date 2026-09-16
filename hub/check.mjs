/* Guard for the modular split: a panel may only reference names core exports.
   The split was generated, and two symbols slipped through it — `SERVER_INS`,
   declared as the second declarator on a shared const line, and `SNAP`. Both
   parsed fine and failed only when the one panel that uses them rendered.
   Run this after touching core's export block:  node hub/check.mjs           */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const core = readFileSync(join(here, 'core.js'), 'utf8');
const at = core.indexOf('\nexport {');
const exported = new Set(core.slice(at).match(/[A-Za-z_$][\w$]*/g));
const declared = new Set();
for (const ln of core.slice(0, at).split('\n')) {
  const m = ln.match(/^(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/);
  if (!m) continue;
  declared.add(m[1]);
  if (/^(?:const|let|var)\s/.test(ln))
    for (const x of ln.matchAll(/,\s*([A-Za-z_$][\w$]*)\s*=/g)) declared.add(x[1]);
}
const files = ['main.js', ...readdirSync(join(here, 'panels')).map(f => join('panels', f))];
let bad = 0;
for (const f of files) {
  const t = readFileSync(join(here, f), 'utf8');
  const head = t.slice(0, t.indexOf("} from '"));
  const imported = new Set(head.match(/[A-Za-z_$][\w$]*/g) || []);
  for (const name of new Set(t.match(/[A-Za-z_$][\w$]*/g))) {
    if (!declared.has(name) || exported.has(name) || imported.has(name)) continue;
    console.log(`${f}: uses "${name}", which core declares but does not export`);
    bad++;
  }
}
console.log(bad ? `\n${bad} unresolved reference(s)` : 'all panel references resolve against core exports');
process.exit(bad ? 1 : 0);
