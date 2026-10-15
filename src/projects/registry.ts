import {validateRegistry} from './contract';
import type {ProjectDefinition, ProjectProps, RegisteredProject} from './contract';
import {typographyBidiMeta, typographyMotionMeta, typographySpecimensMeta} from './fixtures/typography';
import {mediaFixtureMeta} from './fixtures/media';
import {focusDoodleMeta} from './focus-doodle/project';
// project:new imports — keep this line; the scaffolder inserts new imports above it.

// The single list of projects. RemotionRoot registers a <Composition> for every entry and the
// library lists them, so adding a project here is the whole registration step.
// Loaders are lazy: the library downloads a project's component only when it is previewed.

const register = <Props extends ProjectProps>(
  meta: ProjectDefinition<Props>,
  load: RegisteredProject<Props>['load'],
): RegisteredProject => ({meta, load} as unknown as RegisteredProject);

const loadTypographyFixture = () =>
  import('../motion/typography/fixtures/TypographyFixture').then((module) => ({default: module.TypographyFixture}));

export const projectRegistry: readonly RegisteredProject[] = [
  register(focusDoodleMeta, () =>
    import('./focus-doodle/FocusDoodleVertical').then((module) => ({default: module.FocusDoodleVertical})),
  ),
  register(typographySpecimensMeta, loadTypographyFixture),
  register(typographyMotionMeta, loadTypographyFixture),
  register(typographyBidiMeta, loadTypographyFixture),
  register(mediaFixtureMeta, () => import('./fixtures/MediaFixture')),
  // project:new entries — keep this line; the scaffolder inserts new projects above it.
];

const registryErrors = validateRegistry(projectRegistry.map((entry) => entry.meta)).filter(
  (issue) => issue.severity === 'error',
);
if (registryErrors.length > 0) {
  throw new Error(`Project registry is invalid: ${registryErrors.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`);
}

export const getProject = (id: string) => {
  const entry = projectRegistry.find((item) => item.meta.id === id);
  if (!entry) throw new Error(`Unknown project: ${id}`);
  return entry;
};

export const projectsOfKind = (kind: ProjectDefinition['kind']) =>
  projectRegistry.filter((entry) => entry.meta.kind === kind);
