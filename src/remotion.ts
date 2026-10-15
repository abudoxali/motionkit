import {registerRoot} from 'remotion';
import {RemotionRoot} from './RemotionRoot';

// Bundled fonts load on demand: every component that draws with them calls
// useProjectFontsReady(), which holds rendering with delayRender until they are decoded.
// Compositions that never use them (such as Focus-Doodle-Vertical) are not gated.
registerRoot(RemotionRoot);
