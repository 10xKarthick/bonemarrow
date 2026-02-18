import { Elements } from "./elements";

/**
 * Create an Elements wrapper from various input types.
 *
 * Supported inputs:
 * - CSS selector string — queried against `root` (default: document)
 * - Element — wrapped directly
 * - Elements — returned as-is (identity passthrough)
 * - NodeList — non-Element nodes are filtered out silently
 * - HTMLCollection — wrapped directly
 * - Element[] — non-Element items are filtered out with a warning
 *
 * @param root - The node to query against when `input` is a selector string.
 *               Accepts any ParentNode: Document, Element, DocumentFragment,
 *               or ShadowRoot. Defaults to `document`.
 *
 * @example
 * el(".card")                        // query document
 * el(".card", dialog)                // query within a specific element
 * el(someElement)                    // wrap a single element
 * el(someElements)                   // passthrough
 * el(document.querySelectorAll("p")) // wrap a NodeList
 */
export function el(
    input:
        | string
        | Element
        | Elements
        | NodeList
        | HTMLCollection
        | Element[],
    root?: ParentNode
): Elements {
    // Guard against non-browser environments. Other BoneMarrow modules
    // (Scope, Model, Collection) can run in Node via createRootScope().
    // el() is browser-only — it requires a live DOM.
    if (typeof document === "undefined") {
        throw new Error(
            "[el] DOM is not available in this environment. " +
            "el() requires a browser context."
        );
    }

    // Identity passthrough — if already wrapped, return as-is.
    if (input instanceof Elements) {
        return input;
    }

    // CSS selector string
    if (typeof input === "string") {
        const selector = input.trim();

        // Empty selector — return empty silently. This is correct behavior,
        // not an error. Callers building selectors dynamically may produce
        // empty strings intentionally.
        if (!selector) {
            return new Elements([]);
        }

        try {
            return new Elements(
                Array.from(
                    (root ?? document).querySelectorAll(selector)
                )
            );
        } catch (error) {
            console.error(`[el] Invalid selector: "${selector}"`, error);
            return new Elements([]);
        }
    }

    // Single Element
    if (input instanceof Element) {
        return new Elements([input]);
    }

    // NodeList — may contain non-Element nodes (text nodes, comment nodes).
    // Filter to Element nodes only, consistent with Element[] branch behavior.
    if (input instanceof NodeList) {
        const elements: Element[] = [];
        input.forEach((node) => {
            if (node instanceof Element) elements.push(node);
        });
        return new Elements(elements);
    }

    // HTMLCollection — always contains only Elements by spec, no filtering needed.
    if (input instanceof HTMLCollection) {
        return new Elements(Array.from(input));
    }

    // Plain Element array — filter non-Elements and warn.
    if (Array.isArray(input)) {
        const elements = input.filter((item): item is Element => item instanceof Element);

        if (elements.length !== input.length) {
            console.warn(
                `[el] ${input.length - elements.length} item(s) in array were not Elements and were filtered out`
            );
        }

        return new Elements(elements);
    }

    // Unrecognized input — use constructor name for meaningful diagnostics.
    // typeof always returns "object" for DOM nodes, which is not useful.
    const typeName = input != null && typeof input === "object"
        ? (input as object).constructor?.name ?? "unknown object"
        : typeof input;

    console.warn(`[el] Unrecognized input type: ${typeName}`);
    return new Elements([]);
}

/**
 * Create an Elements wrapper by parsing an HTML string.
 *
 * Uses a <template> element for safe, inert parsing — scripts are not
 * executed and the HTML is not inserted into the document.
 *
 * ⚠️ Only element nodes are returned. Top-level text nodes in the HTML
 * string are silently dropped. For example:
 *   elFromHtml('hello <strong>world</strong>')
 * returns only the <strong> element, not the "hello " text node.
 *
 * @example
 * const [card] = elFromHtml('<div class="card"><p>Hello</p></div>');
 */
export function elFromHtml(html: string): Elements {
    if (typeof document === "undefined") {
        throw new Error(
            "[elFromHtml] DOM is not available in this environment. " +
            "elFromHtml() requires a browser context."
        );
    }

    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return new Elements(Array.from(template.content.children));
}

/**
 * Type guard — check if a value is an Elements wrapper.
 *
 * @example
 * if (isElements(input)) { input.addClass("active"); }
 */
export function isElements(input: unknown): input is Elements {
    return input instanceof Elements;
}
