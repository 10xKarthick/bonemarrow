import { Elements } from "./elements";

export function el(
    input: string | Element | NodeListOf<Element> | Element[],
    root?: ParentNode
): Elements {
    if (typeof input === "string") {
        return new Elements(
            Array.from((root ?? document).querySelectorAll(input))
        );
    }

    if (input instanceof Element) {
        return new Elements([input]);
    }

    if (input instanceof NodeList) {
        return new Elements(Array.from(input));
    }

    return new Elements(input);
}
