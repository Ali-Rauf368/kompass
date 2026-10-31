import "@testing-library/jest-dom";

// jsdom has no layout engine; components that measure (Recharts) or query media don't need real values in tests.
Object.defineProperty(window, "matchMedia", {
  value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
});

// jsdom lacks the WHATWG encoding API that react-router uses.
import { TextDecoder, TextEncoder } from "node:util";
Object.assign(globalThis, { TextEncoder, TextDecoder });
