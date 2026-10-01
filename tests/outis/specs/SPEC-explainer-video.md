# Spec: explainer-video

The `explainer_video` tool lives in outis-mneme (`services/manim-render/owui_video.py`,
installed with `scripts/install_manim_video.sh`); the renderer is the `manim-render` service
there, on an internal-only compose network. This suite guards the Open WebUI side it depends on:
native tool calls, `upload_file_handler`, `Chats.add_message_files_by_id_and_message_id`, and
file streaming with Range requests. Playback in a chat is CR-7/CR-8 (SPEC-chat-render.md).

Skipped unless outis-mneme is at `$OUTIS_MNEME_DIR` (default `~/GithubProjects/outis-mneme`)
and the `$OUTIS_MANIM_NETWORK` network (default `llama-server_manim`) has manim-render on it.

## Acceptance criteria

The tool takes slides (title, optional LaTeX formula, bullets, a line chart), not code; the
service draws them with one fixed layout so text cannot overlap (changed 2026-10-01 after
model-written Manim scenes piled labels on top of each other).

- **EV-1** Calling the tool with valid slides returns `<video>/api/v1/files/<id>/content</video>`,
  attaches `<title>.mp4` to the message, and a browser with the login cookie loads the file
  as video (duration > 0).
- **EV-2** A slide whose formula is not valid LaTeX returns text containing `RENDER FAILED`
  and `LaTeX`.
