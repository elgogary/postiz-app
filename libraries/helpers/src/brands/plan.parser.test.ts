import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parsePlan } from './plan.parser';

// A tiny plan in the same shape as the uploaded one (no real content: this repo is public).
const MINI = `<html><body>
<nav><a href="#overview">a</a><a href="#voice">b</a><a href="#bench">c</a><a href="#weeks">d</a><a href="#mix">e</a>
<a href="#routine">f</a><a href="#profile">g</a><a href="#kpi">h</a><a href="#review">i</a><a href="#history">j</a></nav>
<section id="overview"><div>01 — POSITIONING</div><h2>Title</h2><p>Core <strong>message</strong></p></section>
<section id="voice"><div>Voice line</div></section>
<section id="bench"><p>Bench title</p><p>Check the numbers.</p><table><tr><th>A</th><th>B</th><th>C</th><th>D</th></tr>
<tr><td>Sara<br>CEO, Acme · حوالي 2.5K متابع</td><td>how</td><td>works</td><td>take</td></tr></table></section>
<section id="weeks"><p>Flow</p></section>
<section id="mix"><p>Mix</p></section>
<section id="routine"><ul><li>Reply first hour</li></ul></section>
<section id="profile"><p>Headline</p></section>
<section id="kpi"><p>KPI title</p><p>Baseline first.</p><table><tr><th>a</th><th>b</th><th>c</th></tr><tr><td>Followers</td><td>growth</td><td>10%</td></tr></table></section>
<section id="review"><ol><li>Check stories</li></ol><h3>Style</h3><ul><li>Own words</li></ul></section>
<section id="history"><table><tr><th>From</th><th>Idea</th></tr><tr><td>شهرين</td><td>old idea</td></tr><tr><td>منافسين</td><td>their idea</td></tr></table></section>
<script>const GOALS={aw:"Awareness",ed:"Education"};
const WEEKS=[{n:1,range:"15 – 21 نوفمبر",title:"W1",desc:"d1"},{n:2,range:"29 نوفمبر – 5 ديسمبر",title:"W2",desc:"d2"}];
const P=[{n:1,date:"2026-11-15",week:1,fmt:"Text",goal:"aw",pillar:"AI",title:"T1",sub:"S1",sl:"s",slides:["a","b"],cap:\`line1
line2\`,cta:"c",vis:"v",prompt:"p",verify:"check"},
{n:2,date:"2026-11-30",week:2,fmt:"Carousel",goal:"ed",pillar:"AI · DT · Process",title:"T2",sub:"S2",sl:"s",slides:[],cap:\`x\`,cta:"",vis:"",prompt:"",verify:""}];
const MONTHS=[];</script></body></html>`;

test('mini plan: sections, typed rows, notes and posts', () => {
  const plan = parsePlan(MINI);
  assert.match(plan.sections.summary, /<strong>message<\/strong>/);
  assert.doesNotMatch(plan.sections.summary, /POSITIONING/);
  assert.match(plan.sections.voice, /Own words/);
  assert.deepEqual(plan.rows.focus[1].slice(0, 2), ['2026-11-29', '2026-12-05']);
  assert.deepEqual(plan.rows.bench[0].slice(0, 4), ['Sara\nCEO, Acme', '', '2500', '']);
  assert.deepEqual(plan.rows.kpi, [['Followers', 'growth', '10%']]);
  assert.deepEqual(plan.rows.review, [['Check stories']]);
  assert.deepEqual(plan.rows.history, [['2026-09', 'ours', 'old idea'], ['', 'competitor', 'their idea']]);
  assert.deepEqual(plan.rows.pillars, [['AI'], ['Digital Transformation'], ['Process Engineering']]);
  assert.equal(plan.notes.bench, 'Check the numbers.');
  assert.equal(plan.posts.length, 2);
  assert.equal(plan.posts[0].cap, 'line1\nline2');
  assert.deepEqual(plan.posts[1].pillars, ['AI', 'Digital Transformation', 'Process Engineering']);
  assert.equal(plan.goals.ed, 'Education');
});

test('a script with code is refused, not run', () => {
  assert.throws(() => parsePlan('<script>const P=[(function(){return 1})()];const GOALS={};const WEEKS=[];</script>'), /plan data/);
});

const REAL = process.env.PLAN_FIXTURE || '/home/eslam/docs/personal-brand/eslam-linkedin/content/2026-11-content-plan-pwc-bcg-final.html';
test('the owner\'s November plan (skipped when absent)', { skip: !existsSync(REAL) }, () => {
  const plan = parsePlan(readFileSync(REAL, 'utf8'));
  assert.equal(plan.posts.length, 13);
  assert.equal(plan.rows.focus.length, 5);
  for (const d of plan.rows.focus[0].slice(0, 2)) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(plan.rows.bench.length, 4);
  assert.match(plan.rows.bench[0][2], /^\d+$/);
  assert.equal(plan.rows.history.length, 9);
  assert.ok(['ours', 'competitor'].includes(plan.rows.history[8][1]));
  assert.equal(plan.rows.review.length, 6);
  for (const html of Object.values(plan.sections)) assert.doesNotMatch(html, /<script|—/);
});

const withScript = (script: string) => `<script>${script}</script>`;
const planWithCap = (capLiteral: string) => withScript(`const GOALS={};const WEEKS=[];const P=[{n:1,pillar:"AI",cap:${capLiteral}}];`);

test('escaped quotes and hex escapes survive', () => {
  assert.equal(parsePlan(planWithCap('"say \\"hi\\""')).posts[0].cap, 'say "hi"');
  assert.equal(parsePlan(planWithCap('"\\x41"')).posts[0].cap, 'A');
  assert.equal(parsePlan(planWithCap("'it\\'s \\\"ok\\\"'")).posts[0].cap, 'it\'s "ok"');
});

test('a bare double quote inside a single-quoted or template string parses', () => {
  assert.equal(parsePlan(planWithCap(`'say "hi"'`)).posts[0].cap, 'say "hi"');
  assert.equal(parsePlan(planWithCap('`say "hi"`')).posts[0].cap, 'say "hi"');
});

test('a week range with an unknown month is refused', () => {
  const page = withScript('const GOALS={};const WEEKS=[{n:1,range:"1 - 5 foo",title:"t",desc:"d"}];const P=[];');
  assert.throws(() => parsePlan(page), /plan data/);
});

test('a literal that cannot be converted is refused with the parser\'s own error', () => {
  assert.throws(() => parsePlan(planWithCap('"bad \\q escape"')), /plan data/);
  assert.throws(() => parsePlan(withScript('const GOALS={};const WEEKS=[];const P=[{n:1,cap:undefined}];')), /plan data/);
});
