// ==========================================
// ui/markdown.js - CHAT TEXT -> SAFE MARKDOWN DOM
// ==========================================
// Converts message text (typed by humans or produced by LLMs) into
// safe DOM nodes for a pragmatic markdown subset:
//
//   BLOCKS : ```fenced code```   blank-line paragraphs
//            - bullet lists      1. numbered lists
//   INLINE : `code`   **bold**   *italic*   [text](https://link)
//
// SAFETY RULE (never break this): message text NEVER touches
// innerHTML. Every character is placed with createElement +
// textContent so "<script>" stays inert. Link hrefs must start
// with http(s).

const INLINE_RULES = [
    { tag: "code",   re: /`([^`\n]+)`/ },
    { tag: "strong", re: /\*\*([^*\n]+)\*\*/ },
    { tag: "em",     re: /\*([^*\n]+)\*/ },
    { tag: "a",      re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/ },
];

/**
 * Render message text into a DocumentFragment ready to append.
 */
export function renderMarkdown(text) {
    const fragment = document.createDocumentFragment();

    String(text ?? "").split("```").forEach((chunk, index) => {
        if (index % 2 === 1) {
            fragment.appendChild(buildCodeBlock(chunk));
        } else {
            buildBlocks(chunk).forEach((node) => fragment.appendChild(node));
        }
    });

    return fragment;
}

/** Fenced code: drop an optional language tag on the first line. */
function buildCodeBlock(chunk) {
    const codeText = chunk.replace(/^[a-zA-Z0-9_+-]*\n/, "");
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = codeText.trim();
    pre.appendChild(code);
    return pre;
}

/** Split plain text into paragraph/list blocks on blank lines. */
function buildBlocks(text) {
    const nodes = [];

    String(text)
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((block) => nodes.push(buildBlock(block)));

    return nodes;
}

/** One blank-line-separated chunk becomes a <ul>, <ol> or <p>. */
function buildBlock(block) {
    const lines = block.split("\n");

    if (lines.length > 0 && lines.every((l) => /^\s*[-*]\s+\S/.test(l))) {
        return buildList(lines, "ul", (l) => l.replace(/^\s*[-*]\s+/, ""));
    }

    if (lines.length > 0 && lines.every((l) => /^\s*\d+[.)]\s+\S/.test(l))) {
        return buildList(lines, "ol", (l) => l.replace(/^\s*\d+[.)]\s+/, ""));
    }

    return buildParagraph(lines);
}

function buildList(lines, tag, stripMarker) {
    const list = document.createElement(tag);
    lines.forEach((line) => {
        const item = document.createElement("li");
        renderInline(stripMarker(line), item);
        list.appendChild(item);
    });
    return list;
}

function buildParagraph(lines) {
    const p = document.createElement("p");
    p.style.whiteSpace = "pre-line";
    lines.forEach((line, index) => {
        if (index > 0) {
            p.appendChild(document.createTextNode("\n"));
        }
        renderInline(line, p);
    });
    return p;
}

/** Walk a line left-to-right; earliest/longest match wins. */
function renderInline(line, target) {
    let best = null;

    INLINE_RULES.forEach((rule) => {
        const match = rule.re.exec(line);
        if (!match) {
            return;
        }
        const better =
            best === null ||
            match.index < best.match.index ||
            (match.index === best.match.index && match[0].length > best.match[0].length);
        if (better) {
            best = { rule, match };
        }
    });

    if (!best) {
        target.appendChild(document.createTextNode(line));
        return;
    }

    const { rule, match } = best;
    const [raw, ...groups] = match;

    if (match.index > 0) {
        target.appendChild(document.createTextNode(line.slice(0, match.index)));
    }

    target.appendChild(buildInlineNode(rule.tag, groups));
    renderInline(line.slice(match.index + raw.length), target);
}

/** Build the styled node for one matched inline feature. */
function buildInlineNode(tag, groups) {
    if (tag === "a") {
        const link = document.createElement("a");
        link.href = groups[1];
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = groups[0];
        return link;
    }

    const node = document.createElement(tag);
    node.textContent = groups[0];
    return node;
}
