import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "src/test/fixtures");
export const loadFixture = (name: string) => readFileSync(join(dir, name), "utf8");
