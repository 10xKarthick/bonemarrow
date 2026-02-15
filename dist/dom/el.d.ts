import { Elements } from "./elements";
/**
 * Create an Elements wrapper from various input types.
 * Similar to jQuery’s $() but returns a lightweight Elements wrapper.
 */
export declare function el(input: string | Element | NodeList | HTMLCollectionOf<Element> | Element[], root?: ParentNode): Elements;
/**
 * Create an Elements wrapper from an HTML string.
 */
export declare function elFromHtml(html: string): Elements;
/**
 * Check if a value is an Elements wrapper.
 */
export declare function isElements(input: unknown): input is Elements;
