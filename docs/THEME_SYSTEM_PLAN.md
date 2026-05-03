# 主题系统改造计划 (v2)

> 与 [`THEME_ARCHITECTURE.md`](./THEME_ARCHITECTURE.md) 配套。
> 本文回答"做什么、按什么顺序、要多久"；架构文档回答"代码怎么分层、技术栈如何收口"。
>
> **状态**：计划阶段，落地时建议拆为独立 OpenSpec change。

---

## 1. 实测数据基线

| 维度 | 数量 | 备注 |
|---|---|---|
| inline `style={{}}` 用法 | **492 处 / 80 文件** | 必须迁移 |
| - 含 hex 字面量的 inline | 72 处 | 必改 |
| - 含动态表达式的 inline | 28 处 | 用 CSS 变量桥接 |
| 普通 `*.css` 文件 | 12 个 | 全部 → `.scss` |
| `*.module.css` 文件 | 10 个 | 全部 → `.module.scss` |
| SCSS 文件 | 13 个（仅灵绘） | 保留 |
| Tailwind 含 hex 的 arbitrary value `[#xxx]` | 35 处 | 必改 |
| 业务文件硬编码 hex 命中 | 889 行 | 目标降到 <50 |
| 重灾区 Top 5 | CharacterDetailModal(28) / VisualStyleManager(23) / PropDetailModal(20) / SimpleExportDialog(18) / ProjectSettingsModal(17) | |

---

## 2. 设计目标 & 验收

详见 `THEME_ARCHITECTURE.md` §2 (G1-G7) 和 §12 验收清单。**关键：技术栈只允许 SCSS + Tailwind，inline style 仅放行 CSS 变量桥接**。

---

## 3. Phase 拆分（按"可独立交付"切分）

每个 Phase 都是可发布的小步快走，避免一次合 800 行难审查。

### Phase 0：准备（0.5 d）

- [ ] 在 OpenSpec 起一个 change，复用本计划目标 / 验收
- [ ] 拉关键页面截图基线：分镜 / 灵绘 / 设置 / 编辑器 / 聊天 / 资产 / Modal（用作回归对照）
- [ ] 量化 inline style / hex / 普通 CSS 文件清单（生成 `findings.md` 子表）

### Phase 1：Token 分层 + ThemeProvider 骨架（1.5 d）

按架构 §10 目录建文件：

- [ ] `theme/types.ts`（`SemanticTokens` / `Theme` / `ThemeId`）
- [ ] `theme/palettes/`（`zinc.ts` / `slate.ts` / `blue.ts` / `emerald.ts` / `amber.ts`）
- [ ] `theme/themes/dark-emerald.ts`（把现 `tokens.ts` 值原样搬入）
- [ ] `theme/compile/themeToCssVars.ts` + `themeToAntdConfig.ts` + `varNames.ts`（含单测）
- [ ] `theme/runtime/ThemeProvider.tsx` + `useTheme.ts` + `useThemeValue.ts`
- [ ] `index.tsx` 把 `<ConfigProvider>` 包到 `<ThemeProvider>` 内
- [ ] `theme/tokens.ts` 改为 re-export 默认主题，标 `@deprecated`

**验收**：未实现切换 UI，应用视觉与改造前 100% 一致。

### Phase 2：Tailwind 转发层 + index.css 收口（0.5 d）

- [ ] `index.css` 顶部 `@theme {...}` 块的 hex 全部改为 `var(--token-*)` 转发
- [ ] `:root` 写入默认主题 token 完整快照（SSR / 首屏闪屏兜底）
- [ ] 删除现有 `--bg-base` / `--text-primary` 等别名层，统一到 `--token-*`
- [ ] 全局 grep 业务 SCSS / 普通 CSS 里的 `var(--color-*)` / `var(--bg-*)` → 替换为 `var(--token-*)`

**验收**：Tailwind 工具类如 `bg-bg-app` 仍生效；非 `--token-*` 的 CSS 变量引用 = 0。

### Phase 3：持久化 + 切换 UI（0.5 d）

- [ ] `globalStore` 加 `themeId` 字段
- [ ] `theme/runtime/persistence.ts`（globalStore 优先 + localStorage 兜底）
- [ ] 设置页加"外观"分组：列预设主题卡片，点击即切
- [ ] 主题切换不重渲染应用（only Context 触发）

**验收**：刷新 / 重启保持选择；切换瞬间生效。

### Phase 4：普通 CSS → SCSS 迁移（1 d）

机械活，可批处理：

- [ ] `*.css` → `*.scss` 重命名（12 个文件）
- [ ] `*.module.css` → `*.module.scss` 重命名（10 个文件）
- [ ] 同步修改所有 `import './X.css'` / `from './X.module.css'` 引用
- [ ] 验证 Vite + sass-loader 编译通过
- [ ] 文件级别 grep：`find . -name "*.css" -not -name "*.module.scss"` → 应只剩 `index.scss`（原 index.css）
- [ ] 各 SCSS 文件里的 hex / rgba 全部抽 `var(--token-*)`：
  - 找不到对应 token → 先扩 `SemanticTokens` 类型加字段，再用
  - 灵绘 `_tokens.scss` 里的 `$lh-*` 改为 `var(--token-*)` 别名引用
  - Settings 页 `index.scss` 里 ~100+ 处 `rgba(zinc-XXX, alpha)` 抽出 `--token-overlay-*` / 重新用语义层

**验收**：业务 SCSS / Tailwind `@theme` 中无 hex / rgba 字面量。

### Phase 5：inline style 全面迁移（**最重，3-4 d**）

492 处 inline，按架构 §7 四档处理。建议 **每天攻 100-150 处** + 视觉 QA，分 3-4 天完成。

#### Day 1：纯布局值 → Tailwind 工具类（约 250 处）

机械替换：
- `style={{ marginTop: 16 }}` → `className="mt-4"`
- `style={{ padding: 12, width: 320 }}` → `className="p-3 w-80"`
- `style={{ display: 'flex', gap: 8 }}` → `className="flex gap-2"`
- `style={{ fontSize: 14 }}` → `className="text-sm"`

工具：
- VSCode 正则查找 `style=\{\{[^}]+\}\}` → 人工 case-by-case
- 或写个 codemod（jscodeshift）打底，再人工审查

#### Day 2：含颜色 / 复杂样式 → SCSS module（约 100 处）

每个组件创建 `*.module.scss` 旁挂，类名按语义命名：

```tsx
// 旧
<div style={{ color: '#10b981', borderTop: '1px solid #27272a', padding: '12px 16px' }} />

// 新
import styles from './CharacterDetailModal.module.scss';
<div className={styles.divider} />
```

```scss
.divider {
  color: var(--token-accent-base);
  border-top: 1px solid var(--token-border-subtle);
  padding: calc(var(--token-space-md) * 1px) calc(var(--token-space-lg) * 1px);
}
```

重灾区按文件清：CharacterDetailModal.tsx (28) / PropDetailModal.tsx (20) / VisualStyleManager.tsx (23) / SimpleExportDialog.tsx (18) / ProjectSettingsModal.tsx (17) 这 5 个文件占总数的 22%。

#### Day 3：动态值 → CSS 变量桥接（约 28 处）

```tsx
// 旧
<div style={{ width: `${progress}%`, opacity: progress / 100 }} />

// 新
<div
  className={styles.progress}
  style={{
    '--progress': `${progress}%`,
    '--opacity': String(progress / 100),
  } as CSSProperties}
/>
```

```scss
.progress {
  width: var(--progress);
  opacity: var(--opacity);
  transition: width 200ms, opacity 200ms;
}
```

CSS 变量桥接是 inline style 的**唯一允许形式**。

#### Day 4：第三方库白名单 + Tailwind arbitrary hex 清理 + 收尾

- [ ] 列出无法移除的第三方 inline style（如 `react-virtuoso` 必传 `style={{ flex: 1 }}` 等结构性属性）→ 写入 `docs/INLINE_STYLE_EXCEPTIONS.md`
- [ ] 35 处 `bg-[#xxx]` Tailwind arbitrary hex → 改为语义类（`bg-bg-app` / `bg-accent` 等），如缺类则在 Tailwind `@theme` 加映射
- [ ] 兜底 grep 检查：`style={{` 排除 CSS 变量桥接 + 白名单 = 0

**验收**：CI 自检脚本（架构 §9.3）全过。

### Phase 6：扩主题 — `dark-business`（0.5 d）

- [ ] 新建 `themes/dark-business.ts`，主色换 Slate / 钢蓝
- [ ] 切到该主题逐页过 5 个关键页面
- [ ] 修补出现的硬编码遗漏

**验收**：能切，无视觉错位。

### Phase 7：扩主题 — `light-business`（**2 d**）

- [ ] 新建 `themes/light-business.ts`，bg 完全反转、阴影系统重算
- [ ] `themeToAntdConfig` 根据 `mode` 切 `defaultAlgorithm`
- [ ] 处理 dark-only 运行时 flag：
  - `LinghuiCanvasStage.tsx` 的 `colorMode="dark"` → `useTheme().meta.mode`
  - `Storyboard.tsx` 编辑弹窗 `darkTheme={true}` → 同上
  - 全局 grep 其它 `colorMode=` / `darkTheme=` 字面量
- [ ] 灵绘 SCSS 叠层颜色统一走 `var(--token-overlay-on-bg)`
- [ ] 阴影系统校准（亮模式偏好 1px 边 + 极淡阴影）
- [ ] 灵绘画布 `<Background />` 点阵颜色按主题反向（`useThemeValue('text', 'muted')`）
- [ ] 截图回归 5 关键页

**验收**：light 模式下文字对比度 ≥ WCAG AA，无 dark-only 残留。

### Phase 8：高对比主题（0.5 d）

- [ ] `themes/high-contrast.ts`：纯黑底 / 纯白文 / 黄色 accent / 4px 圆角 / 加粗描边
- [ ] 仅校验关键页可读

### Phase 9：CI 防腐 + 文档（1 d）

- [ ] 加 `stylelint` + `stylelint-config-standard-scss` + `stylelint-scss` 依赖
- [ ] `.stylelintrc.cjs`（架构 §9.1）
- [ ] `eslint-plugin-koma-theme-discipline`（自定义规则）：
  - `forbid-inline-style-values`（仅放行 `--` 开头 key）
  - `forbid-business-tokens-import`
  - `forbid-dark-flag-literal`
- [ ] `scripts/check-style-discipline.ts`（架构 §9.3）
- [ ] CI workflow 加上述检查
- [ ] `docs/THEME_DEVELOPMENT.md`（开发者 onboarding：怎么加新主题、新 token、迁移 inline style）
- [ ] `docs/INLINE_STYLE_EXCEPTIONS.md`（白名单）
- [ ] CHANGELOG

### Phase 10：回归（0.5 d）

- [ ] 4 套主题 × 5 关键页 = 20 张截图与基线对比
- [ ] 主题切换冒烟：每套主题随机 10 个交互点击不报错
- [ ] 灵绘画布 / 编辑器 / Settings 页深度回归

---

## 4. 时间汇总

| Phase | 内容 | 工时 |
|---|---|---|
| 0 | 准备 + 截图基线 + 文件清单 | 0.5 d |
| 1 | Token 分层 + ThemeProvider 骨架 | 1.5 d |
| 2 | Tailwind 转发层 + index.css 收口 | 0.5 d |
| 3 | 持久化 + 切换 UI | 0.5 d |
| **4** | **普通 CSS → SCSS 迁移** | **1.0 d** |
| **5** | **inline style 全面迁移（492 处）** | **3.5 d** |
| 6 | dark-business 主题 | 0.5 d |
| 7 | **light-business 主题（含 dark flag 清理）** | 2.0 d |
| 8 | high-contrast 主题 | 0.5 d |
| 9 | CI 防腐 + 文档 | 1.0 d |
| 10 | 回归 | 0.5 d |
| **合计** | | **11.5 d** |

**对比 v1（无技术栈收口）= 6 d → v2 = 11.5 d**，多出来的 5.5 d 主要花在 inline style 迁移 + CSS→SCSS 重命名 + CI 防腐。

### 拆分发布建议

| 里程碑 | 包含 Phase | 工时 | 用户感知 |
|---|---|---|---|
| **M1：暗色双主题切换** | 0-3, 6 | 3.5 d | 用户能切 dark-emerald / dark-business |
| **M2：技术栈收口** | 4-5, 9 | 5.5 d | 内部代码健康度提升，用户无感 |
| **M3：亮色 + 高对比** | 7-8, 10 | 3.0 d | 完整 4 主题 |

可按 M1 → M3 → M2 顺序发布（用户价值优先），或 M1 → M2 → M3（避免 M3 时被 M2 阻塞）。**推荐 M1 → M2 → M3**：M2 后所有主题扩展几乎零成本。

---

## 5. 文件级影响清单

### 新增文件

```
frontend/src/theme/types.ts
frontend/src/theme/palettes/{zinc,slate,blue,emerald,amber}.ts
frontend/src/theme/themes/{dark-emerald,dark-business,light-business,high-contrast}.ts
frontend/src/theme/compile/{themeToCssVars,themeToAntdConfig,varNames}.ts
frontend/src/theme/compile/*.test.ts
frontend/src/theme/runtime/{ThemeProvider,useTheme,useThemeValue,persistence,ssrFallback}.ts
frontend/src/components/settings/AppearanceSection.tsx
frontend/scripts/check-style-discipline.ts
frontend/eslint-plugin-koma-theme-discipline/   (本地 plugin)
.stylelintrc.cjs
docs/THEME_DEVELOPMENT.md
docs/INLINE_STYLE_EXCEPTIONS.md
```

### 改名（Phase 4 批量）

```
*.css         →  *.scss               (12 个)
*.module.css  →  *.module.scss        (10 个)
import './X.css'   →   import './X.scss'  (各 import 处同步)
```

### 改动文件

```
frontend/src/index.tsx                 (套 ThemeProvider)
frontend/src/index.scss (原 index.css) (rgba 抽变量、@theme 转发)
frontend/src/theme/tokens.ts           (deprecated re-export)
frontend/src/theme/antdTheme.ts        (改为 themeToAntdConfig 工厂)
frontend/src/store/globalStore.ts      (加 themeId 字段)
frontend/src/components/linghui/page/styles/_tokens.scss   (引 var(--token-*))
frontend/src/components/linghui/canvas/components/LinghuiCanvasStage.tsx  (响应式 colorMode)
frontend/src/components/storyboard/Storyboard.tsx          (响应式 darkTheme)
frontend/src/components/asset/CharacterDetailModal.tsx     (28 处 inline 迁移)
frontend/src/components/asset/PropDetailModal.tsx          (20 处)
frontend/src/components/settings/VisualStyleManager.tsx    (23 处)
frontend/src/components/editor/SimpleExportDialog.tsx      (18 处)
frontend/src/components/project/ProjectSettingsModal.tsx   (17 处)
... 75 个其它 .tsx 文件 inline 迁移
frontend/postcss.config.js                                  (无需变更，sass 由 vite 处理)
frontend/package.json                                       (加 stylelint + 自定义 plugin)
```

预估改动：**新增 18-22 文件，改名 22 文件，改动 90-100 文件，影响行数 1500-2500**。

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 492 处 inline style 迁移漏迁 | 中 | CI 自检脚本兜底，违反不能合 |
| 含 props/state 的动态 inline 转 CSS 变量逻辑出错 | 中 | 每文件单独 commit，测试时手动触发该 prop 路径 |
| Antd `darkAlgorithm ↔ defaultAlgorithm` 切换部分组件视觉跳变 | 中 | Phase 7 单独按页过；不行就 `<ConfigProvider key={themeId}>` 强制 remount |
| 灵绘画布 react-flow `colorMode` 运行时切换可能不重渲染 | 中 | 切换时给灵绘子树传 `key={themeId}` 强制 remount |
| `index.css` Settings 页大量硬编码 alpha 在亮模式下变浊 | 高 | Phase 7 集中处理，分两轮：先抽变量、再校色 |
| ScriptEditor / 代码高亮无亮色配色 | 中 | 配套切 react-codemirror / monaco 的 light theme |
| 第三方库（react-virtuoso 等）必须 inline style | 低 | §7 第 4 档白名单，CI 放行 |
| Tailwind v4 nesting 与 SCSS 嵌套语法冲突 | 低 | SCSS 文件由 sass 编译先于 PostCSS / Tailwind，无冲突 |
| `@theme` 块改为 `var()` 转发后 Tailwind v4 colorize 类型推断失效 | 低 | Tailwind v4 `@theme` 完全支持 CSS 变量值（v4 设计意图） |
| 主题切换后 Modal 已挂载实例样式不更新 | 低 | Antd 6 通过 ConfigProvider 已支持；如有残留 `<ConfigProvider key={themeId}>` 兜底 |
| 自定义 ESLint plugin 维护成本 | 低 | 简单纯函数 plugin，~100 行，单测覆盖 |

---

## 7. 验收清单（最终）

| 项 | 通过标准 |
|---|---|
| 4 套预设主题均可在设置中选择 | ✓ |
| 切换无需刷新，所有 Modal / Drawer / 灵绘 / 编辑器跟随 | ✓ |
| 重启应用保持选择 | ✓ |
| `find -name "*.css" -not -name "*.module.scss"` | 0 文件 |
| 业务文件 grep `#[0-9a-fA-F]{3,6}` 命中 | < 50（基线 889） |
| 业务 tsx grep `style={{` 含非 `--` 开头 key | 0（仅白名单豁免） |
| Tailwind 含 hex `[#xxx]` arbitrary value | 0（基线 35） |
| 业务 tsx grep `colorMode="dark"` / `darkTheme={true}` | 0 |
| 非 `theme/` 目录 import `tokens` | 0 |
| Stylelint / ESLint / 自检脚本 全过 | ✓ |
| 4 套主题 × 5 关键页截图无错位 | ✓ |
| light-business 模式下文字对比度 ≥ WCAG AA | ✓ |
| 加第 5 套主题 = 新增 1 个文件，无其它改动 | ✓ |

---

## 8. 实施提示

- **分 Phase 独立 PR**：每 Phase 一个 commit / PR，避免一次 1500 行难审查
- **优先 M1**：用户最快感知改进 = 暗色双主题（3.5 d）
- **Phase 5 inline 迁移**：分 4 天每天 100-150 处 + QA，不要一次推完
- **每 Phase 都做主题切换冒烟**：不然回归代价指数级膨胀
- **截图 diff**：可用 Playwright `toHaveScreenshot` 在每 Phase 末做关键页对照
- **绝对不要**：在改造期间动 Antd / Tailwind / React 版本——主题改造必须只改样式层

---

## 9. 与架构规范对应

| PLAN Phase | 架构对应 |
|---|---|
| Phase 1 Token 分层 | 架构 §4 三层 + §10 目录 |
| Phase 1 ThemeProvider | 架构 §10 `runtime/ThemeProvider.tsx` |
| Phase 2 Tailwind 转发 | 架构 §6.2 |
| Phase 3 持久化 | 架构 §10 `runtime/persistence.ts` |
| Phase 4 CSS→SCSS | 架构 §3.1 允许清单 + §6.1 |
| Phase 5 inline style 迁移 | 架构 §7 四档 + §3.3 CSS 变量桥接 |
| Phase 7 light + dark flag | 架构 §6.5 |
| Phase 9 CI 防腐 | 架构 §9 |
| 验收 | 架构 §12 + 本文 §7 |

---

## 10. 下一步

1. 确认本计划 + 架构规范
2. OpenSpec 立项（建议拆 3 个 change 对应 M1/M2/M3，方便独立 review）
3. Phase 0 准备（量化基线 + 截图）
4. 开干 M1
