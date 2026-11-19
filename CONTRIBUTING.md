# Contributing to Journalify

Contributions, bug reports, and pull requests are welcome!

## Local Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/MarkusLitz/obsidian-journalify.git
   cd obsidian-journalify
   ```
2. Install dev dependencies (Journalify has zero runtime dependencies):
   ```bash
   npm ci
   ```
3. Run unit tests and typecheck/build:
   ```bash
   npm test
   npm run build
   ```
4. During active development, run `npm run dev` to watch and rebuild `main.js`.

## Guidelines

- Keep `0` external runtime dependencies and maintain full Desktop & Mobile compatibility (`isDesktopOnly: false`).
- Follow Obsidian's developer guidelines: use `createEl`/`createDiv`/`setIcon` instead of `innerHTML`, use `setCssProps` for dynamic CSS values, avoid `!important` in `styles.css`, and prefer `vault.process` / `fileManager.processFrontMatter` for file mutations.
- Add or update unit tests in `test/journalify.test.mjs` for parser, indexing, mutator, or importer changes.
