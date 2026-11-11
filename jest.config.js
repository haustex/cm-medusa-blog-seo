module.exports = {
  transform: {
    "^.+\\.[jt]s$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
        },
      },
    ],
  },
  // ESM-only packages (htmlparser2 and friends): Node 22 can require() them, Jest's runtime cannot, so they are
  // compiled like our own files.
  transformIgnorePatterns: ["/node_modules/(?!(htmlparser2|domhandler|domutils|dom-serializer|domelementtype|entities)/)"],
  testEnvironment: "node",
  moduleFileExtensions: ["js", "ts", "json"],
  modulePathIgnorePatterns: ["<rootDir>/.medusa/"],
  testMatch: ["<rootDir>/src/**/__tests__/**/*.unit.spec.[jt]s"],
}
