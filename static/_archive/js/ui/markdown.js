// ==========================================
// markdown.js - CHAT TEXT -> MARKDOWN RENDERING
// ==========================================
// WHAT THIS MODULE DOES:
// Converts message text (typed by humans or produced by LLMs) into
// safe DOM nodes for a pragmatic markdown subset:
//
//   BLOCKS : ```fenced code```   blank-line paragraphs
//            - bullet lists      1. numbered lists
//   INLINE : `code`   **bold**   *italic*   [text](https://link)
//
// SAFETY RULE (never break this):
// Message text NEVER touches innerHTML. Every character is placed
// with createElement + textContent, so "<script>" inside a message
// stays inert visible text. Link hrefs must start with http(s),
// otherwise the whole [text](href) stays plain text.
//
// WHO USES IT (ONE renderer everywhere messages appear):
//   ui/thread.js         -> chat bubbles
//   pages/discussions.js -> board posts (.response-body)
//   pages/history.js     -> saved rows
//
// HOW TO EXTEND:
//   inline feature  -> add ONE entry to INLINE_RULES below
//   block feature   -> add ONE branch in buildBlock()
// Each rule owns its tag and how its capture groups become a node.
//
// CHAIN POSITION:
//   pages/* -> ui/thread.js / board code -> ui/markdown.js

const INLINE_RULES = [
    { tag: "code",   re: /`([^`\n]+)`/ },
    { tag: "strong", re: /\*\*([^*\n]+)\*\*/ },
    { tag: "em",     re: /\*([^*\n]+)\*/ },
    { tag: "a",      re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/ },
];


/**
 * Render message text into a DocumentFragment ready to append.
 *
 * text -> raw message string (may contain markdown, may be empty)
 * returns DocumentFragment of <p>/<pre>/<ul>/<ol> nodes.
 */
export function renderMarkdown(text) {
    const fragment = document.createDocumentFragment();

    // Split on fences FIRST so nothing inside ```...``` is parsed as
    // markdown. Even chunks are normal text; odd chunks were fenced.
    String(text ?? "").split("```").forEach((chunk, index) => {
        if (index % 2 === 1) {
            fragment.appendChild(buildCodeBlock(chunk));
        } else {
            buildBlocks(chunk).forEach((node) => fragment.appendChild(node));
        }
    });

    return fragment;
}


// ------------------------------------------
// BLOCK LEVEL
// ------------------------------------------

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

/**
 * One blank-line-separated chunk becomes:
 *   a <ul> when EVERY line starts with - or *
 *   an <ol> when EVERY line starts with 1. / 1)
 *   otherwise a <p>
 */
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

/**
 * A paragraph keeps single newlines visible the same way the old
 * renderer did: white-space: pre-line + real "\n" text nodes between
 * the lines' inline content.
 */
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


// ------------------------------------------
// INLINE LEVEL
// ------------------------------------------

/**
 * Walk one line left-to-right; at each position let the rule with
 * the earliest match win (longest match breaks ties so **bold**
 * beats *italic* at the same spot). Everything before the match is
 * plain text; then the styled node; then recurse on the rest.
 */
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
            (match.index === best.match.index &&
                match[0].length > best.match[0].length);

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
        target.appendChild(
            document.createTextNode(line.slice(0, match.index))
        );
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
