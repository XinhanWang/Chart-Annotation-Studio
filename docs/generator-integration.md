# Vega-Lite-DG → 标注平台

## 来源和边界

`generator/` 是用户指定的 Vega-Lite-DG 本地工作树快照，包含本地尚未提交的复合图改动。`generator/UPSTREAM.json` 记录原仓库、基线提交及每个源文件的 SHA-256。生成器保留原模块、种子、样式采样、字体许可、恢复/验证管线；没有复制生成图片、历史运行、虚拟环境或凭据。原源码快照不在同步脚本中自动拉取更新。

生成器输出的原始 `compact.vl.json` 不会被平台回写。平台入口使用同一份 `studio.js` 的 `importSpec → validate → makeSpec`，按平台当前规范投影：原生 `errorbar`、普通堆叠段值与顺序、散点画面顺序、折线回退规则、重名 C/X/S 身份及字段/编码键顺序。

支持标注的入口只接受非空内联精简 GT。完整渲染规格、外部数据、未知科学字段、附加变换、组合图和平台不支持的尺度被明确拒绝，不把它们降级为某个已支持图型。默认 `studio-smoke.json` 生成九类基础图各一张。原生成器的十类图、复合配置和全部生产工具仍可在 `generator/` 独立使用；目前柱线复合 `barline_n` 和 sqrt/symlog 不进入可编辑队列，原因会写进报告。

## 安装

离线单文件标注页面仍无需安装。生成数据需要 Python 3.10/3.11 与 Node.js 22+；在平台仓库根目录执行：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r generator/requirements-studio.txt
npm ci
npm ci --prefix generator
python generator/bootstrap.py
```

`bootstrap.py` 下载项目字体并验证许可。`generator/assets/`、两处 `node_modules/`、虚拟环境和 `generated/` 不提交。原版 Python 依赖保留在 `generator/requirements.txt`；平台安装文件使用受支持的 PyYAML 6，避免旧版 PyYAML 5.4 的源码构建问题。

## 生成 → 工作区

```bash
npm run generate -- \
  --config generator/configs/studio-smoke.json \
  --output generated/my-run \
  --python .venv/bin/python
```

命令将原始图像、精简 GT、渲染证据与质量结果写入新运行目录，再导出 `studio.project.json` 与 `studio.project.json.report.json`。已有非空目录不会覆盖。生成器质量失败时命令返回非零，先检查 `validation.json` / `rejected.jsonl`；需要单独使用接受样本时再显式执行下方转换命令。

打开 `index.html`，点击「打开工程」并选择 `studio.project.json`，即可恢复包含图像与 GT 的 v2 工作区。该操作使用原有工作区恢复逻辑，当前工作区应按原流程备份。

## 已有运行 → 当前标注项目

展开侧栏「合成数据 / Vega-Lite-DG」，点击「导入生成目录」，选择完整运行目录。浏览器以 `manifest.jsonl` 的 `image` 和 `compact` 路径配对文件，只导入 `status: accepted` 的样本；不以文件名相似度猜测、不导入 compact 预览图。

导入追加到开始导入时的标注项目，不覆盖已有队列。原 PNG 在浏览器中实际解码，精简 GT 通过平台验证和本地 Vega 编译才入队。不支持类型、缺失文件、解码错误或重复 ID 均逐项列在可下载的导入报告中。没有清单、清单无效或接受列表为空时，现有队列不变。

每行数值标记为 `source: synthetic_gt`，项目单独保存 `generatedSource`；`reviewed` 默认为 false，坐标轴 `calibrated` 为 false，不伪造人工像素证据。来源随工程备份、恢复和草稿保留，不写进训练 GT。人工仍可校准、取点、编辑和撤销，并须核对后才能导出 GT / 批量 ZIP。

也可在终端转换已有运行：

```bash
npm run import:generated -- \
  --run /path/to/validated-run \
  --output generated/imported.project.json \
  --name '待核对合成图'
```

转换逐项记录导入结果，不覆盖已有工程或报告。部分跳过时仍保存成功样本及报告，但返回非零；只有调用者显式添加 `--allow-skips` 才将部分成功视为成功。所有样本都失败时不创建空工作区。

## 验证

```bash
npx playwright install chromium
npm test
# Linux 缺少浏览器动态库时：npx playwright install-deps chromium

# 生成器自身测试（包含条件启用的字体/渲染集成测试）
VSR_TEXT_TEST_MODULES="$PWD/generator/node_modules" \
  python -m unittest discover -s generator/tests -v
```

生成器测试从 `generator/` 为工作目录时也可直接使用原 README 的命令。部分原版渲染测试依赖显式环境变量，测试中的 skip 不代表已验证；平台端到端验收另用 `npm run generate` 实际渲染并校验九类图，再通过浏览器验证导入、精度、未核对状态、来源、编辑、工作区往返和失败报告。浏览器测试使用独立上下文，不访问用户原有草稿。
