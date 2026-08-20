"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

type ViewMode = "write" | "raw" | "preview";
type OutlineHeading = { depth: number; id: string; text: string };
type DraftWritableFile = { write: (data: string) => Promise<void>; close: () => Promise<void> };
type DraftFileHandle = {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<DraftWritableFile>;
  queryPermission: (options: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission: (options: { mode: "readwrite" }) => Promise<PermissionState>;
};
type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: object) => Promise<DraftFileHandle[]>;
  showSaveFilePicker?: (options?: object) => Promise<DraftFileHandle>;
};
type EditorDocument = { id: string; filename: string; markdown: string; saved: boolean; fileHandle?: DraftFileHandle };
type StoredSession = {
  version: 1;
  documents: EditorDocument[];
  activeId: string;
  mode: ViewMode;
  dark: boolean;
  outlineOpen: boolean;
};
type InsertDialog = { kind: "link" | "image"; url: string; label: string; width: string; height: string; editing?: boolean; fileName?: string; error?: string };
type TableDialog = { rows: string; columns: string };
type ActiveFormats = {
  block: string;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  taskList: boolean;
  quote: boolean;
  link: boolean;
  table: boolean;
  codeBlock: boolean;
};

const emptyActiveFormats: ActiveFormats = {
  block: "",
  bold: false,
  italic: false,
  strike: false,
  code: false,
  unorderedList: false,
  orderedList: false,
  taskList: false,
  quote: false,
  link: false,
  table: false,
  codeBlock: false,
};

marked.setOptions({ gfm: true, breaks: false });

const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const sessionDatabaseName = "draftmd-local";
const sessionStoreName = "sessions";
const currentSessionKey = "current";
const markdownFileTypes = [{
  description: "Markdown files",
  accept: {
    "text/markdown": [".md", ".markdown"],
    "text/plain": [".txt"],
  },
}];

const starterMarkdown = `# Create better Markdown, visually

DraftMD gives you a focused writing space with the power of **GitHub Flavored Markdown** underneath.

> Your documents stay on your device. Write, preview, open, and save without an account.

## One editor, three ways to work

- [x] Write visually with a familiar formatting toolbar
- [x] Edit the raw Markdown whenever you need full control
- [x] Preview the final GitHub-style result before saving

| Mode | Best for |
| --- | --- |
| Write | Fast, distraction-free editing |
| Raw Markdown | Precise source control |
| Preview | Reviewing the final document |

## Built for real documentation

Open several files, navigate long documents with the outline, insert local images, and save clean \`.md\` files.

\`\`\`javascript
console.log("Ready to write with DraftMD");
\`\`\`
`;

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function markdownToHtml(markdown: string) {
  const rendered = marked.parse(markdown, { async: false }) as string;
  if (typeof window === "undefined") return rendered;
  const sanitized = DOMPurify.sanitize(rendered, {
    ADD_ATTR: ["target"],
    FORBID_ATTR: ["style", "color", "bgcolor"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
  });
  const document = new DOMParser().parseFromString(sanitized, "text/html");
  assignHeadingIds(document);
  return document.body.innerHTML;
}

function assignHeadingIds(root: ParentNode) {
  const usedIds = new Map<string, number>();
  root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) => {
    const baseId = slugifyHeading(heading.textContent || "section");
    const count = usedIds.get(baseId) || 0;
    usedIds.set(baseId, count + 1);
    heading.id = count ? `${baseId}-${count + 1}` : baseId;
  });
}

function slugifyHeading(value: string) {
  return value.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-").replace(/-+/g, "-") || "section";
}

function extractOutline(markdown: string): OutlineHeading[] {
  const tokens = marked.lexer(markdown);
  const usedIds = new Map<string, number>();
  return tokens.flatMap((token) => {
    if (token.type !== "heading") return [];
    const baseId = slugifyHeading(token.text.replace(/[*_`~]/g, ""));
    const count = usedIds.get(baseId) || 0;
    usedIds.set(baseId, count + 1);
    return [{ depth: token.depth, id: count ? `${baseId}-${count + 1}` : baseId, text: token.text.replace(/[*_`~]/g, "") }];
  });
}

function htmlToMarkdown(element: HTMLElement) {
  const service = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    fence: "```",
    headingStyle: "atx",
    strongDelimiter: "**",
  });
  service.use(gfm);
  service.addRule("sizedImages", {
    filter: (node) => node.nodeName === "IMG" && Boolean((node as HTMLElement).getAttribute("width") || (node as HTMLElement).getAttribute("height")),
    replacement: (_content, node) => {
      const image = node as HTMLElement;
      const source = image.getAttribute("src") || "";
      const alt = image.getAttribute("alt") || "Image";
      const width = image.getAttribute("width");
      const height = image.getAttribute("height");
      const sizeAttributes = `${width ? ` width="${escapeHtml(width)}"` : ""}${height ? ` height="${escapeHtml(height)}"` : ""}`;
      return `\n\n<img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}"${sizeAttributes}>\n\n`;
    },
  });
  return `${service.turndown(element.innerHTML).trimEnd()}\n`;
}

function normalizeImageDimension(value: string) {
  if (!value.trim()) return "";
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return "";
  return String(Math.min(4000, Math.max(1, parsed)));
}

function findInlineCodeForRange(editor: HTMLElement, range: Range) {
  const boundaryElements = [range.startContainer, range.endContainer].map((node) => (
    node instanceof Element ? node : node.parentElement
  ));
  for (const boundary of boundaryElements) {
    const code = boundary?.closest("code");
    if (code instanceof HTMLElement && !code.closest("pre") && editor.contains(code)) return code;
  }
  for (const code of editor.querySelectorAll<HTMLElement>("code")) {
    if (!code.closest("pre") && range.intersectsNode(code)) return code;
  }
  return null;
}

function normalizeMarkdownFilename(value: string) {
  return /\.(md|markdown)$/i.test(value) ? value : `${value}.md`;
}

function createDocumentId() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `document-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function writeFileHandle(handle: DraftFileHandle, content: string) {
  let permission = await handle.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") permission = await handle.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") return false;

  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  return true;
}

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<StoredSession>;
  return session.version === 1
    && Array.isArray(session.documents)
    && session.documents.length > 0
    && session.documents.every((item) => Boolean(item)
      && typeof item.id === "string"
      && typeof item.filename === "string"
      && typeof item.markdown === "string"
      && typeof item.saved === "boolean")
    && typeof session.activeId === "string"
    && (session.mode === "write" || session.mode === "raw" || session.mode === "preview")
    && typeof session.dark === "boolean"
    && typeof session.outlineOpen === "boolean";
}

function openSessionDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(sessionDatabaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(sessionStoreName)) request.result.createObjectStore(sessionStoreName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredSession() {
  const database = await openSessionDatabase();
  return new Promise<StoredSession | null>((resolve, reject) => {
    const transaction = database.transaction(sessionStoreName, "readonly");
    const request = transaction.objectStore(sessionStoreName).get(currentSessionKey);
    request.onsuccess = () => resolve(isStoredSession(request.result) ? request.result : null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function writeStoredSession(session: StoredSession) {
  const database = await openSessionDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(sessionStoreName, "readwrite");
    try {
      transaction.objectStore(sessionStoreName).put(session, currentSessionKey);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function persistStoredSession(session: StoredSession) {
  try {
    await writeStoredSession(session);
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "DataCloneError") throw error;
    await writeStoredSession({
      ...session,
      documents: session.documents.map((document) => ({
        id: document.id,
        filename: document.filename,
        markdown: document.markdown,
        saved: document.saved,
      })),
    });
  }
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>,
    folder: <><path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 6V5a2 2 0 0 1 2-2h4l2 3"/></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    code: <><path d="M16 18l6-6-6-6M8 6l-6 6 6 6M14.5 4l-5 16"/></>,
    moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export default function Home() {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const editingImageRef = useRef<HTMLImageElement | null>(null);
  const [documents, setDocuments] = useState<EditorDocument[]>([{ id: "welcome", filename: "README.md", markdown: starterMarkdown, saved: true }]);
  const [activeId, setActiveId] = useState("welcome");
  const [mode, setMode] = useState<ViewMode>("write");
  const [dark, setDark] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [outlineFilter, setOutlineFilter] = useState("");
  const [insertDialog, setInsertDialog] = useState<InsertDialog | null>(null);
  const [tableDialog, setTableDialog] = useState<TableDialog | null>(null);
  const [activeFormats, setActiveFormats] = useState<ActiveFormats>(emptyActiveFormats);
  const [sessionReady, setSessionReady] = useState(false);
  const [draggedDocumentId, setDraggedDocumentId] = useState<string | null>(null);
  const [dragOverDocumentId, setDragOverDocumentId] = useState<string | null>(null);
  const isClient = useSyncExternalStore(subscribeToClient, getClientSnapshot, getServerSnapshot);
  const activeDocument = documents.find((document) => document.id === activeId) || documents[0];
  const { filename, markdown, saved } = activeDocument;

  const updateActiveDocument = useCallback((patch: Partial<EditorDocument>) => {
    setDocuments((current) => current.map((document) => document.id === activeId ? { ...document, ...patch } : document));
  }, [activeId]);

  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      let restoredMarkdown = starterMarkdown;
      try {
        const session = await readStoredSession();
        if (session && !cancelled) {
          const restoredActiveId = session.documents.some((item) => item.id === session.activeId) ? session.activeId : session.documents[0].id;
          restoredMarkdown = session.documents.find((item) => item.id === restoredActiveId)?.markdown || session.documents[0].markdown;
          setDocuments(session.documents);
          setActiveId(restoredActiveId);
          setMode(session.mode);
          setDark(session.dark);
          setOutlineOpen(session.outlineOpen);
        }
      } catch (error) {
        console.error("DraftMD could not restore the local session.", error);
      } finally {
        if (!cancelled) {
          window.requestAnimationFrame(() => {
            if (editorRef.current) editorRef.current.innerHTML = markdownToHtml(restoredMarkdown);
          });
          setSessionReady(true);
        }
      }
    };

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    const timeout = window.setTimeout(() => {
      void persistStoredSession({ version: 1, documents, activeId, mode, dark, outlineOpen })
        .catch((error) => console.error("DraftMD could not save the local session.", error));
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [activeId, dark, documents, mode, outlineOpen, sessionReady]);

  const syncFromWrite = useCallback(() => {
    if (!editorRef.current) return markdown;
    assignHeadingIds(editorRef.current);
    const nextMarkdown = htmlToMarkdown(editorRef.current);
    updateActiveDocument({ markdown: nextMarkdown, saved: false });
    return nextMarkdown;
  }, [markdown, updateActiveDocument]);

  const updateFormattingState = useCallback(() => {
    if (mode !== "write" || !editorRef.current) {
      setActiveFormats(emptyActiveFormats);
      return;
    }
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    if (!anchorElement || !editorRef.current.contains(anchorElement)) return;
    const listItem = anchorElement.closest("li");
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const code = range ? findInlineCodeForRange(editorRef.current, range) : null;
    const block = anchorElement.closest("h1, h2, h3, h4, h5, h6, p, blockquote, pre");
    const commandState = (command: string) => {
      try {
        return document.queryCommandState(command);
      } catch {
        return false;
      }
    };
    const commandBlock = document.queryCommandValue("formatBlock").toLowerCase().replace(/[<>]/g, "");
    setActiveFormats({
      block: block?.tagName.toLowerCase() || commandBlock,
      bold: commandState("bold"),
      italic: commandState("italic"),
      strike: commandState("strikeThrough"),
      code: Boolean(code && !code.closest("pre")),
      unorderedList: commandState("insertUnorderedList"),
      orderedList: commandState("insertOrderedList"),
      taskList: Boolean(listItem?.querySelector('input[type="checkbox"]')),
      quote: Boolean(anchorElement.closest("blockquote")),
      link: Boolean(anchorElement.closest("a")),
      table: Boolean(anchorElement.closest("table")),
      codeBlock: Boolean(anchorElement.closest("pre")),
    });
  }, [mode]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateFormattingState);
    if (mode !== "write") return () => window.cancelAnimationFrame(frame);
    document.addEventListener("selectionchange", updateFormattingState);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", updateFormattingState);
    };
  }, [mode, updateFormattingState]);

  const restoreEditorSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const currentRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const selectionIsInEditor = Boolean(currentRange && editor?.contains(currentRange.commonAncestorContainer));
    if (editor && document.activeElement !== editor) editor.focus({ preventScroll: true });
    if (!selectionIsInEditor && savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
    return selection;
  };

  const format = (command: string, value?: string) => {
    restoreEditorSelection();
    document.execCommand(command, false, value);
    savedRangeRef.current = null;
    syncFromWrite();
    window.requestAnimationFrame(updateFormattingState);
  };

  const toggleInlineCode = () => {
    const editor = editorRef.current;
    const selection = restoreEditorSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!editor || !selection || !range || !editor.contains(range.commonAncestorContainer)) return;
    const code = findInlineCodeForRange(editor, range);
    if (code) {
      const parent = code.parentNode;
      if (parent) {
        while (code.firstChild) parent.insertBefore(code.firstChild, code);
        code.remove();
      }
    } else {
      const selectedText = selection.toString();
      const codeElement = document.createElement("code");
      codeElement.textContent = selectedText || "code";
      range.deleteContents();
      range.insertNode(codeElement);
      const codeRange = document.createRange();
      codeRange.selectNodeContents(codeElement);
      selection.removeAllRanges();
      selection.addRange(codeRange);
    }
    savedRangeRef.current = null;
    syncFromWrite();
    window.requestAnimationFrame(updateFormattingState);
  };

  const preserveToolbarSelection = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    savedRangeRef.current = range && editorRef.current?.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  };

  const insertHtml = (html: string) => format("insertHTML", DOMPurify.sanitize(html));
  const formatBlock = (tag: string) => format("formatBlock", tag);

  const openInsertDialog = (kind: InsertDialog["kind"]) => {
    if (mode !== "write" && editorRef.current) {
      editorRef.current.innerHTML = markdownToHtml(markdown);
      setMode("write");
    }
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    savedRangeRef.current = range && editorRef.current?.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
    editingImageRef.current = null;
    setInsertDialog({ kind, url: "https://", label: selection?.toString() || (kind === "image" ? "Image" : ""), width: "", height: "" });
  };

  const editImage = (image: HTMLImageElement) => {
    editingImageRef.current = image;
    savedRangeRef.current = null;
    setInsertDialog({
      kind: "image",
      editing: true,
      url: image.getAttribute("src") || "",
      label: image.getAttribute("alt") || "Image",
      width: image.getAttribute("width") || "",
      height: image.getAttribute("height") || "",
    });
  };

  const handleEditorClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLImageElement) editImage(target);
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    const anchorNode = window.getSelection()?.anchorNode;
    const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    const image = anchorElement?.closest("img");
    if (!(image instanceof HTMLImageElement)) return;
    event.preventDefault();
    editImage(image);
  };

  const closeInsertDialog = () => {
    setInsertDialog(null);
    savedRangeRef.current = null;
    editingImageRef.current = null;
  };

  const submitInsertDialog = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!insertDialog) return;
    const enteredUrl = insertDialog.url.trim();
    if (!enteredUrl) return;
    const url = /^(https?:\/\/|mailto:|tel:|\/|#|data:image\/)/i.test(enteredUrl) ? enteredUrl : `https://${enteredUrl}`;
    const selection = window.getSelection();
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
    if (insertDialog.kind === "link") {
      insertHtml(`<a href="${escapeHtml(url)}">${escapeHtml(insertDialog.label.trim() || url)}</a>`);
    } else {
      const width = normalizeImageDimension(insertDialog.width);
      const height = normalizeImageDimension(insertDialog.height);
      const editingImage = editingImageRef.current;
      if (insertDialog.editing && editingImage) {
        editingImage.setAttribute("src", url);
        editingImage.setAttribute("alt", insertDialog.label.trim() || "Image");
        if (width) editingImage.setAttribute("width", width);
        else editingImage.removeAttribute("width");
        if (height) editingImage.setAttribute("height", height);
        else editingImage.removeAttribute("height");
        syncFromWrite();
        closeInsertDialog();
        return;
      }
      const sizeAttributes = `${width ? ` width="${width}"` : ""}${height ? ` height="${height}"` : ""}`;
      insertHtml(`<img src="${escapeHtml(url)}" alt="${escapeHtml(insertDialog.label.trim() || "Image")}"${sizeAttributes}><p><br></p>`);
    }
    closeInsertDialog();
  };

  const chooseLocalImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setInsertDialog((current) => current ? { ...current, error: "Choose a valid image file." } : current);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setInsertDialog((current) => current ? { ...current, error: "The image must be 5 MB or smaller." } : current);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setInsertDialog((current) => current ? { ...current, error: "The image could not be read." } : current);
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      setInsertDialog((current) => current?.kind === "image" ? {
        ...current,
        url: dataUrl,
        label: current.label === "Image" ? file.name.replace(/\.[^.]+$/, "") : current.label,
        fileName: file.name,
        error: "",
      } : current);
    };
    reader.readAsDataURL(file);
  };

  const openTableDialog = () => {
    if (mode !== "write" && editorRef.current) {
      editorRef.current.innerHTML = markdownToHtml(markdown);
      setMode("write");
    }
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    savedRangeRef.current = range && editorRef.current?.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
    setTableDialog({ rows: "3", columns: "2" });
  };

  const closeTableDialog = () => {
    setTableDialog(null);
    savedRangeRef.current = null;
  };

  const submitTableDialog = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tableDialog) return;
    const rows = Math.min(20, Math.max(1, Number.parseInt(tableDialog.rows, 10) || 1));
    const columns = Math.min(12, Math.max(1, Number.parseInt(tableDialog.columns, 10) || 1));
    const header = Array.from({ length: columns }, (_, index) => `<th>Column ${index + 1}</th>`).join("");
    const body = Array.from({ length: Math.max(0, rows - 1) }, (_, rowIndex) => (
      `<tr>${Array.from({ length: columns }, (_, columnIndex) => `<td>Row ${rowIndex + 2}, Column ${columnIndex + 1}</td>`).join("")}</tr>`
    )).join("");
    const selection = window.getSelection();
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
    insertHtml(`<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table><p><br></p>`);
    closeTableDialog();
  };
  const addTaskList = () => insertHtml('<ul><li><input type="checkbox"> Task item</li><li><input type="checkbox" checked> Completed item</li></ul><p><br></p>');
  const addCodeBlock = () => {
    const selected = window.getSelection()?.toString() || "Write code here";
    insertHtml(`<pre><code>${escapeHtml(selected)}</code></pre><p><br></p>`);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    insertHtml(markdownToHtml(text));
  };

  const activateDocument = (id: string) => {
    const target = documents.find((document) => document.id === id);
    if (!target || id === activeId) return;
    setActiveId(id);
    setOutlineFilter("");
    window.requestAnimationFrame(() => {
      if (editorRef.current) editorRef.current.innerHTML = markdownToHtml(target.markdown);
    });
  };

  const createDocument = () => {
    const document: EditorDocument = {
      id: createDocumentId(),
      filename: `untitled-${documents.length + 1}.md`,
      markdown: "# New document\n",
      saved: false,
    };
    setDocuments((current) => [...current, document]);
    setActiveId(document.id);
    setMode("write");
    setOutlineFilter("");
    window.requestAnimationFrame(() => {
      if (editorRef.current) editorRef.current.innerHTML = markdownToHtml(document.markdown);
    });
  };

  const closeDocument = (id: string) => {
    const closingDocument = documents.find((document) => document.id === id);
    if (!closingDocument) return;
    if (!closingDocument.saved && !window.confirm(`Close ${closingDocument.filename} without saving?`)) return;

    if (documents.length === 1) {
      const replacement: EditorDocument = { id: createDocumentId(), filename: "untitled.md", markdown: "", saved: false };
      setDocuments([replacement]);
      setActiveId(replacement.id);
      if (editorRef.current) editorRef.current.innerHTML = "";
      return;
    }

    const closingIndex = documents.findIndex((document) => document.id === id);
    const remaining = documents.filter((document) => document.id !== id);
    setDocuments(remaining);
    if (id === activeId) {
      const nextDocument = remaining[Math.min(closingIndex, remaining.length - 1)];
      setActiveId(nextDocument.id);
      window.requestAnimationFrame(() => {
        if (editorRef.current) editorRef.current.innerHTML = markdownToHtml(nextDocument.markdown);
      });
    }
  };

  const reorderDocuments = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setDocuments((current) => {
      const sourceIndex = current.findIndex((document) => document.id === sourceId);
      const targetIndex = current.findIndex((document) => document.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;

      const reordered = [...current];
      const [movedDocument] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, movedDocument);
      return reordered;
    });
    setDraggedDocumentId(null);
    setDragOverDocumentId(null);
  };

  const finishDocumentDrag = () => {
    setDraggedDocumentId(null);
    setDragOverDocumentId(null);
  };

  const addOpenedDocuments = (openedDocuments: EditorDocument[]) => {
    if (!openedDocuments.length) return;
    const selectedDocument = openedDocuments[openedDocuments.length - 1];
    setDocuments((current) => [...current, ...openedDocuments]);
    setActiveId(selectedDocument.id);
    if (editorRef.current) editorRef.current.innerHTML = markdownToHtml(selectedDocument.markdown);
    setMode("write");
    setOutlineFilter("");
  };

  const openFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const openedDocuments = await Promise.all(files.map(async (file): Promise<EditorDocument> => ({
      id: createDocumentId(),
      filename: normalizeMarkdownFilename(file.name),
      markdown: await file.text(),
      saved: true,
    })));
    addOpenedDocuments(openedDocuments);
    event.target.value = "";
  };

  const openFiles = async () => {
    const pickerWindow = window as FilePickerWindow;
    if (!window.isSecureContext || !pickerWindow.showOpenFilePicker) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const handles = await pickerWindow.showOpenFilePicker({ multiple: true, types: markdownFileTypes });
      const openedDocuments = await Promise.all(handles.map(async (fileHandle): Promise<EditorDocument> => {
        const file = await fileHandle.getFile();
        return {
          id: createDocumentId(),
          filename: normalizeMarkdownFilename(file.name),
          markdown: await file.text(),
          saved: true,
          fileHandle,
        };
      }));
      addOpenedDocuments(openedDocuments);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("DraftMD could not open the native file picker.", error);
      fileInputRef.current?.click();
    }
  };

  const downloadFile = useCallback((content: string, downloadName: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = normalizeMarkdownFilename(downloadName);
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const saveFileAs = useCallback(async (content?: string) => {
    const latest = content ?? (mode === "write" ? syncFromWrite() : markdown);
    const documentId = activeDocument.id;
    const pickerWindow = window as FilePickerWindow;

    if (window.isSecureContext && pickerWindow.showSaveFilePicker) {
      try {
        const fileHandle = await pickerWindow.showSaveFilePicker({ suggestedName: normalizeMarkdownFilename(filename), types: markdownFileTypes });
        if (await writeFileHandle(fileHandle, latest)) {
          setDocuments((current) => current.map((item) => item.id === documentId ? {
            ...item,
            filename: normalizeMarkdownFilename(fileHandle.name),
            markdown: latest,
            saved: true,
            fileHandle,
          } : item));
        }
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("DraftMD could not save through the native file picker.", error);
      }
    }

    downloadFile(latest, filename);
    setDocuments((current) => current.map((item) => item.id === documentId ? { ...item, markdown: latest, saved: true } : item));
  }, [activeDocument.id, downloadFile, filename, markdown, mode, syncFromWrite]);

  const saveFile = useCallback(async () => {
    const latest = mode === "write" ? syncFromWrite() : markdown;
    const documentId = activeDocument.id;
    if (!activeDocument.fileHandle) {
      await saveFileAs(latest);
      return;
    }

    try {
      if (await writeFileHandle(activeDocument.fileHandle, latest)) {
        setDocuments((current) => current.map((item) => item.id === documentId ? { ...item, markdown: latest, saved: true } : item));
        return;
      }
    } catch (error) {
      console.error("DraftMD could not update the original file.", error);
    }

    await saveFileAs(latest);
  }, [activeDocument.fileHandle, activeDocument.id, markdown, mode, saveFileAs, syncFromWrite]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      const isSaveKey = event.code === "KeyS" || event.key.toLowerCase() === "s";
      if (!(event.ctrlKey || event.metaKey) || !isSaveKey) return;
      event.preventDefault();
      if (!event.repeat) void saveFile();
    };

    window.addEventListener("keydown", handleSaveShortcut, true);
    return () => window.removeEventListener("keydown", handleSaveShortcut, true);
  }, [saveFile]);

  const switchMode = (nextMode: ViewMode) => {
    if (mode === "raw" && editorRef.current) editorRef.current.innerHTML = markdownToHtml(markdown);
    setMode(nextMode);
  };

  const updateRaw = (value: string) => {
    updateActiveDocument({ markdown: value, saved: false });
  };

  const jumpToHeading = (heading: OutlineHeading) => {
    if (mode === "raw" && editorRef.current) {
      editorRef.current.innerHTML = markdownToHtml(markdown);
      setMode("preview");
    }
    window.requestAnimationFrame(() => {
      const target = document.querySelector(`.paper-wrap #${CSS.escape(heading.id)}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const deferredMarkdown = useDeferredValue(markdown);
  const previewHtml = useMemo(() => isClient ? markdownToHtml(deferredMarkdown) : "", [deferredMarkdown, isClient]);
  const wordCount = useMemo(() => markdown.trim() ? markdown.trim().split(/\s+/).length : 0, [markdown]);
  const outline = useMemo(() => extractOutline(deferredMarkdown), [deferredMarkdown]);
  const filteredOutline = outline.filter((heading) => heading.text.toLowerCase().includes(outlineFilter.toLowerCase()));

  return (
    <main className={dark ? "app dark" : "app"}>
      <header className="topbar">
        <div className="brand" aria-label="DraftMD home"><span className="brand-mark">MD</span><span className="brand-copy"><strong>DraftMD</strong><small>Visual Markdown Editor</small></span></div>
        <div className="file-title">
          <input aria-label="File name" value={filename} onChange={(event) => updateActiveDocument({ filename: event.target.value, saved: false })} />
          <span className={saved ? "status saved" : "status"}>{saved ? "Saved" : "Unsaved"}</span>
        </div>
        <div className="header-actions">
          <input ref={fileInputRef} type="file" accept=".md,.markdown,text/markdown,text/plain" multiple hidden onChange={openFileInput} />
          <button className="text-button" onClick={openFiles}><Icon name="folder" /> Open</button>
          <button className="text-button" onClick={() => saveFileAs()}><Icon name="file" /> Save As</button>
          <button className="primary-button" onClick={saveFile}><Icon name="save" /> Save</button>
          <button className="icon-button" aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={() => setDark(!dark)}><Icon name={dark ? "sun" : "moon"} /></button>
        </div>
      </header>

      <section className="workspace">
        <div className="file-tabs-bar">
          <div className="file-tabs" role="tablist" aria-label="Open documents">
            {documents.map((document) => (
              <div
                className={`file-tab ${document.id === activeId ? "active" : ""} ${document.id === draggedDocumentId ? "dragging" : ""} ${document.id === dragOverDocumentId ? "drag-over" : ""}`}
                draggable
                key={document.id}
                title="Drag to reorder"
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", document.id);
                  setDraggedDocumentId(document.id);
                }}
                onDragOver={(event) => {
                  if (draggedDocumentId === document.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (draggedDocumentId) setDragOverDocumentId(document.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = draggedDocumentId || event.dataTransfer.getData("text/plain");
                  if (sourceId) reorderDocuments(sourceId, document.id);
                }}
                onDragEnd={finishDocumentDrag}
              >
                <button className="file-tab-select" role="tab" aria-selected={document.id === activeId} onClick={() => activateDocument(document.id)}>
                  <Icon name="file" /><span>{document.filename}</span>{!document.saved && <i aria-label="Unsaved changes" />}
                </button>
                <button className="file-tab-close" aria-label={`Close ${document.filename}`} onClick={() => closeDocument(document.id)}>×</button>
              </div>
            ))}
          </div>
          <button className="new-document-button" onClick={createDocument} title="New document" aria-label="New document">+</button>
        </div>
        <div className="formatbar" role="toolbar" aria-label="Formatting toolbar" onMouseDown={preserveToolbarSelection}>
          <div className="format-group heading-group">
            <button className={activeFormats.block === "p" ? "is-active" : ""} aria-pressed={activeFormats.block === "p"} onClick={() => formatBlock("p")} title="Paragraph">P</button>
            {[1, 2, 3, 4, 5, 6].map((level) => <button key={level} className={activeFormats.block === `h${level}` ? "is-active" : ""} aria-pressed={activeFormats.block === `h${level}`} onClick={() => formatBlock(`h${level}`)} title={`Heading ${level}`}>H{level}</button>)}
          </div>
          <span className="divider" />
          <div className="format-group">
            <button className={`format-bold ${activeFormats.bold ? "is-active" : ""}`} aria-pressed={activeFormats.bold} onClick={() => format("bold")} title="Bold">B</button>
            <button className={`format-italic ${activeFormats.italic ? "is-active" : ""}`} aria-pressed={activeFormats.italic} onClick={() => format("italic")} title="Italic">I</button>
            <button className={`format-strike ${activeFormats.strike ? "is-active" : ""}`} aria-pressed={activeFormats.strike} onClick={() => format("strikeThrough")} title="Strikethrough">S</button>
            <button className={`format-code ${activeFormats.code ? "is-active" : ""}`} aria-pressed={activeFormats.code} onClick={toggleInlineCode} title="Inline code">&lt;/&gt;</button>
          </div>
          <span className="divider" />
          <div className="format-group">
            <button className={activeFormats.unorderedList ? "is-active" : ""} aria-pressed={activeFormats.unorderedList} onClick={() => format("insertUnorderedList")} title="Bullet list">• List</button>
            <button className={activeFormats.orderedList ? "is-active" : ""} aria-pressed={activeFormats.orderedList} onClick={() => format("insertOrderedList")} title="Numbered list">1. List</button>
            <button className={activeFormats.taskList ? "is-active" : ""} aria-pressed={activeFormats.taskList} onClick={addTaskList} title="Task list">☑ Tasks</button>
            <button className={activeFormats.quote ? "is-active" : ""} aria-pressed={activeFormats.quote} onClick={() => formatBlock("blockquote")} title="Quote">❝</button>
            <button className={activeFormats.link ? "is-active" : ""} aria-pressed={activeFormats.link} onClick={() => openInsertDialog("link")} title="Link">Link</button>
            <button onClick={() => openInsertDialog("image")} title="Image">Image</button>
            <button className={activeFormats.table ? "is-active" : ""} aria-pressed={activeFormats.table} onClick={openTableDialog} title="Table">Table</button>
            <button onClick={() => insertHtml("<hr><p><br></p>")} title="Horizontal rule">Rule</button>
            <button className={`wide-button ${activeFormats.codeBlock ? "is-active" : ""}`} aria-pressed={activeFormats.codeBlock} onClick={addCodeBlock} title="Code block">Code Block</button>
          </div>
        </div>

        <div className="document-shell">
          <div className="document-tabs" role="tablist" aria-label="Document mode">
            <button role="tab" aria-selected={mode === "write"} className={mode === "write" ? "active" : ""} onClick={() => switchMode("write")}><Icon name="edit" /> Write</button>
            <button role="tab" aria-selected={mode === "raw"} className={mode === "raw" ? "active" : ""} onClick={() => switchMode("raw")}><Icon name="code" /> Raw Markdown</button>
            <button role="tab" aria-selected={mode === "preview"} className={mode === "preview" ? "active" : ""} onClick={() => switchMode("preview")}><Icon name="eye" /> Preview</button>
            <span className="mode-label">{mode === "write" ? "Visual editor" : mode === "raw" ? "Markdown source" : "Rendered output"}</span>
            {!outlineOpen && <button className="outline-toggle" onClick={() => setOutlineOpen(true)}>Outline</button>}
          </div>

          <div className={`editor-layout ${outlineOpen ? "has-outline" : ""}`}>
            {outlineOpen && (
              <aside className="outline-panel" aria-label="Document outline">
                <div className="outline-header"><strong>Outline</strong><button aria-label="Close outline" onClick={() => setOutlineOpen(false)}>×</button></div>
                <label className="outline-search"><span aria-hidden="true">☰</span><input value={outlineFilter} onChange={(event) => setOutlineFilter(event.target.value)} placeholder="Filter headings" aria-label="Filter headings" /></label>
                <nav className="outline-list" aria-label="Document headings">
                  {filteredOutline.length ? filteredOutline.map((heading) => (
                    <button key={`${heading.id}-${heading.depth}`} style={{ "--heading-indent": `${(heading.depth - 1) * 14}px` } as React.CSSProperties} onClick={() => jumpToHeading(heading)}>{heading.text}</button>
                  )) : <p>No headings found</p>}
                </nav>
              </aside>
            )}
            <div className="paper-wrap">
              <div ref={editorRef} className={`editor markdown-body ${mode === "write" ? "" : "is-hidden"}`} contentEditable suppressContentEditableWarning spellCheck role="textbox" aria-label="Visual Markdown editor" aria-multiline="true" tabIndex={0} onInput={syncFromWrite} onPaste={handlePaste} onClick={handleEditorClick} onKeyDown={handleEditorKeyDown} onKeyUp={updateFormattingState} onMouseUp={updateFormattingState} />
              <textarea className={`raw-editor ${mode === "raw" ? "" : "is-hidden"}`} value={markdown} onChange={(event) => updateRaw(event.target.value)} spellCheck={false} aria-label="Raw Markdown source" />
              <article className={`preview markdown-body ${mode === "preview" ? "" : "is-hidden"}`} dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>
      </section>

      {insertDialog && (
        <div className="modal-backdrop">
          <section className="insert-dialog" role="dialog" aria-modal="true" aria-labelledby="insert-dialog-title">
            <form onSubmit={submitInsertDialog}>
              <div className="insert-dialog-header">
                <h2 id="insert-dialog-title">{insertDialog.editing ? "Edit image" : `Insert ${insertDialog.kind === "link" ? "link" : "image"}`}</h2>
                <button type="button" aria-label="Close" onClick={closeInsertDialog}>×</button>
              </div>
              <label>
                <span>URL</span>
                <input value={insertDialog.url} onChange={(event) => setInsertDialog({ ...insertDialog, url: event.target.value, fileName: undefined, error: "" })} placeholder="https://example.com" inputMode="url" />
              </label>
              {insertDialog.kind === "image" && (
                <>
                  <div className="insert-divider"><span>or</span></div>
                  <label className="local-image-picker">
                    <span>Choose image from device</span>
                    <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={chooseLocalImage} />
                  </label>
                  {insertDialog.fileName && (
                    <div className="selected-image">
                      {/* A data URL preview is intentionally rendered without remote optimization. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={insertDialog.url} alt="Selected preview" />
                      <span><strong>{insertDialog.fileName}</strong><small>Embedded in this Markdown file</small></span>
                    </div>
                  )}
                  {insertDialog.error && <p className="insert-error" role="alert">{insertDialog.error}</p>}
                </>
              )}
              <label>
                <span>{insertDialog.kind === "link" ? "Link text" : "Image description"}</span>
                <input value={insertDialog.label} onChange={(event) => setInsertDialog({ ...insertDialog, label: event.target.value })} placeholder={insertDialog.kind === "link" ? "Link label" : "Describe the image"} />
              </label>
              {insertDialog.kind === "image" && (
                <div className="dimension-section">
                  <div className="dimension-fields">
                    <label><span>Width (px)</span><input type="number" min="1" max="4000" value={insertDialog.width} onChange={(event) => setInsertDialog({ ...insertDialog, width: event.target.value })} placeholder="Auto" /></label>
                    <label><span>Height (px)</span><input type="number" min="1" max="4000" value={insertDialog.height} onChange={(event) => setInsertDialog({ ...insertDialog, height: event.target.value })} placeholder="Auto" /></label>
                  </div>
                  <small>Leave either field empty to preserve the automatic dimension.</small>
                </div>
              )}
              <div className="insert-dialog-actions">
                <button type="button" className="dialog-cancel" onClick={closeInsertDialog}>Cancel</button>
                <button type="submit" className="dialog-submit">{insertDialog.editing ? "Update image" : `Insert ${insertDialog.kind}`}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {tableDialog && (
        <div className="modal-backdrop">
          <section className="insert-dialog" role="dialog" aria-modal="true" aria-labelledby="table-dialog-title">
            <form onSubmit={submitTableDialog}>
              <div className="insert-dialog-header">
                <h2 id="table-dialog-title">Insert table</h2>
                <button type="button" aria-label="Close" onClick={closeTableDialog}>×</button>
              </div>
              <div className="dimension-fields">
                <label><span>Rows</span><input type="number" min="1" max="20" value={tableDialog.rows} onChange={(event) => setTableDialog({ ...tableDialog, rows: event.target.value })} /></label>
                <label><span>Columns</span><input type="number" min="1" max="12" value={tableDialog.columns} onChange={(event) => setTableDialog({ ...tableDialog, columns: event.target.value })} /></label>
              </div>
              <small className="table-dialog-note">The first row is used as the table header. Maximum: 20 rows and 12 columns.</small>
              <div className="insert-dialog-actions">
                <button type="button" className="dialog-cancel" onClick={closeTableDialog}>Cancel</button>
                <button type="submit" className="dialog-submit">Insert table</button>
              </div>
            </form>
          </section>
        </div>
      )}

      <footer className="statusbar">
        <span className="copyright">© 2026 3badiii · <a href="https://github.com/3badiii" target="_blank" rel="noreferrer">GitHub: 3badiii</a></span><span>{wordCount} words</span><span>{markdown.length} characters</span><span className="markdown-label"><Icon name="file" /> GitHub Flavored Markdown</span>
      </footer>
    </main>
  );
}
