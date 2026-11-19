# Changelog

All notable changes to **Journalify** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-19

### Added
- Initial release of **Journalify** (`0` runtime dependencies, Desktop & Mobile).
- Auto-detection of Core Daily Notes and Periodic Notes (including nested folder patterns such as `YYYY/MM/YYYY-MM-DD`) plus multi-profile journal support.
- Fast `MetadataCache`-backed index with windowed infinite scrolling, search, combined filters (mood, tag, place, people, media, favorites), streak counter, and *"On this day"* memories.
- Three switchable layouts (**Card feed**, **Vertical timeline**, **Two-page book view**) with 1-click live split-editor synchronization.
- Six built-in Light & Dark theme editions (**Obsidian native**, **Warm cozy**, **Clean minimal**, **Creative retro scrapbook**, **Classic editorial magazine**, **Typewriter & field logbook**).
- Interactive task checkbox toggling, frontmatter popovers (mood, weather, location, people), safe in-place body editing, and zero-ghost-file Today quick-start card with template/Templater compatibility.
- Deduplicated photo gallery grids with zoomable lightbox plus native audio/video embed players.
- Optional API-key-free Open-Meteo current & historical weather lookup.
- Responsive inspector panel inside the Journalify view and optional standalone right-sidebar inspector view.
- Zero-dependency Day One `.zip` / `.json` archive importer with same-day merge and UUID duplicate protection.
- Automatic interface language detection (`en` / `de`) via Obsidian's `getLanguage()`.
