import {mix, track} from './timeline';
import type {Key} from './timeline';

// A single-world camera: everything lives on one plane in world coordinates and the camera
// decides which part fills the canvas. Moves are keyframed, so every frame is reproducible.

export type Camera = {x: number; y: number; zoom: number; rotate: number};

export const identityCamera = (width: number, height: number): Camera => ({x: width / 2, y: height / 2, zoom: 1, rotate: 0});

/** CSS transform for the world container: centre the camera target, then zoom and rotate. */
export const cameraTransform = ({x, y, zoom, rotate}: Camera, width: number, height: number) =>
  `translate(${width / 2}px, ${height / 2}px) rotate(${rotate}deg) scale(${zoom}) translate(${-x}px, ${-y}px)`;

export const mixCamera = (a: Camera, b: Camera, t: number): Camera => ({
  x: mix(a.x, b.x, t),
  y: mix(a.y, b.y, t),
  zoom: mix(a.zoom, b.zoom, t),
  rotate: mix(a.rotate, b.rotate, t),
});

export type CameraKeys = {x: readonly Key[]; y: readonly Key[]; zoom: readonly Key[]; rotate?: readonly Key[]};

/** Evaluates independent keyframe tracks per axis, so a push-in can outlast a whip pan. */
export const cameraTrack = (frame: number, keys: CameraKeys): Camera => ({
  x: track(frame, keys.x),
  y: track(frame, keys.y),
  zoom: track(frame, keys.zoom),
  rotate: keys.rotate ? track(frame, keys.rotate) : 0,
});

/** Background layers move less than the foreground; 0 = locked to screen, 1 = locked to world. */
export const parallax = (camera: Camera, depth: number, width: number, height: number): Camera => ({
  x: mix(width / 2, camera.x, depth),
  y: mix(height / 2, camera.y, depth),
  zoom: mix(1, camera.zoom, depth),
  rotate: camera.rotate * depth,
});

/** Maps a world point to screen pixels through the camera (for hit tests and caption anchoring). */
export const worldToScreen = (point: {x: number; y: number}, camera: Camera, width: number, height: number) => {
  const radians = (camera.rotate * Math.PI) / 180;
  const dx = (point.x - camera.x) * camera.zoom;
  const dy = (point.y - camera.y) * camera.zoom;
  return {
    x: width / 2 + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: height / 2 + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
};
