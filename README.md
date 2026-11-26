# Chart Annotation Studio

Browser-based scientific chart annotation with original-pixel calibration, interactive measurements, and compact Vega-Lite GT export.

## 使用

### 公共撤销与快捷键

画布工具栏分别提供「撤销／重做校准」和「撤销／重做取点」。数据历史为空时会停止撤销。堆叠起点和其他尚未完成一条记录的取点也可撤销。重新校准会保留记录与原始像素证据，按新校准重算可重新计算的观测，并清理依赖旧校准的历史。

点击原图激活画布快捷键。输入框保留浏览器的编辑按键，热力图单元格仍可用 Enter 提交当前值。

| 快捷键 | 操作 |
| --- | --- |
| Space + 左键拖动、Shift + 滚轮 | 临时平移、以鼠标位置为中心缩放 |
| Ctrl/⌘ + Z、Ctrl/⌘ + Shift + Z | 撤销、重做当前操作区域 |
| Esc、Delete | 取消未完成的测量、删除选中记录 |
| ← / →、↑ / ↓ | 切换数据记录、切换系列 |
| Tab / Shift+Tab、Enter | 切换测量项、确认支持提交的测量 |
| F / 1、V / P、按住 H | 适应画布 / 原始比例、选择编辑 / 取点、临时隐藏叠加 |
| Ctrl + 方向键 | 微调选中点 1 个原图像素。Shift + 方向键为 10 个，Alt + 方向键为 0.1 个 |

缩放、平移和临时隐藏只影响当前视图。画布工具栏的「快捷键」也可随时查看这些操作。

### 热力图

选择「热力图」标注离散矩阵、连续二维分箱及两种混合方向。支持粘贴矩阵、共享像素边界及人工色标校准。见 [热力图标注说明](docs/heatmap-annotation.md)。

### 柱线复合图

图表大类新增「柱线复合图」，在原系列列表为每个系列选择柱或线；共享类别轴，可使用共享 Y 轴或分别校准左 Y（柱）、右 Y（折线）。复用原有取点、表格、误差棒、拖动、微调、撤销、工程和人工核对导出。GT 使用 `series_role` 区分角色，支持生成器已有复合 GT 导入，误差棒统一为原生 `errorbar`。使用方式、数据结构及边界见 [复合图标注说明](docs/composite-annotations.md)。

打开 `index.html` 即可离线使用，无需安装依赖。原图、标注和草稿保存在当前浏览器中；工具不会上传原图。浏览器草稿不代替工程备份，切换浏览器或清除站点数据前请先备份工作区。

### 这轮交互改进

- **类别轴无需标定**：纵向柱图只标定 Y；横向柱图只标定 X；折线的 X、Y 均可选一个作为类别轴，只校准连续轴。只有必要的数值轴出现在校准面板。
- **放大镜不遮挡原图**：独立辅助区显示原图像素 5× 放大；窄屏改为上下排列，禁用放大镜时释放辅助区空间。
- **标注项目**：支持“无项目”、创建、改名、切换项目，以及移动图像。移除项目只把图像移到“无项目”，不会删除标注；移除当前图像则会提示确认。
- **文件夹与批量操作**：可导入多张图片或整个文件夹，保留相对路径并按自然数字顺序排列。支持 PNG、JPG/JPEG、WebP；无法解码的图片与其他文件会跳过并显示数量。
- **全屏标注**：保留原图、取点工具、目标进度、校准和数据表。原生全屏不可用时使用页面内专注模式；画布激活时可按 Esc 取消未完成的测量或退出专注模式。通过「核对 / 导出」返回质量检查区。
- **单系列默认无图例**：新建单系列类型默认不勾选“原图中存在可读图例”；若原图确有图例，可手动打开。
- **独立误差棒子类**：单系列 / 分组的横向、纵向柱图提供独立误差棒入口。可逐柱点“数值端点 → 上界 → 下界”，也可分轮点“所有数值端点 → 所有上界 → 所有下界”。项目恢复和撤销后会继续提示缺失端点。上界、下界指较大 / 较小的数值，倒置坐标也遵循此规则。
- **按类型精简字段**：普通柱图不显示误差字段；折线才显示曲线来源、连线和可选路径顺序；单系列隐藏不必要的系列选择。

### 批量名称与系列配色

- 展开「批量输入系列名称」或「批量输入对象名称」，粘贴换行分隔的名称，再点击「应用」。一行一个对象，自动去除首尾空白并忽略空行；同名对象不合并。
- 名称按当前列表顺序应用：已有对象改名并保留稳定 key、配色和标注关联；多出的行新增对象。减少行数时先确认删除末尾对象及其记录，可撤销 / 重做。单系列图只接受一个系列名称。
- 新增系列随机选择未使用的 24 色调色板；用完后继续生成不重复颜色，不再循环两种颜色。已有配色及手动颜色不会被随机覆盖；颜色仅用于界面显示，不进入精简 GT。

### 备份与导出

- **备份工作区**：导出 version 2 工程 JSON，包含全部项目、原图、像素证据、校准、来源和核对记录。可继续导入 version 1 历史工程。
- **导出 GT**：仅导出当前图的科学语义，不包含原图或像素证据。
- **批量导出 ZIP**：只导出当前项目（或“无项目”）中已人工核对、结构有效且可编译的图表。GT 保留文件夹路径，重名文件自动加后缀；ZIP 内 `export-report.json` 列出成功项和跳过原因。未核对或未完成误差棒的图片不会被静默当成完整 GT 导出。

质量检查和语义重绘不证明原图数值已准确恢复；用户仍需核对来源、采样位置和具体数值。

## 误差棒 GT

精简 Vega-Lite JSON 统一输出 `mark: {"type": "errorbar"}` 原生复合标记，不再把误差棒导出为 `rule`。`lower` / `upper` 为绝对数值上下界；纵向柱图使用 `y` / `y2`，横向柱图使用 `x` / `x2`。分组误差棒继承系列及类别 offset，堆叠图的误差区间设为 `stack: null`。端帽外观不进入精简 GT。

数值轴标题、单位及必要的 `axis.format` 只在顶层 `encoding.x` 或 `encoding.y` 声明。`bar` 继承顶层编码，`errorbar` 只映射 `lower` 和 `upper`。百分比刻度沿用 Precision V2，默认 `.4~p`。只有标题含 `(%)` 时仍使用普通数值刻度，省略 `axis.format`。

导入兼容旧版 `bar + rule` 区间和重复的轴格式。再次导出会使用原生 `bar + errorbar` 和顶层单次声明，保留上下界、系列、类别顺序和 `table_export`。历史各层的格式不一致时会提示复核。堆叠图仍支持手动误差端点编辑。

## 图例 / 类别填写顺序与堆叠 GT

系列、类别输入区会随图表类型显示填写说明：纵向堆叠的系列从下到上，横向堆叠从左到右；类别分别从左到右、从上到下。分组柱图显示组内柱子方向；折线、散点显示首次可见顺序和类别填写规则。

普通堆叠的精简 GT、单图导出和 ZIP 导出使用同一规范化结果：每段记录 `category → value → stack_order → series`（重名时按规范插入身份字段），数值轴为 `value`、`stack: "zero"`，`order` 绑定 `stack_order`。下方数据记录及工程备份保留测量用的 `start/end`。旧版普通堆叠端点 GT 再次导出时自动转换为此形式；确实需要非零起点或非累计区间时才使用规范允许的显式端点形式。
## 折线图

单系列和多系列可选双连续轴、离散 X 加连续 Y、连续 X 加离散 Y。离散 X 类别从左到右排列，离散 Y 类别从上到下排列。用「定位当前类别刻度」固定原图位置，各系列可共享该位置并跳过缺测类别。切换轴模式会保留已有记录，切回可继续。详见 [折线图标注与 GT](docs/point-line-contract.md)。

## 面积图

在「图表大类」选择「面积图」，再选择子类型和 X 轴模式。用「取点」依次点击上界和下界，第二次点击沿第一次的 X 位置取值。选中表格中的记录，可用「重取上界」「重取下界」重测，也可拖动已有像素标记或直接编辑数值。

- **Quantitative** 使用数值 `x`，校准 X 和 Y 后取点。
- **Nominal** 使用文字 `category`，只校准 Y。按原图从左到右录入类别，在侧栏用 ↑ / ↓ 调整位置，再选择类别和系列取点。「定位当前类别刻度」可让同一类别下的各系列共用 X 像素位置。年份、月份等标签保留原文字。每个类别位置需要唯一标签，每个类别与系列组合对应一条上下界记录。

通过取点、拖动、微调或重新校准取得的上下界和 Quantitative X 值，按各自数值轴的校准值应用 Precision V2。旧工程恢复时保留原值。Quantitative 使用「在原图定位 X 刻度」时，「已知 X 数值」输入框会清空，固定的 X 显示在当前目标提示中。

两种模式各自保留记录、校准和像素证据，工程备份包含两套数据。首次切换到另一模式时从空表开始。导入同一子类型的 GT 会更新其对应模式，另一模式仍可切回。

| 子类型 | 标注内容 |
| --- | --- |
| Single-series Area | 逐 X 记录上界 `y` 和实际下界 `baseline`。 |
| Multi-series Area | 用「当前系列」切换标注对象，每个系列分别记录 `y` 和 `baseline`。可在系列列表改名，在表格调整记录归属。 |
| Stacked Area | 每层填写累计上界 `y` 和实际下界 `baseline`，两者之差为该层贡献。在系列列表按底层到顶层排列，使用 ↑ / ↓ 调整 `stack_order`。 |

三个子类型均使用数值 Y 和逐行 `baseline`。固定基线也逐行填写。Nominal GT 的 X 编码为 `field: "category"`、`type: "nominal"`、`sort: null`，行按类别位置排序，预览沿同一顺序连接。两种模式均使用 `y2.field=baseline` 和 `y.stack=null`。多系列通过 `color.field=series` 分组，堆叠子类使用 `"order": {"field": "stack_order", "type": "quantitative"}`，兼容导入带 `"sort": "ascending"` 的旧堆叠 GT。预览使用 GT 的系列配色，系列列表的颜色用于原图标记。缺少边界或上界低于下界会阻止导出，堆叠层在共同 X 处未接合时会提示核对。

可用目录中的三份 `* Area.json` 验证 Quantitative 模式。`tests/fixtures/area-nominal.json` 包含测试用的三份 Nominal GT，三个顶层属性的值各是一份可导入的 GT。执行 `node build.mjs` 和 `node tests/area.cjs` 可验证两种模式的 GT 往返及渲染。安装 Playwright 和浏览器后运行 `node tests/area-browser.cjs` 可验证浏览器交互及下载。

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

测试覆盖批量名称、同名对象身份、删除确认与撤销、随机配色、连续取点、约束拖动、误差棒顺序、项目与文件夹、ZIP、旧工程恢复和 375 / 740 / 1024 / 1280 / 1920 px 布局。设置 `STUDIO_QA_OUTPUT` 可保存截图。

保留 web-access CDP proxy 兼容入口：将 `--headless` 换成自己创建的隔离本地测试页 target ID。测试会修改该页的标注与本地草稿，不应在真实标注页上运行；后台标签页可能有计时器限流，优先使用隔离无头模式。

## 自动重名身份（1.4.0）

类别按实际轴位置建立对象，系列按图形/图例对象建立对象；同名不会合并。类别位置和系列提供独立改名、上下移动、添加和删除控件，数据表通过对象选择器维护归属；无需输入 ID。工程稳定 key 与 GT 顺序 ID 分离，备份和撤销保留绑定。重名时自动导出 `category_id=C1…` / 离散 `x_id=X1…` 或 `y_id=Y1…` / `series_id=S1…`；无重名维度不导出 ID，单系列无图例不导出 series。Renderer 在副本中恢复原标签，GT 不保存表达式。兼容导入历史 `*_instance` 和 version 1/2 工程。详见 [统一契约](docs/gt-identity-contract.md)。

新增测试：`node tests/identity.cjs`；修改 `studio.js` 后必须 `node build.mjs` 同步离线单文件。


## Encoding channel order

Serialize every view and layer with position channels before visual channels: `x → y → xOffset → yOffset → x2 → y2 → theta → theta2 → radius → radius2 → longitude → longitude2 → latitude → latitude2 → color → other channels`. Omit absent channels; preserve the relative order of other channels. For grouped bars this gives `x → y → xOffset/yOffset → color`. Only encoding object key order changes; channel definitions, observations and rendering semantics are preserved.

## Ordinary vertical and horizontal stacks (2026-11-13)

`barv_stack` writes each category bottom-to-top; `barh_stack` writes categories top-to-bottom and segments left-to-right. Segment amounts remain scientific values, with cumulative boundaries preserved by `stack_order` or explicit `start`/`end`. The annotation UI needs N+1 clicks for N segments and shares boundaries through undo, reload, recalibration and edits. New production uses absolute stacks only. See [stack annotation contract](docs/stack-annotation-contract.md).


2026-11-16：散点导出自动规范化；折线仅在真实路径 X 回退时保留 path_order，重复 X 不触发；逆向数值 X 保留 scale.reverse:true，回退的离散 X 保留显式位置顺序。详见 docs/point-line-contract.md。

## 平滑曲线

在「折线图」大类选择单系列或多系列平滑曲线。支持双连续轴，以及 X 或 Y 离散的两种模式。离散轴先定位类别刻度，再逐项标注或跳过固定点。之后可直接导出，也可切换到「自由采样」，选择系列并在原图上按任意顺序补取端点、峰谷和曲率变化的位置。双连续轴可用「插入采样点」补点。运行 `npm run test:smooth` 可验证导入、预览方向和取点。GT 字段与限制见 [平滑曲线规范](docs/point-line-contract.md#平滑曲线)，十个可直接导入的示例见 [examples/smooth-curves](examples/smooth-curves)。

## 雷达图与极坐标柱状图

在「雷达图」大类中选择单系列雷达图、多系列雷达图、单系列极坐标柱状图、多系列极坐标柱状图或极坐标堆叠柱状图。五种子类共享原图圆心、径向刻度和首类别方向校准。分组柱按实际径向距离取点，堆叠柱按类别依次取各段外边界。操作步骤、Compact GT 和旧格式迁移见 [极坐标标注说明](docs/radar-annotation.md)。专项测试运行 `npm run test:radar`。

## Pie / Box Plot 人工标注

新增 Pie、Box Plot Vertical、Box Plot Horizontal，接入原有数据表、质量检查、预览、工程保存、图像队列及浏览器草稿。

- **Pie**：在表格添加、编辑、删除类别和原始数值，用行首 ↑ / ↓ 调整顺序。也可展开「批量输入类别名称」，一行一个类别，按数据表顺序改名或新增待填数值的行。指标名称及单位可留空，切换百分比或绝对值会保留已填写的名称。GT 的百分比模式默认使用 `theta.format: ".4~p"`。只有明确的指标名称才写入 `theta.title`。百分比总和偏离 100 时提示核对。环形外观保存在工程，Compact GT 统一导出 `arc`。历史格式和比例确认流程见 [饼图 GT 规范](docs/statistical-extension.md)。
- **Pie 角度测量**：上传二维饼图或环形图，在百分比模式点击「角度测量」。先点击圆心，再从任意一条分界线开始沿顺时针各点一次，最后一个扇区自动闭合。结果采用百分之一百分点，并用最大余数法分配尾差，实测闭合扇区合计为 100%。在数据表中准备好类别，逐一选择扇区对应的类别，确认后应用。应用混合测量时保留手填与导入的行，其他扇区分别舍入。整图已有数值时可明确确认整图重测。应用可用取点撤销还原。工程保存测量草稿与原始像素依据。
- **Box Plot**：纵向只校准 Y，横向只校准 X。设置类别后使用「取点」，按 `lower → q1 → median → q3 → upper` 自动推进，再进入下一类别。选择「当前测量项」可重测任意项。「取点」只测量当前目标，近邻或重合点不会拦截；编辑时切换「选择 / 拖动」，通过画布或字段列表选中已有点，再拖动或用 Ctrl＋方向键微调。重合位置优先编辑已选字段，并沿用放大、投影线、类别定位和拖动方向约束。
- **异常值**：选择 `outliers` 和「连续新增」后逐点取值；也可选择已有异常值重测。表格支持逐个修改、添加、删除，精简 GT 将离群点逐条写入独立点层的 `data.values`，无离群点时该表为空。手动添加后需填写数值，空白不会作为零导出。
- **人工编辑**：可以直接录入所有统计量。修改某个数值仅解除该项与像素的对应，保留其余测量点；后续修改校准只重算仍有像素依据的值。箱线图的点击测量、拖动、微调和校准重算采用 Precision V2；人工录入和 GT 导入保留原始精度，原始像素坐标也保留完整精度。仅校验五数顺序，不应用 1.5×IQR 修正。
- **单位与存档**：Pie 指标和箱线图轴标题保留科学单位；箱线图可选轴格式也可保留比例单位。工程包含原图、校准、测量像素、人工数据和标注状态；GT 只包含科学数据、必要映射及标题/单位。GT 导入不会恢复像素证据。导出仍需使用原有人工核对勾选流程。

核验材料见 [样例与截图总览](examples/statistical/index.html) 和 [开发及验证说明](docs/statistical-extension.md)。

统计图沿用当前 v2 工作区、稳定类别对象、项目管理、批量 ZIP 和全屏流程；不会把箱线图的预计算 `rule + bar + tick + point` 改成柱图误差棒。

统计图专项测试可运行 `npm run test:statistical` 和 `npm run test:browser`。饼图角度测量浏览器测试可单独运行 `node tests/pie-angle-browser.cjs`。

### 训练 GT 和逐表导出

Precision V2 作用于自动测量和自动计算的科学数值。整数保持整数，绝对值大于等于 1 的普通小数最多保留两位小数，非零且绝对值小于 1 的数和科学计数法数值最多保留四位有效数字。十进制中点向远离零的方向舍入，零写为 `0`，省略末尾无意义的零。自动计算的浮点数沿用生成平台的科学计数法判定，绝对值达到 `1e16` 时使用四位有效数字。图像分辨率只用于评估是否需要复核。普通观测值可以舍入为同一个数值。

原图明确标注的值、人工输入或修正、已有 GT，以及直接落在已知刻度上的值保留原精度。重新校准仅重算对应轴上仍有像素依据的字段。相邻分箱和热力区间共用边界，若舍入导致区间、堆叠段或其他结构异常，质量检查提示复核。重新预览和导出沿用当前科学数据，Compact GT 不存储工程像素、数值来源或精度版本。

自动百分比按百分数舍入到最多两位小数，例如 `23.45678%` 舍入为 `23.46%` 后存为 `0.2346`。纯自动且闭合的饼图与百分比堆叠采用最大余数法，使合计为 100%。混有原图标注值或手填值时，合计偏差提示复核。原图刻度或标签 `18%`、`5.5%`、`(1.6%)`、`12.3456%` 分别存 `0.18`、`0.055`、`-0.016`、`0.123456`。坐标轴原文确带百分号时，录入原文或勾选相应坐标轴的「原图数字带 %」。只有数据标签带百分号时按标签保存比例，轴格式由刻度独立决定。已有普通刻度与标签的比例尺度冲突或无法确认时提示复核。只有标题写 `Share (%)` 且刻度为 `15、18、20` 时保存这三个普通数值并省略格式。

默认 D3 百分比格式为 `.4~p`，明确标注的高精度数值使用 `.N~p`。覆盖数值轴 `axis.format`、热力色标 `legend.format` 和饼图 `theta.format`。旧 GT 的 `.0%`、`.12~%` 和已设置的格式仍可读写。只有标题或选定普通堆叠时保留普通数值；旧的无格式百分比堆叠可先选择对应子类型再导入。

每份精简 GT 通过 `usermeta.table_export.tables` 列出各语义表的唯一 `id` 与内联 `data.values` 路径。单图可下载逐表导出 ZIP；批量导出 ZIP 同时含 GT、每表的 Markdown 和 CSV 及审核结果。箱线图将五数统计和离群点分表，同一类别的每一个离群点各占一行。柱线复合图将柱与折线分别绑到数据表。新 GT 使用直接字段编码，两个表格格式均沿用轴标题替换规则。

离线页面内嵌 [Vega-Lite-Table-Export](https://github.com/XinhanWang/Vega-Lite-Table-Export) 的 MIT 发布包。固定的提交、文件名和 SHA-256 见 `vendor/vega-lite-table-export.lock.json`，构建时会核验摘要。

### Precision V2 与混合轴回归测试

运行 `npm test` 验证全部原有图型和新增契约；`npm run test:precision` 可单独执行测量精度及混合轴专项检查。浏览器测试使用独立上下文，不读取现有草稿；Windows 默认使用 Edge，也可设置 `STUDIO_BROWSER_CHANNEL=chromium` 并先运行 `npx playwright install chromium`。

专项检查覆盖离散 X / Y、缺测与重名类别、回退路径、逐模式校准及工程恢复、共享类别锚点、真实取点与键盘微调、逐表 Markdown/CSV 精度、饼图显式比例确认、旧轴格式兼容及冲突拒绝。测量断言采用独立的 Precision V2 参考实现，并对照从 Vega-Lite-DG 远端 `main` 的 `precision.py` 生成的数值、百分比和尾差 fixtures。
