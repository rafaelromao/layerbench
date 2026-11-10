import type { Page } from '@playwright/test';
import { playgroundUrl, type Shown } from './layouts.ts';

/**
 * His playground on a layout, given the text through its corpus popup, and the numbers it then
 * prints, as it prints them.
 */
export async function readPlayground(page: Page, layout: string, text: string): Promise<Shown> {
  await page.goto(playgroundUrl(layout));
  // His word list, dictionary and effort table load before the page measures anything.
  await page.waitForFunction(() => {
    const w = window as unknown as Record<string, unknown>;
    return w.dataloaded === true && w.dictionaryloaded === true && w.effortloaded === true;
  });
  return page.evaluate(measure, text);
}

/**
 * Runs in his page: pastes the text as his corpus popup takes it, then reads the panels. The popup
 * redraws the statistics but not the board, where Effort is printed, so the board is drawn again.
 * SFB, its two-row part and the skipgrams share panels whose arrows switch between them, so each is
 * set to the view that prints the number; the trigram panel's first view lists each category, its
 * share in the text after its name.
 */
export function measure(text: string): Shown {
  const w = window as unknown as Record<string, unknown> & {
    closeCorpusPopup: () => void;
    generateLayout: () => void;
    generatePlots: () => void;
  };
  (document.getElementById('corpusText') as HTMLTextAreaElement).value = text;
  w.closeCorpusPopup();
  w.generateLayout();

  const read = (svg: string, label: RegExp): string => {
    const texts = [...document.querySelectorAll(`#${svg} text`)].map((t) => t.textContent ?? '');
    const found = texts.flatMap((t) => {
      const m = label.exec(t);
      return m ? [m[1]] : [];
    });
    if (found.length !== 1) throw new Error(`${label}: ${found.length} matches in #${svg}`);
    return found[0];
  };
  /** A trigram category's share, printed in the text after its name. */
  const after = (name: string): string => {
    const texts = [...document.querySelectorAll('#svgstats text')].map((t) => t.textContent ?? '');
    const at = texts.indexOf(name);
    const m = at < 0 ? null : /^(\d+\.\d\d)%$/.exec(texts[at + 1] ?? '');
    if (!m) throw new Error(`no share after "${name}" in #svgstats`);
    return m[1];
  };
  const view = (sfb: number): void => {
    w.sfb_toggle = sfb;
    w.trigram_toggle = 0;
    w.skip_toggle = 0;
    w.lsb_toggle = 0;
    w.scissors_toggle = 0;
    w.generatePlots();
  };

  view(0);
  const shown = {
    effort: read('svglayout', /^Effort (\d+\.\d\d)$/),
    sfb: read('svgstats', /^Same Finger Bigrams (\d+\.\d\d)%$/),
    lsb: read('svgstats', /^Lat Stretch Bigrams (\d+\.\d\d)%$/),
    sfs: read('svgstats', /^Skip Bigrams (\d+\.\d\d)%$/),
    fsb: read('svgstats', /^Scissors (\d+\.\d\d)%$/),
    weak_redirect: after('weak redirect'),
  };
  view(2);
  const sfb2u = read('svgstats', /^2u Same Finger Bigrams (\d+\.\d\d)%$/);
  view(0);
  return { ...shown, sfb_2u: sfb2u };
}
