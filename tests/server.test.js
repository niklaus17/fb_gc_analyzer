import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leadCount } from '../server/meta.js';

test('leadCount ia doar Website leads din 7-day click attribution', () => {
  assert.equal(leadCount([
    { action_type: 'lead', value: '8', '7d_click': '7' },
    { action_type: 'offsite_conversion.fb_pixel_lead', value: '8', '7d_click': '7' },
    { action_type: 'onsite_web_lead', value: '8', '7d_click': '7' },
    { action_type: 'link_click', value: '99', '7d_click': '99' },
  ]), 7);
  assert.equal(leadCount([{ action_type: 'lead', value: '8' }]), 0);
  assert.equal(leadCount(), 0);
});

test('Meta insights cere explicit atribuirea 7-day click', () => {
  const source = readFileSync(new URL('../server/meta.js', import.meta.url), 'utf8');
  assert.match(source, /action_attribution_windows:\s*\['7d_click'\]/);
});
