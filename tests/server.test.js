import test from 'node:test';
import assert from 'node:assert/strict';
import { leadCount } from '../server/meta.js';

test('leadCount însumează doar acțiunile Meta de tip lead', () => {
  assert.equal(leadCount([
    { action_type: 'lead', value: '3' },
    { action_type: 'onsite_conversion.lead_grouped', value: '2' },
    { action_type: 'link_click', value: '99' },
  ]), 5);
  assert.equal(leadCount(), 0);
});
