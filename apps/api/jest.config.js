/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  transform: { "^.+\\.(t|j)sx?$": ["@swc/jest", { jsc: { target: "es2023" }, module: { type: "commonjs" } }] },
  // ldapts and its dependencies ship ES modules only; let SWC compile them for Jest.
  transformIgnorePatterns: ["/node_modules/(?!(ldapts|strict-event-emitter-types|asn1-ber|debug|whatwg-url)/)"],
  // The generated Prisma client imports "./x.js" from TypeScript sources.
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  globalSetup: process.env.NO_SETUP ? undefined : "<rootDir>/test/global-setup.ts",
  globalTeardown: process.env.NO_SETUP ? undefined : "<rootDir>/test/global-teardown.ts",
  setupFiles: process.env.NO_SETUP ? [] : ["<rootDir>/test/setup-env.ts"],
  testTimeout: 30000,
  collectCoverageFrom: ["src/**/*.ts", "!src/generated/**", "!src/scripts/**", "!src/index.ts"],
};
