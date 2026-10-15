// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {LibraryApp} from '../library/LibraryApp';
import {projectRegistry} from '../projects/registry';
import {DEFAULT_STUDIO_URL, resolveStudioUrl, studioCompositionUrl} from '../studio-config';

vi.mock('@remotion/player', () => ({
  Player: (props: {
    compositionWidth: number;
    compositionHeight: number;
    durationInFrames: number;
    lazyComponent?: unknown;
    inputProps?: {text?: string; accent?: string; direction?: string; typeface?: string; sheet?: string};
  }) => (
    <output aria-label="Animation preview">
      {JSON.stringify({
        width: props.compositionWidth,
        height: props.compositionHeight,
        duration: props.durationInFrames,
        lazy: Boolean(props.lazyComponent),
        text: props.inputProps?.text,
        accent: props.inputProps?.accent,
        direction: props.inputProps?.direction,
        typeface: props.inputProps?.typeface,
        sheet: props.inputProps?.sheet,
      })}
    </output>
  ),
}));

afterEach(cleanup);

const preview = () => screen.findByLabelText('Animation preview');

describe('local visual library', () => {
  it('exposes styles, presets, projects, Studio access, and the reference inspector', async () => {
    render(<LibraryApp />);
    expect(screen.getByRole('heading', {name: 'MotionKit'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: /open remotion studio/i})).toHaveAttribute('href', DEFAULT_STUDIO_URL);
    expect(screen.getByRole('button', {name: /plotter signal/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /kinetic stack/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /focus doodle/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /typography qa · specimens/i})).toBeInTheDocument();
    expect(screen.getByLabelText(/inspect a reference video/i)).toHaveAttribute('accept', 'video/*');
    expect(await preview()).toBeInTheDocument();
  });

  it('lists every registered project exactly once', () => {
    render(<LibraryApp />);
    for (const {meta} of projectRegistry) {
      expect(screen.getAllByRole('button', {name: new RegExp(meta.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')})).toHaveLength(1);
    }
  });

  it('uses a configurable Studio URL for the topbar and project deep links', async () => {
    render(<LibraryApp studioUrl="http://localhost:3100" />);
    expect(screen.getByRole('link', {name: /open remotion studio/i})).toHaveAttribute('href', 'http://localhost:3100');
    fireEvent.click(screen.getByRole('button', {name: /focus doodle/i}));
    expect(screen.getByRole('link', {name: /review focus doodle in studio/i})).toHaveAttribute('href', 'http://localhost:3100/Focus-Doodle-Vertical');
    expect(resolveStudioUrl(' http://127.0.0.1:3200/ ')).toBe('http://127.0.0.1:3200');
    expect(resolveStudioUrl('')).toBe(DEFAULT_STUDIO_URL);
    expect(studioCompositionUrl(DEFAULT_STUDIO_URL, 'QA-Typography-Motion-Square')).toBe(`${DEFAULT_STUDIO_URL}/QA-Typography-Motion-Square`);
  });

  it('previews a production lazily at its registered format with its scenes', async () => {
    render(<LibraryApp />);
    fireEvent.click(screen.getByRole('button', {name: /focus doodle/i}));
    const player = await preview();
    expect(player).toHaveTextContent('"width":1080');
    expect(player).toHaveTextContent('"height":1920');
    expect(player).toHaveTextContent('"duration":900');
    expect(player).toHaveTextContent('"lazy":true');
    // A vertical-only production offers no other aspect ratios.
    expect(within(screen.getByLabelText('Preview aspect ratio')).getAllByRole('button').map((button) => button.textContent)).toEqual(['9:16']);
    expect(screen.getByText('Choosing the one task')).toBeInTheDocument();
    expect(screen.getByLabelText('Project warnings')).toHaveTextContent(/system fallback/i);
  });

  it('switches a QA fixture between its three registered formats', async () => {
    render(<LibraryApp />);
    fireEvent.click(screen.getByRole('button', {name: /typography qa · specimens/i}));
    expect(await preview()).toHaveTextContent('"sheet":"specimens"');
    fireEvent.click(screen.getByRole('button', {name: '1:1'}));
    expect(await preview()).toHaveTextContent('"height":1080');
    expect(screen.getByRole('link', {name: /review typography qa/i})).toHaveAttribute('href', `${DEFAULT_STUDIO_URL}/QA-Typography-Specimens-Square`);
  });

  it('previews and edits distinct style scene roles without changing the original study', async () => {
    render(<LibraryApp />);
    expect(await preview()).toBeInTheDocument();
    const role = screen.getByRole('combobox', {name: 'Preview scene'});
    fireEvent.change(role, {target: {value: 'title'}});
    fireEvent.change(screen.getByRole('textbox', {name: 'Scene headline'}), {target: {value: 'عنوان تجريبي'}});
    expect(await preview()).toHaveTextContent('عنوان تجريبي');
    expect(await preview()).toHaveTextContent('"direction":"rtl"');
    fireEvent.click(screen.getByRole('button', {name: /chalkboard proof/i}));
    fireEvent.change(role, {target: {value: 'explainer'}});
    expect(await preview()).toHaveTextContent('عنوان تجريبي');
    fireEvent.change(role, {target: {value: 'study'}});
    expect(screen.queryByRole('textbox', {name: 'Scene headline'})).toBeNull();
  });

  it('switches the live preset preview between all supported aspect ratios', async () => {
    render(<LibraryApp />);
    fireEvent.click(screen.getByRole('button', {name: '9:16'}));
    expect(await preview()).toHaveTextContent('"width":1080');
    expect(await preview()).toHaveTextContent('"height":1920');

    fireEvent.click(screen.getByRole('button', {name: '1:1'}));
    expect(await preview()).toHaveTextContent('"height":1080');
  });

  it('closes the mobile catalog after a selection so the preview is visible', () => {
    render(<LibraryApp />);
    const toggle = screen.getByRole('button', {name: /browse library/i});
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', {name: /kinetic stack/i}));
    expect(screen.getByRole('button', {name: /browse library/i})).toHaveAttribute('aria-expanded', 'false');
  });

  it('updates configurable preset properties, typeface, and direction predictably', async () => {
    render(<LibraryApp />);
    fireEvent.click(screen.getByRole('button', {name: /kinetic stack/i}));

    fireEvent.change(screen.getByLabelText('Primary text'), {target: {value: 'ركّز دلوقتي'}});
    fireEvent.change(screen.getByLabelText('Accent color'), {target: {value: '#ff3355'}});
    fireEvent.change(screen.getByLabelText('Typeface'), {target: {value: 'text'}});
    fireEvent.change(screen.getByLabelText('Text direction'), {target: {value: 'rtl'}});

    const player = await preview();
    expect(player).toHaveTextContent('ركّز دلوقتي');
    expect(player).toHaveTextContent('#ff3355');
    expect(player).toHaveTextContent('"typeface":"text"');
    expect(player).toHaveTextContent('"direction":"rtl"');
  });

  it('derives direction from the text when set to auto', async () => {
    render(<LibraryApp />);
    fireEvent.click(screen.getByRole('button', {name: /kinetic stack/i}));
    fireEvent.change(screen.getByLabelText('Text direction'), {target: {value: 'auto'}});

    fireEvent.change(screen.getByLabelText('Primary text'), {target: {value: 'الفكرة تتحرك'}});
    expect(await preview()).toHaveTextContent('"direction":"rtl"');
    expect(screen.getByLabelText('Primary text')).toHaveAttribute('dir', 'rtl');

    fireEvent.change(screen.getByLabelText('Primary text'), {target: {value: 'Ideas move'}});
    expect(await preview()).toHaveTextContent('"direction":"ltr"');
  });

  it('resets preset controls to the preset defaults when another preset is chosen', async () => {
    render(<LibraryApp />);
    fireEvent.click(screen.getByRole('button', {name: /kinetic stack/i}));
    fireEvent.change(screen.getByLabelText('Primary text'), {target: {value: 'temporary'}});
    fireEvent.click(screen.getByRole('button', {name: /marker highlight/i}));
    expect(screen.getByLabelText('Primary text')).toHaveValue('الفكرة تتحرك أمامك');
    expect(await preview()).toHaveTextContent('"direction":"rtl"');
  });
});
