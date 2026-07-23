# Media Workers

Python worker cluster for document parsing, OCR, ASR, vision, transcoding, and other asynchronous media workloads. Workers report progress, artifacts, cost, and classified failures to the asset-control module.

The first integrated pipelines are:

- browser-extracted audio -> timestamped ASR -> validated clip plan;
- document/image -> OCR or vision metadata candidate;
- approved script + TTS segments -> Remotion render request -> derived media candidate;
- optional server-side FFmpeg clip export when browser export is unavailable.

Workers use leases and idempotency keys from `ai-task.v1`. Local file paths are never accepted as a public resource identifier; inputs are versioned asset references resolved through a controlled adapter.
