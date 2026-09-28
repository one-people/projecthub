/** @type {import('stylelint').Config} */
// Stylelint 配置 — 规则依据 docs/standards/01-ui-spec.md
// 校验入口：npm run lint:css（聚合入口 npm run standards）
// 说明：notation（modern rgb / 百分比透明度等）由 stylelint-config-standard 启用并可 --fix 自动修复。
export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["build/**", "node_modules/**"],
  rules: {
    /* Token 纪律：色值字面量只允许出现在 tokens.css（§1） */
    "color-no-hex": true,

    /* 类名遵循 block__element--modifier + .is-* 状态类（组件规范 §4）；
       允许首字母大写以兼容第三方库类名（如 TipTap 的 .ProseMirror） */
    "selector-class-pattern": [
      "^(is-)?[a-zA-Z][a-zA-Z0-9]*(-[a-zA-Z0-9]+)*(__[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*)?(--[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*)*$",
      {
        message: "类名须为 block__element--modifier（kebab-case），状态类用 .is-* 前缀（docs/standards/03 §4）",
      },
    ],

    /* 存量排版习惯：保留紧凑单行声明（.a { x: 1; y: 2; }）与
       hover/focus 的书写顺序，不做强制重排 */
    "declaration-block-single-line-max-declarations": null,
    "no-descending-specificity": null,
  },
  overrides: [
    {
      /* tokens.css 是设计 Token 单一事实来源，允许 hex（§1） */
      files: ["**/tokens.css"],
      rules: {
        "color-no-hex": null,
        "comment-empty-line-before": null,
      },
    },
  ],
};
