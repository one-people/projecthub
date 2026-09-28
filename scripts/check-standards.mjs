#!/usr/bin/env node
// ProjectHub 项目级规范校验 — 规则来源 docs/standards/*.md
// 用法：npm run check:standards（聚合入口 npm run standards）
// 覆盖 ESLint / Stylelint 不便表达的结构性规则；全部通过输出 OK 并退出 0。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const APP = join(ROOT, "app");

/** 递归收集目录下匹配后缀的文件（排除无需校验的目录） */
function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "build") continue;
      walk(full, exts, out);
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f) => relative(ROOT, f).split(sep).join("/");
const read = (f) => readFileSync(f, "utf8");

const violations = [];
const add = (rule, file, line, msg) =>
  violations.push(`  [${rule}] ${file}${line ? `:${line}` : ""} — ${msg}`);

// ---------------------------------------------------------------
// R1 Token 单一来源（01-ui-spec §1）：全局设计 Token 只允许在 tokens.css 定义
// ---------------------------------------------------------------
{
  const TOKEN_NAMES =
    /^(--color-[a-z0-9-]+|--space-[1-6]|--radius-(sm|md|lg|full)|--shadow-(sm|md|lg)|--font-[a-z-]+|--motion-[a-z-]+|--transition)\s*:/;
  for (const f of walk(join(APP, "styles"), [".css"])) {
    if (f.endsWith("tokens.css")) continue;
    read(f)
      .split("\n")
      .forEach((l, i) => {
        const m = l.trim().match(TOKEN_NAMES);
        if (m) add("R1-token-source", rel(f), i + 1, `全局 Token ${m[1]} 只能定义在 tokens.css`);
      });
  }
}

// ---------------------------------------------------------------
// R2 色值纪律（01-ui-spec §1/§6）：样式与 TSX 中禁止 hex 色值
// ---------------------------------------------------------------
{
  const HEX = /#[0-9a-fA-F]{3,8}\b/;
  for (const f of walk(APP, [".css"])) {
    if (f.endsWith("tokens.css")) continue;
    read(f)
      .split("\n")
      .forEach((l, i) => {
        if (HEX.test(l)) add("R2-no-hex", rel(f), i + 1, "禁止硬编码色值，请使用 tokens.css 中的语义 Token");
      });
  }
  for (const f of walk(APP, [".tsx"])) {
    read(f)
      .split("\n")
      .forEach((l, i) => {
        if (HEX.test(l)) add("R2-no-hex", rel(f), i + 1, "TSX 中禁止 hex 色值；动态色请走数据调色板，主题色走 CSS 类");
      });
  }
}

// ---------------------------------------------------------------
// R3 !important 白名单（01-ui-spec / 交互规范 §7）：仅 prefers-reduced-motion 内允许
// ---------------------------------------------------------------
{
  for (const f of walk(join(APP, "styles"), [".css"])) {
    const lines = read(f).split("\n");
    let depth = 0;
    let inReducedMotion = false;
    const rmStack = [];
    lines.forEach((l, i) => {
      if (l.includes("@media (prefers-reduced-motion")) {
        rmStack.push(true);
        inReducedMotion = true;
      } else if (l.includes("{")) {
        rmStack.push(false);
      }
      if (l.includes("!important") && !inReducedMotion) {
        add("R3-important", rel(f), i + 1, "!important 仅允许用于 prefers-reduced-motion 降级");
      }
      for (const ch of l) {
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (rmStack.length && depth <= rmStack.length - 1) {
            const was = rmStack.pop();
            if (was) inReducedMotion = rmStack.some(Boolean);
          }
        }
      }
    });
  }
}

// ---------------------------------------------------------------
// R4 组件命名与导出（03-component §2）：PascalCase 文件 = 具名函数导出，禁 default export
// ---------------------------------------------------------------
{
  for (const f of walk(join(APP, "components"), [".tsx"])) {
    const src = read(f);
    const name = f.split(sep).pop().replace(".tsx", "");
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
      add("R4-component-name", rel(f), 0, "组件文件须为 PascalCase");
      continue;
    }
    if (/export\s+default/.test(src)) {
      add("R4-component-name", rel(f), 0, "组件禁止 default export（Remix 路由除外）");
    }
    // 主导出具名函数：Xxx / XxxProvider / useXxx（如 Toast.tsx 导出 ToastProvider + useToast）
    const hasNamed = [name, `${name}Provider`, `use${name}`].some((n) =>
      new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b`).test(src),
    );
    if (!hasNamed) {
      add("R4-component-name", rel(f), 0, `未找到具名导出 function ${name}() / ${name}Provider()`);
    }
  }
}

// ---------------------------------------------------------------
// R5 导入路径（02-code §4）：app 内禁止 ../ 跨目录相对导入
// ---------------------------------------------------------------
{
  for (const f of walk(APP, [".ts", ".tsx"])) {
    read(f)
      .split("\n")
      .forEach((l, i) => {
        const m = l.match(/from\s+"(\.\.\/[^"]*)"/);
        if (m) add("R5-import-path", rel(f), i + 1, `跨目录相对导入 "${m[1]}"，请使用 ~/ 别名`);
      });
  }
}

// ---------------------------------------------------------------
// R6 写操作走 service（02-code §2）：路由/组件禁止直调 repository 写方法
// ---------------------------------------------------------------
{
  const WRITE_RE = /\b\w*[Rr]epository\.(create|update|remove|delete|put|bulk\w*|archive|restore|purge)\s*\(/;
  for (const f of [...walk(join(APP, "routes"), [".ts", ".tsx"]), ...walk(join(APP, "components"), [".ts", ".tsx"])]) {
    read(f)
      .split("\n")
      .forEach((l, i) => {
        const m = l.match(WRITE_RE);
        if (m) add("R6-service-write", rel(f), i + 1, `写操作 ${m[1]}() 必须经 service（权限/自动化/软删除）`);
      });
  }
}

// ---------------------------------------------------------------
// R7 i18n 键同步（交互规范 §8）：zh-CN 与 en 顶层键集合一致
// ---------------------------------------------------------------
{
  const keys = (file) => {
    const set = new Set();
    read(join(APP, "locales", file))
      .split("\n")
      .forEach((l) => {
        const m = l.match(/^ {2}([A-Za-z0-9_]+):/);
        if (m) set.add(m[1]);
      });
    return set;
  };
  const zh = keys("zh-CN.ts");
  const en = keys("en.ts");
  for (const k of zh) if (!en.has(k)) add("R7-i18n-keys", "app/locales/en.ts", 0, `缺少 zh-CN 已有键 "${k}"`);
  for (const k of en) if (!zh.has(k)) add("R7-i18n-keys", "app/locales/zh-CN.ts", 0, `缺少 en 已有键 "${k}"`);
}

// ---------------------------------------------------------------
// R8 图标收敛（01-ui §7）：业务组件不得散落 <svg>（数据可视化白名单除外）
// ---------------------------------------------------------------
{
  const VIZ_WHITELIST = ["app/components/timeline/TimelineView.tsx", "app/components/stats/StatsView.tsx"];
  for (const f of walk(APP, [".tsx"])) {
    const r = rel(f);
    if (r === "app/components/ui/Icon.tsx" || VIZ_WHITELIST.includes(r)) continue;
    read(f)
      .split("\n")
      .forEach((l, i) => {
        if (l.includes("<svg")) add("R8-icon-single-source", r, i + 1, "图标请统一登记到 ui/Icon.tsx（数据可视化需加白名单）");
      });
  }
}

// ---------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------
if (violations.length) {
  console.error(`✖ 规范校验未通过（${violations.length} 处违规）：\n`);
  console.error(violations.join("\n"));
  console.error(`\n规范文档见 docs/standards/，修复后重跑 npm run check:standards`);
  process.exit(1);
}
console.log("✔ 项目级规范校验通过（R1 Token 来源 / R2 色值 / R3 !important / R4 组件命名 / R5 导入路径 / R6 写操作 / R7 i18n / R8 图标）");
