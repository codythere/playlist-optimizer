import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const configPath = join(root, "components.json");
const markerPath = join(root, ".shadcn-initialized");

const defaultConfig = JSON.stringify(
  {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "default",
    tailwind: {
      config: "tailwind.config.ts",
      css: "app/globals.css",
      baseColor: "slate",
      cssVariables: true
    },
    aliases: {
      components: "@/app/components",
      utils: "@/lib/utils"
    }
  },
  null,
  2
);

const ensureFile = (path, value) => {
  writeFileSync(path, value, { encoding: "utf8" });
};

if (!existsSync(configPath)) {
  ensureFile(configPath, `${defaultConfig}\n`);
  console.log("Initialized components.json for shadcn/ui");
}

if (!existsSync(markerPath)) {
  ensureFile(markerPath, "initialized\n");
}