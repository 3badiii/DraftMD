<div align="center">

# DraftMD

### A fast, private, visual Markdown editor for the browser

Write visually, edit the raw Markdown, preview the result, and save clean `.md` files without sending your documents to a server.

[![Version](https://img.shields.io/badge/version-1.0.0-0969da?style=flat-square)](#)
[![License](https://img.shields.io/badge/license-MIT-1f883d?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-087ea4?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![Markdown](https://img.shields.io/badge/GFM-supported-24292f?style=flat-square&logo=markdown&logoColor=white)](https://github.github.com/gfm/)

**Visual editing · Raw Markdown · Live preview · Multiple files · Local-first privacy**

</div>

---

## Preview

![DraftMD light theme](public/screenshots/draftmd-light.png)

<details>
<summary><strong>View the dark theme</strong></summary>

![DraftMD dark theme](public/screenshots/draftmd-dark.png)

</details>

## About DraftMD

DraftMD is a browser-based visual Markdown editor built for README files, notes, documentation, command references, and technical writing. It combines a familiar rich-text writing surface with direct access to GitHub Flavored Markdown (GFM).

Documents are processed locally in the browser. DraftMD has no account system, database, analytics service, or document-upload backend.

## Why DraftMD?

| Capability | What it provides |
| --- | --- |
| Visual editor | Format content without memorizing Markdown syntax |
| Raw Markdown | Inspect and edit the exact `.md` source at any time |
| Rendered preview | Review GitHub-style output before saving |
| Multi-document tabs | Open and switch between several files in one session |
| Local-first processing | Keep document content on the device |
| Lightweight setup | Start the editor with one script and no database |

## Features

- Visual formatting for paragraphs, H1-H6, bold, italic, strikethrough, and inline code
- Bullet lists, numbered lists, task lists, quotes, tables, rules, and fenced code blocks
- GitHub Flavored Markdown parsing and rendering
- Synchronized Write, Raw Markdown, and Preview modes
- Multiple open documents with independent names and save states
- Searchable document outline with heading navigation
- Open one or several `.md`, `.markdown`, or text files
- Save the active document directly as a `.md` download
- Insert links without unsupported browser prompts
- Insert remote or local images with optional width and height
- GitHub-inspired light and dark themes
- Responsive layouts for mobile, laptop, and large displays
- Deferred preview and outline rendering for smoother typing
- Sanitized rendered HTML for safer previews

## Quick start

### Requirements

- Node.js 22.13 or newer
- npm, included with Node.js
- A current browser such as Chrome, Edge, Firefox, or Safari

### Windows

1. Download the repository as a ZIP.
2. Extract the ZIP.
3. Double-click `start-windows.bat`.

If Node.js is missing, the script offers to install the current Node.js LTS release through Windows Package Manager. DraftMD then installs missing project dependencies, starts the local server, waits until it is ready, and opens the default browser automatically.

### macOS or Linux

Open a terminal in the extracted project folder and run:

```bash
bash start-unix.sh
```

DraftMD starts and opens automatically in the default browser.

## Manual installation

### npm

```bash
npm install
npm run dev
```

### pnpm

```bash
corepack enable
pnpm install
pnpm run dev
```

Open `http://localhost:3000` if the browser is not already open.

## Using the editor

### Create and open documents

- Select `+` in the file tab bar to create a new document.
- Select `Open` to choose one or several Markdown files.
- Switch between documents using the tabs.
- An amber dot identifies unsaved changes.

### Write and format

Use `Write` for visual editing. Select text and use the toolbar to apply formatting. Markdown pasted into the visual editor is converted into formatted content automatically.

Use `Raw Markdown` to edit the source directly. Use `Preview` to inspect the rendered result.

### Insert images

Select `Image`, then enter an image URL or choose an image from the device. Optional width and height values accept 1 to 4000 pixels. Leave either value empty to preserve the automatic dimension.

Local images are embedded as Data URLs so the saved Markdown document remains self-contained. The maximum local image size is 5 MB.

> [!NOTE]
> Some third-party Markdown platforms, including repository viewers, may restrict Data URL images. Repository-relative image files are more suitable for public GitHub documentation.

### Save a document

Select `Save` to download the active document as a `.md` file. Browser security rules prevent a website from silently overwriting the original local file.

## Supported Markdown

| Content | Supported |
| --- | :---: |
| Headings H1-H6 | Yes |
| Bold, italic, and strikethrough | Yes |
| Inline and fenced code | Yes |
| Links and images | Yes |
| Bullet and numbered lists | Yes |
| Task lists | Yes |
| Blockquotes | Yes |
| Tables | Yes |
| Horizontal rules | Yes |
| Raw HTML sanitization | Yes |

## Technology

- TypeScript
- React 19
- Vinext and Vite
- Marked
- Turndown with the GFM plugin
- DOMPurify
- Cloudflare-compatible production worker

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Run the production build locally |
| `npm run lint` | Check code quality and accessibility |
| `npm test` | Build DraftMD and run automated tests |
| `npm run check` | Run linting, the production build, and all tests |

## Production build

```bash
npm install
npm run build
npm run start
```

## Project structure

```text
draftmd/
|-- app/
|   |-- globals.css       # Responsive GitHub-inspired interface
|   |-- layout.tsx        # Metadata and application shell
|   `-- page.tsx          # Editor, tabs, outline, preview, and file actions
|-- public/
|   `-- screenshots/      # Images used by this README
|-- scripts/
|   `-- open-browser.mjs  # Cross-platform automatic browser launcher
|-- tests/                # Automated release checks
|-- worker/               # Production worker entry point
|-- start-unix.sh         # Quick start for macOS and Linux
|-- start-windows.bat     # Quick start for Windows
|-- package.json
`-- README.md
```

## Privacy and security

- Document text and selected images remain in the browser unless the user explicitly saves or shares them.
- Rendered HTML is sanitized with DOMPurify.
- Script, style, iframe, object, and embed elements are blocked from rendered documents.
- Inline color attributes are removed to preserve readability in both themes.
- DraftMD does not require an account, API key, database, or analytics connection.

## Performance

Preview and outline updates are deferred so typing remains responsive. Large images embedded as Data URLs still increase document size and memory use. Hosted URLs or repository image files are more efficient for large documentation projects.

## Roadmap

- [ ] Automatic local draft recovery
- [ ] Side-by-side editor and preview
- [ ] Keyboard shortcuts
- [ ] Find and replace
- [ ] Drag-and-drop files and images
- [ ] Export Markdown and related images as a ZIP
- [ ] HTML and PDF export

## Contributing

1. Fork the repository.
2. Create a focused feature branch.
3. Make and test the change.
4. Run `npm run check`.
5. Open a pull request with a clear description and screenshots when the interface changes.

## Author

Created and maintained by [3badiii](https://github.com/3badiii).

Copyright © 2026 3badiii.

## License

DraftMD is available under the [MIT License](LICENSE).
