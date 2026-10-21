import { describe, expect, it } from 'vitest';
import { bundledLayout } from '../layouts/index.js';
import { compileLayout } from './compile.js';
import { homeRowLetters } from './home-row.js';

const letters = (id: string) => homeRowLetters(compileLayout(bundledLayout(id)!));

describe('home-row letters', () => {
  it('reads the base layer’s home row left to right, letters only', () => {
    expect(letters('qwerty')).toBe('asdfghjkl');
  });
});
