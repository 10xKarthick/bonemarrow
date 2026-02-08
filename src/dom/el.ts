import { Elements } from "./elements";

/**
 * Create an Elements wrapper from various input types.
 * Similar to jQuery’s $() but returns a lightweight Elements wrapper.
 */
export function el(
    input:
        | string
        | Element
        | NodeList
        | HTMLCollectionOf<Element>
        | Element[],
    root?: ParentNode
): Elements {
    // Handle CSS selector strings
    if (typeof input === "string") {
        const selector = input.trim();
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
            console.error(
                `[el] Invalid selector: "${selector}"`,
                error
            );
            return new Elements([]);
        }
    }

    // Handle single Element
    if (input instanceof Element) {
        return new Elements([input]);
    }

    // Handle NodeList
    if (input instanceof NodeList) {
        return new Elements(
            Array.from(input as NodeListOf<Element>)
        );
    }

    // Handle HTMLCollection
    if (input instanceof HTMLCollection) {
        return new Elements(Array.from(input));
    }

    // Handle plain arrays
    if (Array.isArray(input)) {
        const elements = input.filter(
            item => item instanceof Element
        );

        if (elements.length !== input.length) {
            console.warn(
                "[el] Some items in array were not Elements and were filtered out"
            );
        }

        return new Elements(elements);
    }

    // Fallback
    console.warn(
        "[el] Unrecognized input type:",
        typeof input
    );
    return new Elements([]);
}

/**
 * Create an Elements wrapper from an HTML string.
 */
export function elFromHtml(html: string): Elements {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return new Elements(
        Array.from(template.content.children)
    );
}

/**
 * Check if a value is an Elements wrapper.
 */
export function isElements(input: unknown): input is Elements {
    return input instanceof Elements;
}
