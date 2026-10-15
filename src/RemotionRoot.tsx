import type {ComponentType} from 'react';
import {Composition, Folder} from 'remotion';
import {compositionFormats} from './motion/formats';
import {motionPresets} from './motion/presets';
import {ShowcaseComposition} from './motion/ShowcaseComposition';
import {styleDefinitions} from './motion/styles';
import type {RegisteredProject} from './projects/contract';
import {projectsOfKind} from './projects/registry';

const fps = 30;

// Remotion's Composition props are invariant in the component's props type; the registry has
// already validated defaultProps against each project, so the loader is widened here.
type AnyLoader = () => Promise<{default: ComponentType<Record<string, unknown>>}>;

const ProjectCompositions = ({entries}: {entries: readonly RegisteredProject[]}) => (
  <>
    {entries.flatMap(({meta, load}) =>
      meta.compositions.map((composition) => (
        <Composition
          key={composition.id}
          id={composition.id}
          lazyComponent={load as AnyLoader}
          durationInFrames={meta.durationInFrames}
          fps={meta.fps}
          {...compositionFormats[composition.format]}
          defaultProps={meta.defaultProps}
        />
      )),
    )}
  </>
);

export const RemotionRoot = () => (
  <>
    <Folder name="Productions">
      <ProjectCompositions entries={projectsOfKind('production')} />
    </Folder>

    <Folder name="QA">
      <ProjectCompositions entries={projectsOfKind('fixture')} />
    </Folder>

    <Folder name="Showcase">
      <Composition id="Showcase-Horizontal" component={ShowcaseComposition} durationInFrames={450} fps={fps} {...compositionFormats.horizontal} />
      <Composition id="Showcase-Vertical" component={ShowcaseComposition} durationInFrames={450} fps={fps} {...compositionFormats.vertical} />
      <Composition id="Showcase-Square" component={ShowcaseComposition} durationInFrames={450} fps={fps} {...compositionFormats.square} />
    </Folder>

    <Folder name="Styles">
      {styleDefinitions.map((style) => (
        <Composition
          key={style.id}
          id={`Style-${style.id}`}
          component={style.previewComponent}
          durationInFrames={120}
          fps={fps}
          {...compositionFormats.horizontal}
        />
      ))}
    </Folder>

    <Folder name="Motion-Presets">
      {motionPresets.map((preset) => (
        <Composition
          key={preset.id}
          id={`Preset-${preset.id}`}
          component={preset.component}
          durationInFrames={preset.durationInFrames}
          fps={fps}
          {...compositionFormats.horizontal}
          defaultProps={preset.defaultProps}
        />
      ))}
    </Folder>
  </>
);
