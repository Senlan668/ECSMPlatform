import test from 'node:test';
import assert from 'node:assert/strict';

import { formatTaskDuration } from '../src/utils/taskTime.ts';

test('时长超过 1 小时时显示 H:MM:SS', () => {
  assert.equal(formatTaskDuration(7988), '2:13:08');
});

test('时长不足 1 小时时显示 M:SS', () => {
  assert.equal(formatTaskDuration(245), '4:05');
});

test('未知时长返回 null', () => {
  assert.equal(formatTaskDuration(null), null);
});
