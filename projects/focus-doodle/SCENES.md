# Focus Doodle — creative specification

## Production contract

- Canvas: 1080×1920, vertical 9:16
- Frame rate: 30 FPS
- Duration: 900 frames / 30 seconds
- Review frames: 0.5s hook, 3.5s, 11s, 17.8s sweep, 22s, 27s, 29.9s hold
- Export state: preview-only until explicit owner review and manual export

## Staging

One continuous room instead of four separate slides: a floor line, a table with the notebook and phone, and a character whose shoulder/elbow and hip/knee/foot joints are rigged independently. A keyframed camera (`choreography.ts`) moves through the room; captions stay in screen space, sound words live in the world. Background parallax runs at 0.35× the camera.

## Connected beats

1. **Overwhelmed (frames 0–224).** Hook: insert close-up on the buzzing phone with an in-world «بززز!» (0–28), then a crash zoom out reveals the character mid-startle in the air (frames 28–50), landing with squash. He reaches for the phone as it buzz-walks across the table; three calls pop and each triggers an anticipated head whip that the camera follows (معاد → رسالة → مهمة). Ends in a nervous pose with one foot tapping while the other carries his weight.
2. **Accumulation (frames 225–449).** Each caption phrase is choreographed: «فتبدأ دي» — the task bubble drifts into his raised hand and wobbles on contact; «وتسيب دي» — an incoming call hits his head and he recoils; «وتنسى دي» — the abandoned task drifts away and desaturates. Five more requests fly in from off-screen. Pressure builds: he backs away, panics with hands on his face and knocking knees, while the camera pushes in on a dutch angle with shake and a rotating vortex.
3. **Decision (frames 450–674).** Freeze: the distractions stop mid-air and grey out, the camera snaps level. He closes his eyes and breathes. A box drops in with squash. Wind-up (lean back, arm across the body, back knee loaded) → sweep with a lunge → every bubble and the phone arc into the box → the lid slams («طاخ!») with an impact shake. He dusts his hands, walks with alternating steps to the notebook, picks up the pencil; the camera pushes in and a focus ring draws around the one chosen task.
4. **Resolution (frames 675–899).** Close shot while he writes: lines fill, then the check mark draws in sync with his hand. Three checks fly from the notebook into a pot where the phone used to be; a plant grows. The camera pulls back, he crouches, jumps with tucked legs, and lands as the flower blooms with a camera punch. The box sleeps («z»). The final card «ركّز في الأهم — وهتلاقي الفرق» stamps in and the shot settles into a still hold from ~29.2s.

## Review criteria

- Arabic words animate as whole glyph runs; connected and unclipped.
- Character or object motion carries every beat; captions describe actions as they happen.
- No accidental edge clipping at 1080×1920; captions stay in the top safe band.
- No empty caption gap at beat boundaries or before the final card.
- Final ~20 frames settle into a reviewable hold.
