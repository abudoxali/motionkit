// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cpSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import path from 'node:path';
import {cleanup, render} from '@testing-library/react';
import {Thumbnail} from '@remotion/player';
import type {ComponentType, Context} from 'react';
import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import {STYLE_IDS} from '../projects/contract';
import {planScaffold} from '../projects/scaffold';
import {applyScaffold} from '../../scripts/project-new';

// Scaffolds a project into a throwaway copy of src/ and renders the generated component at
// scene boundaries, proving the template is not only type-correct but actually draws its scenes.
// The copy lives under the git-ignored analysis/ folder because Vite only imports files inside
// the project root; it is deleted afterwards and never touches the real registry.

const repo = path.resolve('.');
let workspace: string;

afterEach(cleanup);

beforeAll(() => {
  const scratch = path.join(repo, 'analysis', 'tmp');
  mkdirSync(scratch, {recursive: true});
  workspace = mkdtempSync(path.join(scratch, 'project-new-render-'));
  for (const entry of ['src', 'projects', 'package.json']) cpSync(path.join(repo, entry), path.join(workspace, entry), {recursive: true});
  applyScaffold(workspace, planScaffold({id: 'render-reel', title: 'ركّز في الأهم', durationSeconds: 6}));
  for (const styleId of STYLE_IDS) applyScaffold(workspace, planScaffold({id: `${styleId}-reel`, title: 'اختبار الستايل', styleId, durationSeconds: 6}));
});

afterAll(() => {
  if (workspace) rmSync(workspace, {recursive: true, force: true});
});

describe('a scaffolded project renders through <SceneTimeline>', () => {
  it('shows each scene in turn, both during a transition, and the headline first', async () => {
    const load = (file: string) => import(/* @vite-ignore */ path.join(workspace, ...file.split('/')).split(path.sep).join('/'));
    const {RenderReelComposition} = (await load('src/projects/render-reel/RenderReelComposition.tsx')) as {RenderReelComposition: ComponentType<{headline: string}>};
    const {renderReelMeta} = (await load('src/projects/render-reel/project.ts')) as {renderReelMeta: {durationInFrames: number; scenes: {id: string; from: number; durationInFrames: number; transitionInFrames?: number}[]}};
    // The generated code uses its own copy of the typography module, so stub measurement there.
    const {TextMeasureContext} = (await load('src/motion/typography/components.tsx')) as {TextMeasureContext: Context<{width: (text: string, font: {size: number}) => number}>};
    const measure = {width: (text: string, font: {size: number}) => Array.from(text).length * font.size * 0.5};

    const at = (frame: number) =>
      render(
        <TextMeasureContext.Provider value={measure}>
          <Thumbnail
            component={RenderReelComposition}
            inputProps={{headline: 'ركّز في الأهم'}}
            compositionWidth={1080}
            compositionHeight={1920}
            durationInFrames={renderReelMeta.durationInFrames}
            fps={30}
            frameToDisplay={frame}
            errorFallback={({error}) => <output data-error>{error.message}</output>}
          />
        </TextMeasureContext.Provider>,
      ).container;
    const visible = (container: HTMLElement) =>
      Array.from(container.querySelectorAll<HTMLElement>('[data-scene]')).filter((node) => node.style.visibility !== 'hidden').map((node) => node.dataset.scene);

    // Text of one scene; fitted lines are separate blocks, so compare without spaces.
    const sceneText = (container: HTMLElement, id: string) => container.querySelector(`[data-scene="${id}"]`)?.textContent?.replace(/\s+/g, '');
    const [opening, main, closing] = renderReelMeta.scenes;
    expect(renderReelMeta.durationInFrames).toBe(180);

    let container = at(30);
    expect(container.querySelector('[data-error]')).toBeNull();
    expect(visible(container)).toEqual(['opening']);
    expect(sceneText(container, 'opening')).toBe('ركّزفيالأهم');
    cleanup();

    container = at(main.from + 1);
    expect(visible(container)).toEqual(['opening', 'main']);
    cleanup();

    container = at(closing.from - 1);
    expect(visible(container)).toEqual(['main']);
    expect(sceneText(container, 'main')).toBe('Mainidea');
    cleanup();

    container = at(renderReelMeta.durationInFrames - 1);
    expect(visible(container)).toEqual(['closing']);
    expect(sceneText(container, 'closing')).toBe('Closing');
    expect(opening.from).toBe(0);
  });

  it.each(STYLE_IDS)('renders a scaffolded %s project with all three scene roles at distinct frames', async (styleId) => {
    const load = (file: string) => import(/* @vite-ignore */ path.join(workspace, ...file.split('/')).split(path.sep).join('/'));
    const name = `${styleId[0].toUpperCase()}${styleId.slice(1)}Reel`;
    const StyleReelComposition = ((await load(`src/projects/${styleId}-reel/${name}Composition.tsx`)) as Record<string, ComponentType<{headline: string}>>)[`${name}Composition`];
    const styleReelMeta = ((await load(`src/projects/${styleId}-reel/project.ts`)) as Record<string, {
      durationInFrames: number; scenes: {id: string; from: number; durationInFrames: number}[];
    }>)[`${styleId}ReelMeta`];
    const {TextMeasureContext} = (await load('src/motion/typography/components.tsx')) as {
      TextMeasureContext: Context<{width: (text: string, font: {size: number}) => number}>;
    };
    const measure = {width: (text: string, font: {size: number}) => Array.from(text).length * font.size * 0.5};
    const inspect = (frame: number, role: string, sceneId: string) => {
      const container = render(
        <TextMeasureContext.Provider value={measure}>
          <Thumbnail
            component={StyleReelComposition}
            inputProps={{headline: 'اختبار الستايل'}}
            compositionWidth={1080}
            compositionHeight={1920}
            durationInFrames={styleReelMeta.durationInFrames}
            fps={30}
            frameToDisplay={frame}
            errorFallback={({error}) => <output data-error>{error.message}</output>}
          />
        </TextMeasureContext.Provider>,
      ).container;
      expect(container.querySelector('[data-error]')).toBeNull();
      const scene = container.querySelector(`[data-scene="${sceneId}"]`);
      expect(scene).not.toBeNull();
      const stage = scene?.querySelector(`[data-style-template="${styleId}"][data-style-role="${role}"]`);
      expect(stage, `${styleId}/${role}`).not.toBeNull();
      expect(stage?.querySelector('[data-typography-fit="ok"]'), `${styleId}/${role} headline fits`).not.toBeNull();
      cleanup();
    };
    const [opening, main, closing] = styleReelMeta.scenes;
    inspect(30, 'title', opening.id);
    inspect(main.from + 15, 'explainer', main.id);
    inspect(styleReelMeta.durationInFrames - 1, 'end-card', closing.id);
  });

});
