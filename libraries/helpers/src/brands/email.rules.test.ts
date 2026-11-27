// npx -y tsx@4.19.2 --test libraries/helpers/src/brands/email.rules.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IMPORT_MAX_ROWS, campaignIdFromRelease, campaignState, consentOf, hubTag, listmonkImportCsv, parseCsv, pct, rate, readContacts,
  unsubscribesByCampaign,
} from './email.rules';

test('rates are rounded to two places and need a base above zero', () => {
  assert.equal(pct(8, 37), 21.62);
  assert.equal(pct(37, 41), 90.24);
  assert.equal(pct(0, 0), null);
  assert.equal(pct(3, null), null);
  assert.deepEqual(rate(5, 37), { count: 5, pct: 13.51 });
});

test('the Listmonk campaign id is read from the post release link', () => {
  assert.equal(campaignIdFromRelease('https://listmonk.example.com/api/campaigns/12/preview'), 12);
  assert.equal(campaignIdFromRelease('https://www.linkedin.com/feed/update/urn:li:share:1'), null);
  assert.equal(campaignIdFromRelease(null), null);
});

test('Listmonk statuses map to the tab states', () => {
  assert.equal(campaignState('finished'), 'sent');
  assert.equal(campaignState('running'), 'sending');
  assert.equal(campaignState('scheduled'), 'scheduled');
  assert.equal(campaignState('something-new'), 'draft');
});

test('consent comes from the list tags, team before agreed', () => {
  assert.equal(consentOf(['consent-agreed']), 'agreed');
  assert.equal(consentOf(['consent-team', 'consent-agreed']), 'team');
  assert.equal(consentOf([]), 'none');
  assert.equal(consentOf(null), 'none');
  assert.equal(hubTag('abc'), 'hub-abc');
});

test('an unsubscribe goes to the latest campaign sent to its list before it', () => {
  const sends = [
    { id: 1, listIds: [5], at: '2026-11-01T10:00:00Z' },
    { id: 2, listIds: [5, 6], at: '2026-11-10T10:00:00Z' },
    { id: 3, listIds: [6], at: '2026-11-20T10:00:00Z' },
    { id: 4, listIds: [5], at: null },
  ];
  const got = unsubscribesByCampaign(sends, [
    { listId: 5, at: '2026-11-02T00:00:00Z' }, // after 1
    { listId: 5, at: '2026-11-15T00:00:00Z' }, // after 2 (4 never started)
    { listId: 6, at: '2026-11-21T00:00:00Z' }, // after 3
    { listId: 6, at: '2026-11-09T00:00:00Z' }, // before any send to list 6
    { listId: 9, at: '2026-11-21T00:00:00Z' }, // a list no campaign used
  ]);
  assert.deepEqual([...got.entries()].sort(), [[1, 1], [2, 1], [3, 1]]);
});

test('CSV: quotes, doubled quotes, semicolons, CRLF and a byte-order mark', () => {
  assert.deepEqual(parseCsv('﻿email,name\r\n"a@x.com","Smith, ""Jo"""\r\nb@x.com;B\n\n'), [
    ['email', 'name'], ['a@x.com', 'Smith, "Jo"'], ['b@x.com', 'B'],
  ]);
});

test('contacts with a header: email and name columns, duplicates and bad rows skipped', () => {
  const got = readContacts('Name,Email\nAhmed,Ahmed@X.com\nBad,not-an-email\nAgain,ahmed@x.com\n,sara@y.org');
  assert.equal(got.error, null);
  assert.deepEqual(got.contacts, [{ email: 'ahmed@x.com', name: 'Ahmed' }, { email: 'sara@y.org', name: '' }]);
  assert.equal(got.skipped, 2);
});

test('contacts without a header: the first address in the row, the cell after it as the name', () => {
  const got = readContacts('a@x.com,Ali\n12,b@y.com,Badr');
  assert.deepEqual(got.contacts, [{ email: 'a@x.com', name: 'Ali' }, { email: 'b@y.com', name: 'Badr' }]);
});

test('an empty file, a file with no address and a file too long are refused', () => {
  assert.equal(readContacts('').error, 'The file is empty');
  assert.equal(readContacts('name\nAli').error, 'No email address found in the file');
  const many = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `p${i}@x.com`).join('\n');
  assert.match(readContacts(many).error || '', /At most/);
});

test('the Listmonk import file carries who confirmed the agreement on every person', () => {
  const csv = listmonkImportCsv([{ email: 'a@x.com', name: 'Ali "A"' }, { email: 'b@y.com', name: '' }], 'Mona', '2026-11-27T10:00:00Z');
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], ['email', 'name', 'attributes']);
  assert.deepEqual(rows[1].slice(0, 2), ['a@x.com', 'Ali "A"']);
  assert.equal(rows[2][1], 'b');
  assert.deepEqual(JSON.parse(rows[1][2]), { consent: { by: 'Mona', at: '2026-11-27T10:00:00Z', source: 'hub-import' } });
});
