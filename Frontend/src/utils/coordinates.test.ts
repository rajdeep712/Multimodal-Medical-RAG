import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRenderedBox, calculateMultipleRenderedBoxes } from './coordinates.ts';
import { SourceCoordinates } from '../types/document.ts';

test('calculateRenderedBox handles PixelSpace coordinates accurately', () => {
  const coord: SourceCoordinates = {
    points: [
      [100, 200],
      [500, 200],
      [500, 300],
      [100, 300],
    ],
    system: 'PixelSpace',
    layout_width: 1000,
    layout_height: 2000,
  };

  const box = calculateRenderedBox(coord, 500, 1000);

  // Scaled 50%
  assert.equal(box.x, 50);
  assert.equal(box.y, 100);
  assert.equal(box.width, 200);
  assert.equal(box.height, 50);
  assert.equal(box.leftPercent, 10);
  assert.equal(box.topPercent, 10);
  assert.equal(box.widthPercent, 40);
  assert.equal(box.heightPercent, 5);
});

test('calculateRenderedBox handles Normalized coordinates', () => {
  const coord: SourceCoordinates = {
    points: [
      [0.2, 0.3],
      [0.8, 0.3],
      [0.8, 0.5],
      [0.2, 0.5],
    ],
    system: 'Normalized',
    layout_width: 1,
    layout_height: 1,
  };

  const box = calculateRenderedBox(coord, 1000, 1000);
  assert.equal(box.x, 200);
  assert.equal(box.y, 300);
  assert.equal(box.width, 600);
  assert.equal(box.height, 200);
});

test('calculateMultipleRenderedBoxes returns transformed boxes for multiple coordinates', () => {
  const coords: SourceCoordinates[] = [
    {
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      system: 'PixelSpace',
      layout_width: 1000,
      layout_height: 1000,
    },
    {
      points: [
        [200, 200],
        [400, 200],
        [400, 400],
        [200, 400],
      ],
      system: 'PixelSpace',
      layout_width: 1000,
      layout_height: 1000,
    },
  ];

  const boxes = calculateMultipleRenderedBoxes(coords, 500, 500);
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0].width, 50);
  assert.equal(boxes[1].width, 100);
});
