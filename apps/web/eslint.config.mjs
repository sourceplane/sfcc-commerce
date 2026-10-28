// Upstream ships no ESLint config (its `test` is a prettier check); the port
// lints with the workspace's shared config, as the commerce baseline does.
// The template's server actions swallow errors with `catch (e)` and answer a
// message instead, and their signatures (and the inputs' props) name
// parameters useActionState and the form pass but the body does not read;
// both are kept as written.
import config from "../../tooling/eslint/index.js";

export default [
  ...config,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "none", caughtErrors: "none" },
      ],
    },
  },
];
