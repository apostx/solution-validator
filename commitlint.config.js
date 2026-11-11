/** @type {import("@commitlint/types").UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  // Merge commits are not conventional commits; release-please skips them as well.
  ignores: [(message) => message.startsWith("Merge ")],
};
