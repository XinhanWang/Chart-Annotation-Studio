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

兼容导入历史 `bar + rule` 区间，再次导出会统一转换为 `bar + errorbar`；数据数值、系列与顺序不变。堆叠图仍支持手动误差端点编辑，但不在这次四个连续误差棒子类中。

## 图例 / 类别填写顺序与堆叠 GT

系列、类别输入区会随图表类型显示填写说明：纵向堆叠的系列从下到上，横向堆叠从左到右；类别分别从左到右、从上到下。分组柱图显示组内柱子方向；折线、散点显示首次可见顺序和类别填写规则。

普通堆叠的精简 GT、单图导出和 ZIP 导出使用同一规范化结果：每段记录 `category → value → stack_order → series`（重名时按规范插入身份字段），数值轴为 `value`、`stack: "zero"`，`order` 绑定 `stack_order`。下方数据记录及工程备份保留测量用的 `start/end`。旧版普通堆叠端点 GT 再次导出时自动转换为此形式；确实需要非零起点或非累计区间时才使用规范允许的显式端点形式。
## 面积图

在「图表大类」选择「面积图」，再选择子类型和 X 轴模式。用「取点」依次点击上界和下界，第二次点击沿第一次的 X 位置取值。选中表格中的记录，可用「重取上界」「重取下界」重测，也可拖动已有像素标记或直接编辑数值。

- **Quantitative** 使用数值 `x`，校准 X 和 Y 后取点。
- **Nominal** 使用文字 `category`，只校准 Y。按原图从左到右录入类别，在侧栏用 ↑ / ↓ 调整位置，再选择类别和系列取点。「定位当前类别刻度」可让同一类别下的各系列共用 X 像素位置。年份、月份等标签保留原文字。每个类别位置需要唯一标签，每个类别与系列组合对应一条上下界记录。

通过取点、拖动、微调或重新校准得到的上下界保存到小数点后两位，Quantitative 自动测量的 X 也使用两位精度。恢复旧工程时，同样处理有对应像素依据的数值。Quantitative 使用「在原图定位 X 刻度」时，「已知 X 数值」输入框会清空，固定的 X 显示在当前目标提示中。

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

类别按实际轴位置建立对象，系列按图形/图例对象建立对象；同名不会合并。类别位置和系列提供独立改名、上下移动、添加和删除控件，数据表通过对象选择器维护归属；无需输入 ID。工程稳定 key 与 GT 顺序 ID 分离，备份和撤销保留绑定。重名时自动导出 `category_id=C1…` / 离散 `x_id=X1…` / `series_id=S1…`；无重名维度不导出 ID，单系列无图例不导出 series。Renderer 在副本中恢复原标签，GT 不保存表达式。兼容导入历史 `*_instance` 和 version 1/2 工程。详见 [统一契约](docs/gt-identity-contract.md)。

新增测试：`node tests/identity.cjs`；修改 `studio.js` 后必须 `node build.mjs` 同步离线单文件。


## Encoding channel order

Serialize every view and layer with position channels before visual channels: `x → y → xOffset → yOffset → x2 → y2 → theta → theta2 → radius → radius2 → longitude → longitude2 → latitude → latitude2 → color → other channels`. Omit absent channels; preserve the relative order of other channels. For grouped bars this gives `x → y → xOffset/yOffset → color`. Only encoding object key order changes; channel definitions, observations and rendering semantics are preserved.

## Ordinary vertical and horizontal stacks (2026-11-13)

`barv_stack` writes each category bottom-to-top; `barh_stack` writes categories top-to-bottom and segments left-to-right. Segment amounts remain scientific values, with cumulative boundaries preserved by `stack_order` or explicit `start`/`end`. The annotation UI needs N+1 clicks for N segments and shares boundaries through undo, reload, recalibration and edits. New production uses absolute stacks only. See [stack annotation contract](docs/stack-annotation-contract.md).


2026-11-16：散点导出自动规范化；折线仅在真实路径 X 回退时保留 path_order，重复 X 不触发；逆向数值 X 保留 scale.reverse:true，回退的离散 X 保留显式位置顺序。详见 docs/point-line-contract.md。

## Pie / Box Plot 人工标注

新增 Pie、Box Plot Vertical、Box Plot Horizontal，接入原有数据表、质量检查、预览、工程保存、图像队列及浏览器草稿。

- **Pie**：在表格添加、编辑、删除类别和原始数值，用行首 ↑ / ↓ 调整顺序。选择百分比时指标标题自动设为 `Share (%)`，选择绝对数值时自动设为 `Value`；每次切换都会替换标题，之后可再填写实际指标及单位。百分比总和不等于 100 仅提示，不归一化。环形预览勾选项保存于工程；Compact GT 统一导出 `arc`，不保存环形外观或扇区排序变换。
- **Box Plot**：纵向只校准 Y，横向只校准 X。设置类别后使用「取点」，按 `lower → q1 → median → q3 → upper` 自动推进，再进入下一类别。选择「当前测量项」可重测任意项。「取点」只测量当前目标，近邻或重合点不会拦截；编辑时切换「选择 / 拖动」，通过画布或字段列表选中已有点，再拖动或方向键微调。重合位置优先编辑已选字段，并沿用放大、投影线、类别定位和拖动方向约束。
- **异常值**：选择 `outliers` 和「连续新增」后逐点取值；也可选择已有异常值重测。表格支持逐个修改、添加、删除，空列表导出为 `[]`。手动添加后需填写数值，空白不会作为零导出。
- **人工编辑**：可以直接录入所有统计量。修改某个数值仅解除该项与像素的对应，保留其余测量点；后续修改校准只重算仍有像素依据的值。箱线图的点击测量、拖动、微调和校准重算结果统一保留两位小数；人工录入和 GT 导入保留原始精度，原始像素坐标也保留完整精度。仅校验五数顺序，不应用 1.5×IQR 修正。
- **单位与存档**：Pie 指标和箱线图轴标题保留科学单位；箱线图可选轴格式也可保留比例单位。工程包含原图、校准、测量像素、人工数据和标注状态；GT 只包含科学数据、必要映射及标题/单位。GT 导入不会恢复像素证据。导出仍需使用原有人工核对勾选流程。

核验材料见 [样例与截图总览](examples/statistical/index.html) 和 [开发及验证说明](docs/statistical-extension.md)。

统计图沿用当前 v2 工作区、稳定类别对象、项目管理、批量 ZIP 和全屏流程；不会把箱线图的预计算 `rule + bar + tick + point` 改成柱图误差棒。

统计图专项测试：`npm run test:statistical`、`npm run test:browser`。`npm test` 包含上游全部回归及这些新增检查。
