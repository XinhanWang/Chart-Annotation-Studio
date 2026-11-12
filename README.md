# Chart Annotation Studio

Browser-based scientific chart annotation with original-pixel calibration, interactive measurements, and compact Vega-Lite GT export.

## 使用

打开 `index.html` 即可离线使用，无需安装依赖。原图、标注和草稿保存在当前浏览器中；工具不会上传原图。浏览器草稿不代替工程备份，切换浏览器或清除站点数据前请先备份工作区。

### 这轮交互改进

- **类别轴无需标定**：纵向柱图只标定 Y；横向柱图只标定 X；类别 X 折线只标定 Y。只有必要的数值轴出现在校准面板。
- **放大镜不遮挡原图**：独立辅助区显示原图像素 5× 放大；窄屏改为上下排列，禁用放大镜时释放辅助区空间。
- **标注项目**：支持“无项目”、创建、改名、切换项目，以及移动图像。移除项目只把图像移到“无项目”，不会删除标注；移除当前图像则会提示确认。
- **文件夹与批量操作**：可导入多张图片或整个文件夹，保留相对路径并按自然数字顺序排列。支持 PNG、JPG/JPEG、WebP；无法解码的图片与其他文件会跳过并显示数量。
- **全屏标注**：保留原图、取点工具、目标进度、校准和数据表。原生全屏不可用时使用页面内专注模式；输入框有焦点时也可按 Esc 返回，通过“核对 / 导出”返回质量检查区。
- **单系列默认无图例**：新建单系列类型默认不勾选“原图中存在可读图例”；若原图确有图例，可手动打开。
- **独立误差棒子类**：单系列 / 分组的横向、纵向柱图提供独立误差棒入口。可逐柱点“数值端点 → 上界 → 下界”，也可分轮点“所有数值端点 → 所有上界 → 所有下界”。项目恢复和撤销后会继续提示缺失端点。上界、下界指较大 / 较小的数值，倒置坐标也遵循此规则。
- **按类型精简字段**：普通柱图不显示误差字段；折线才显示曲线来源、连线和可选路径顺序；单系列隐藏不必要的系列选择。

### 备份与导出

- **备份工作区**：导出 version 2 工程 JSON，包含全部项目、原图、像素证据、校准、来源和核对记录。可继续导入 version 1 历史工程。
- **导出 GT**：仅导出当前图的科学语义，不包含原图或像素证据。
- **批量导出 ZIP**：只导出当前项目（或“无项目”）中已人工核对、结构有效且可编译的图表。GT 保留文件夹路径，重名文件自动加后缀；ZIP 内 `export-report.json` 列出成功项和跳过原因。未核对或未完成误差棒的图片不会被静默当成完整 GT 导出。

质量检查和语义重绘不证明原图数值已准确恢复；用户仍需核对来源、采样位置和具体数值。

## 误差棒 GT

精简 Vega-Lite JSON 统一输出 `mark: {"type": "errorbar"}` 原生复合标记，不再把误差棒导出为 `rule`。`lower` / `upper` 为绝对数值上下界；纵向柱图使用 `y` / `y2`，横向柱图使用 `x` / `x2`。分组误差棒继承系列及类别 offset，堆叠图的误差区间设为 `stack: null`。端帽外观不进入精简 GT。

兼容导入历史 `bar + rule` 区间，再次导出会统一转换为 `bar + errorbar`；数据数值、系列与顺序不变。堆叠图仍支持手动误差端点编辑，但不在这次四个连续误差棒子类中。

## 开发与验证

Node.js 22+。可编辑源码和发布用离线单文件分开维护：

- `studio.js`：应用和 GT 转换逻辑。
- `studio.template.html`：界面、样式。
- `vendor.bundle.html`：已捆绑渲染库，许可证见 `THIRD_PARTY_LICENSES.txt`。
- `build.mjs`：构建离线 `index.html`，无安装步骤、无联网依赖。

```powershell
node --check studio.js
node build.mjs
node tests/errorbar.cjs
```

浏览器回归默认使用 **Playwright + 独立无头浏览器上下文**，不会读取或改写日常浏览器中的真实标注草稿。Windows 默认调用本机 Edge；其他系统使用 Playwright Chromium。安装开发依赖后运行：

```powershell
npm install
npm test
```

若没有本机 Edge，可使用 Playwright 安装 Chromium，然后指定通道：

```powershell
npx playwright install chromium
$env:STUDIO_BROWSER_CHANNEL='chromium'
npm test
```

也可只运行一套测试：

```powershell
node tests/interactions.mjs --headless
node tests/workflows.mjs --headless
node tests/edges.mjs --headless
```

测试覆盖连续取点、约束拖动、误差棒顺序、项目与文件夹、ZIP、旧工程恢复和 375 / 740 / 1024 / 1280 / 1920 px 布局。设置 `STUDIO_QA_OUTPUT` 可保存截图。

保留 web-access CDP proxy 兼容入口：将 `--headless` 换成自己创建的隔离本地测试页 target ID。测试会修改该页的标注与本地草稿，不应在真实标注页上运行；后台标签页可能有计时器限流，优先使用隔离无头模式。
