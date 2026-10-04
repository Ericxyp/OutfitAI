/**
 * E2E 辅助：用 esbuild 打包测试页面入口，并把 "use server" 模块替换为 window.__serverActions 中的 mock，
 * next/link、next/navigation 替换为最小实现。返回本地静态服务器地址。
 */
import { build } from "esbuild";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, "../..");

export async function serveHarness(entryFile) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "outfitai-e2e-"));
  await build({
    entryPoints: [path.join(here, entryFile)],
    bundle: true,
    outfile: path.join(outDir, "out.js"),
    format: "esm",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    nodePaths: [path.join(root, "node_modules")],
    logLevel: "warning",
    plugins: [
      {
        name: "outfitai-stubs",
        setup(b) {
          b.onResolve({ filter: /^next\/(link|navigation)$/ }, () => ({ path: "next-shim", namespace: "shim" }));
          b.onLoad({ filter: /.*/, namespace: "shim" }, () => ({
            loader: "tsx",
            resolveDir: root,
            contents: `
              export default function Link({ href, children, ...rest }) { return <a href={href} {...rest}>{children}</a>; }
              export function usePathname() { return "/"; }
              export function useRouter() { return { push() {}, refresh() {}, replace() {} }; }
              export function useSearchParams() { return new URLSearchParams(); }
              export function redirect() {}
              export function notFound() {}`,
          }));
          b.onResolve({ filter: /^@\// }, (args) => b.resolve("./" + args.path.slice(2), { resolveDir: root, kind: args.kind }));
          b.onLoad({ filter: /[\\/](lib|app)[\\/]actions[\\/][^\\/]+\.ts$/ }, (args) => {
            const source = fs.readFileSync(args.path, "utf8");
            if (!/^\s*["']use server["']/.test(source)) return undefined;
            const rel = path.relative(root, args.path).split(path.sep).join("/");
            const names = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
            return {
              loader: "js",
              contents: names
                .map((name) => `export const ${name} = (...a) => { const m = window.__serverActions?.[${JSON.stringify(rel)}]?.${name}; return m ? m(...a) : Promise.resolve(undefined); };`)
                .join("\n"),
            };
          });
        },
      },
    ],
  });
  fs.writeFileSync(
    path.join(outDir, "index.html"),
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="root"></div><script type="module" src="out.js"></script></body></html>'
  );
  const server = http
    .createServer((req, res) => {
      const file = req.url === "/" ? "index.html" : req.url.slice(1).split("?")[0];
      try {
        res.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : "text/html");
        res.end(fs.readFileSync(path.join(outDir, file)));
      } catch {
        res.statusCode = 404;
        res.end();
      }
    })
    .listen(0);
  return {
    url: `http://localhost:${server.address().port}/`,
    close: () => {
      server.close();
      fs.rmSync(outDir, { recursive: true, force: true });
    },
  };
}
