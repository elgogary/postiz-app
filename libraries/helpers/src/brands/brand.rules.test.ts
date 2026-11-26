import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBrandRole, canEdit, canApprove, validateRows, cleanHtml, weekOf, isTextSection, isRowSection,
} from './brand.rules';

test('org admins approve every brand; others follow their access row; no row means view', () => {
  assert.equal(resolveBrandRole('SUPERADMIN'), 'approve');
  assert.equal(resolveBrandRole('ADMIN', 'VIEW'), 'approve');
  assert.equal(resolveBrandRole('USER', 'APPROVE'), 'approve');
  assert.equal(resolveBrandRole('USER', 'CREATE'), 'create');
  assert.equal(resolveBrandRole('USER', 'VIEW'), 'view');
  assert.equal(resolveBrandRole('USER'), 'view');
  assert.equal(canEdit('view'), false);
  assert.equal(canEdit('create'), true);
  assert.equal(canApprove('create'), false);
  assert.equal(canApprove('approve'), true);
});

test('section keys', () => {
  assert.equal(isTextSection('voice'), true);
  assert.equal(isTextSection('bench'), false);
  assert.equal(isRowSection('bench'), true);
  assert.equal(isRowSection('posts'), false);
});

test('rows: typed cells are checked, blank rows dropped', () => {
  const ok = validateRows('bench', [
    ['Abdullah\nFounder', 'https://www.linkedin.com/in/x/', '14900', '2026-11-20', 'short lines', 'news', 'take'],
    ['', '', '', '', '', '', ''],
  ]);
  assert.equal(ok.length, 1);
  assert.equal(ok[0][2], '14900');
  assert.throws(() => validateRows('bench', [['a', 'javascript:alert(1)', '', '', '', '', '']]), /Link/);
  assert.throws(() => validateRows('bench', [['a', '', '14.9K', '', '', '', '']]), /Followers/);
  assert.throws(() => validateRows('history', [['2026-13', 'ours', 'x']]), /Month/);
  assert.throws(() => validateRows('history', [['2026-11', 'theirs', 'x']]), /Source/);
  assert.throws(() => validateRows('kpi', [['only two', 'cells']]), /3 cells/);
  assert.throws(() => validateRows('nope', []), /Unknown section/);
});

test('html: only simple formatting survives', () => {
  const out = cleanHtml('<p onclick="x()">Hi <strong>you</strong><script>bad()</script></p><a href="javascript:x">l</a><ul><li>a</li></ul><img src=x>');
  assert.equal(out, '<p>Hi <strong>you</strong></p><a>l</a><ul><li>a</li></ul>');
  assert.equal(cleanHtml('<a href="https://x.com/a">x</a>'), '<a href="https://x.com/a" target="_blank" rel="noopener noreferrer">x</a>');
});

test('cleanHtml cannot rebuild a tag from leftovers and escapes stray angle brackets', () => {
  for (const input of ['<<x>img src=x onerror=alert(1)>', '<<x>script>alert(1)<</x>/script>', '<p>a</p><img src=x onerror=alert(1)']) {
    const out = cleanHtml(input);
    assert.doesNotMatch(out, /<img|<script/i);
    assert.doesNotMatch(out, /<(?!\/?(p|a)>)/);
  }
  assert.match(cleanHtml('<p>a</p><img src=x onerror=alert(1)'), /&lt;img/);
  assert.equal(cleanHtml('1 < 2 > 0'), '1 &lt; 2 &gt; 0');
});

test('a date cell must be a real calendar date', () => {
  assert.throws(() => validateRows('focus', [['2026-02-31', '2026-03-01', 't', 'd']]), /Start/);
});

test('week of a date comes from the Focus rows', () => {
  const focus = [['2026-11-15', '2026-11-21', 'a', ''], ['2026-11-22', '2026-11-28', 'b', '']];
  assert.equal(weekOf(focus, '2026-11-15'), 1);
  assert.equal(weekOf(focus, '2026-11-24'), 2);
  assert.equal(weekOf(focus, '2026-12-01'), 0);
});
