import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RhymedMisra, RhymeLegend } from '../src/components/RhymeMarks';
import { libraryPoem } from '../src/data/library';
import { rhymeScheme } from '../src/lib/rhyme';
import { updateSettings, useSettings } from '../src/lib/settings';

const poem = libraryPoem('hafez-ghazal-255')!;
const scheme = rhymeScheme(poem.verses)!;

function Legend() {
  const { showRhyme } = useSettings();
  return <RhymeLegend scheme={scheme} on={showRhyme} />;
}

describe('rhyme marks', () => {
  afterEach(() => { cleanup(); updateSettings({ showRhyme: false }); });

  it('keeps the misra text unchanged and marks the rhyme word and radif', () => {
    const text = poem.verses[0].misras[1];
    const { container } = render(<RhymedMisra text={text} rhyme={scheme.misras.get('1:1')} />);
    expect(container.textContent).toBe(text);
    expect(container.querySelector('.rhyme-word')!.textContent).toBe('گلستان');
    expect(container.querySelector('.radif')!.textContent).toBe('غم مخور');
  });

  it('renders a plain misra when there is no mark', () => {
    const { container } = render(<RhymedMisra text="یک دو سه" />);
    expect(container.innerHTML).toBe('<span class="misra">یک دو سه</span>');
  });

  it('toggles the legend and remembers the choice', () => {
    render(<Legend />);
    const button = screen.getByRole('button', { name: 'ردیف و قافیه' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/«غم مخور»/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('hamsokhan.settings')!).showRhyme).toBe(true);
  });
});
