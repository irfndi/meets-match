import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "brave-knight", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
