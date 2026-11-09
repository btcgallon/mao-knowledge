/* 把 site/ 打包成一个自包含 HTML：数据 + 样式 + 脚本全部内联
 *
 *   node _src/build_single.mjs
 *   node _src/build_single.mjs --out=毛泽东方法论.html
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const SITE = path.join(ROOT, "site");

const argv = process.argv.slice(2);
const getArg = k => {
  const a = argv.find(x => x.startsWith("--" + k + "="));
  return a ? a.slice(k.length + 3) : "";
};
const OUT = path.join(ROOT, getArg("out") || "毛泽东方法论.html");

const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const css = fs.readFileSync(path.join(SITE, "v2.css"), "utf8");
const js = fs.readFileSync(path.join(SITE, "v2.js"), "utf8");
const kb = fs.readFileSync(path.join(SITE, "kb.js"), "utf8");

if (/<\/script>/i.test(kb) || /<\/script>/i.test(js)) throw new Error("内联脚本里出现了 </script>");
if (/<\/style>/i.test(css)) throw new Error("内联样式里出现了 </style>");

// 注意：replace 的替换串里 $$ 会被当成转义，必须用函数形式
const out = html
  .replace('<link rel="stylesheet" href="v2.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="kb.js"></script>', () => `<script>\n${kb}\n</script>`)
  .replace('<script src="v2.js"></script>', () => `<script>\n${js}\n</script>`);

if (out.includes('src="kb.js"') || out.includes('href="v2.css"')) throw new Error("替换不完整");

fs.writeFileSync(OUT, out, "utf8");
console.log("写出", path.basename(OUT), (Buffer.byteLength(out) / 1048576).toFixed(2) + "MB");
