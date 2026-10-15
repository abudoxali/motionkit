import {Config} from '@remotion/cli/config';
import {STUDIO_PORT} from './src/studio-config';

// Preview and still settings only. Full video export is owned by scripts/manual-export.ts.
Config.setCodec('h264');
Config.setCrf(18);
Config.setPixelFormat('yuv420p');
Config.setColorSpace('bt709');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setAudioCodec('aac');

// Pinned so the library's Studio links stay valid; see src/studio-config.ts.
Config.setStudioPort(STUDIO_PORT);
