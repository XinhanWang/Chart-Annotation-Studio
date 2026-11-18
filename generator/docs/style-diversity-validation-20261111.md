# 新旧样式多样性独立验证 — 2026-11-11（新旧独立验证）

新版已在样式 worker 通知稳定后冻结审计；本文区分分布恢复与实际可见结果，不宣称像素等价。主基线为重构前最后提交 `8b2ca381`；history `before-fidelity-v5-20261110.bundle` 指向 `5698d8b`，仅作独立交叉证据。两版 common 和九个 gen 源码相同，native/呈现封装不同，均独立采样和渲染，不用 history 替代主基线。

## 环境与隔离

SSH h.pjlab.org.cn；Python 3.10.12 / NumPy 2.2.5 / Matplotlib 3.10.1 / Pillow；Vega-Lite 6.5.0、Vega 6.4.0、resvg 2.6.2；使用项目 `../.runtime/node` v24.11.0。旧源码 git archive 到自己的 runs 子目录；字体由既有本地资产复制，未联网补字体。Matplotlib 仅隔离验证进程导入。未编辑生产 render/generation/adapter。源码输入前后 hash 在各 provenance.json，不能把全局其他 worker 的改动归因于本审计。

初轮 SSH 默认 Node16 导致 structuredClone 缺失；原始 render-report-initial.json、render-record-initial.json 和日志保留。修正 Node 路径后使用独立 render-report-node24.json；中间一次相对路径错误也保留在 export.log / render-node24 初轮错误记录，不当成有效图。

## 等额请求的自然样本

每类请求 1000；种子 `int.from_bytes(sha256("20261111:{kind}:{index}")[:4], "big") % (2**31-1)`，index=0..999。不补采、不隐藏失败。有效配置总数 8995，异常 5；不是 9000 全成。成功率、取值频率的分母分别是请求数和对应字段 present 数。

|类型|尝试|成功|异常|profile 数|字体数|palette 数|color_mode 数|
|---|---:|---:|---:|---:|---:|---:|---:|
|barh_1|1000|999|1|9|16|30|8|
|barh_n|1000|999|1|9|16|30|8|
|barv_1|1000|998|2|9|16|30|8|
|barv_n|1000|1000|0|9|16|30|8|
|barv_stack|1000|1000|0|9|16|30|8|
|line_1|1000|1000|0|9|16|30|8|
|line_n|1000|999|1|9|16|30|8|
|scatter_1|1000|1000|0|10|16|30|8|
|scatter_n|1000|1000|0|10|16|30|8|

所有错误都是 `ValueError('RGBA values should be within 0-1 range')`；已逐 seed 复现，完整 traceback 在 `natural_1000/sampling-error-replays.json`：

- barh_1-000615：seed=1286830768，原始错误与回放相同。
- barh_n-000381：seed=1050780057，原始错误与回放相同。
- barv_1-000235：seed=1475795776，原始错误与回放相同。
- barv_1-000567：seed=129544621，原始错误与回放相同。
- line_n-000938：seed=869341895，原始错误与回放相同。

history 同规模 9000 请求，8995 成功、5 失败；逐 id 的路径归一化 features/错误差异数：0。这仅支持采样字段一致，不意味着两版 native wrapper 或真实渲染相同。

## 频率、范围和关键组合

每个 cohort 的 `samples.jsonl` 保留逐 seed features，`configs.jsonl.gz` 保留实际完整配置；`statistics.json` 按九类保存所有字段完整频数、缺失数、数值 min/max、分位点和十等宽分箱。组合包括 profile×font、profile×legend_outside×show_legend、profile×grid_visible×grid_axis、family×x_mode、hatch×error、profile×title_weight×title_style。连续值不以 unique 数宣称更丰富。

主自然样本各类 profile 和 color_mode 完整频率：

### barh_1

- profile：{"\"chromatic\"":135,"\"colorful_analytic\"":117,"\"compact_report\"":43,"\"dark_contrast\"":136,"\"dashboard_dense\"":115,"\"editorial\"":86,"\"monochrome_minimal\"":83,"\"presentation_emphasis\"":155,"\"publication_clean\"":129}
- color_mode：{"\"chromatic\"":218,"\"direct\"":158,"\"expanded\"":85,"\"muted\"":40,"\"paired\"":88,"\"random\"":248,"\"sequential\"":154,"\"triadic\"":8}

### barh_n

- profile：{"\"chromatic\"":102,"\"colorful_analytic\"":174,"\"compact_report\"":34,"\"dark_contrast\"":107,"\"dashboard_dense\"":164,"\"editorial\"":107,"\"monochrome_minimal\"":55,"\"presentation_emphasis\"":135,"\"publication_clean\"":121}
- color_mode：{"\"chromatic\"":122,"\"direct\"":166,"\"expanded\"":171,"\"muted\"":94,"\"paired\"":130,"\"random\"":193,"\"sequential\"":104,"\"triadic\"":19}

### barv_1

- profile：{"\"chromatic\"":143,"\"colorful_analytic\"":109,"\"compact_report\"":44,"\"dark_contrast\"":153,"\"dashboard_dense\"":119,"\"editorial\"":90,"\"monochrome_minimal\"":76,"\"presentation_emphasis\"":150,"\"publication_clean\"":114}
- color_mode：{"\"chromatic\"":204,"\"direct\"":145,"\"expanded\"":95,"\"muted\"":36,"\"paired\"":89,"\"random\"":273,"\"sequential\"":148,"\"triadic\"":8}

### barv_n

- profile：{"\"chromatic\"":111,"\"colorful_analytic\"":192,"\"compact_report\"":38,"\"dark_contrast\"":107,"\"dashboard_dense\"":131,"\"editorial\"":99,"\"monochrome_minimal\"":64,"\"presentation_emphasis\"":141,"\"publication_clean\"":117}
- color_mode：{"\"chromatic\"":131,"\"direct\"":191,"\"expanded\"":162,"\"muted\"":76,"\"paired\"":132,"\"random\"":176,"\"sequential\"":114,"\"triadic\"":18}

### barv_stack

- profile：{"\"chromatic\"":96,"\"colorful_analytic\"":170,"\"compact_report\"":37,"\"dark_contrast\"":127,"\"dashboard_dense\"":140,"\"editorial\"":114,"\"monochrome_minimal\"":50,"\"presentation_emphasis\"":135,"\"publication_clean\"":131}
- color_mode：{"\"chromatic\"":109,"\"direct\"":176,"\"expanded\"":204,"\"muted\"":65,"\"paired\"":126,"\"random\"":181,"\"sequential\"":116,"\"triadic\"":23}

### line_1

- profile：{"\"chromatic\"":107,"\"colorful_analytic\"":197,"\"compact_report\"":40,"\"dark_contrast\"":127,"\"dashboard_dense\"":166,"\"editorial\"":91,"\"monochrome_minimal\"":55,"\"presentation_emphasis\"":105,"\"publication_clean\"":112}
- color_mode：{"\"chromatic\"":200,"\"direct\"":165,"\"expanded\"":75,"\"muted\"":34,"\"paired\"":80,"\"random\"":241,"\"sequential\"":154,"\"triadic\"":51}

### line_n

- profile：{"\"chromatic\"":118,"\"colorful_analytic\"":210,"\"compact_report\"":40,"\"dark_contrast\"":115,"\"dashboard_dense\"":143,"\"editorial\"":84,"\"monochrome_minimal\"":46,"\"presentation_emphasis\"":121,"\"publication_clean\"":122}
- color_mode：{"\"chromatic\"":156,"\"direct\"":149,"\"expanded\"":123,"\"muted\"":26,"\"paired\"":118,"\"random\"":206,"\"sequential\"":122,"\"triadic\"":99}

### scatter_1

- profile：{"\"chromatic\"":112,"\"colorful_analytic\"":185,"\"compact_report\"":31,"\"dark_contrast\"":79,"\"dashboard_dense\"":123,"\"dense_scatter_family\"":181,"\"editorial\"":72,"\"monochrome_minimal\"":46,"\"presentation_emphasis\"":78,"\"publication_clean\"":93}
- color_mode：{"\"chromatic\"":205,"\"direct\"":165,"\"expanded\"":75,"\"muted\"":18,"\"paired\"":99,"\"random\"":240,"\"sequential\"":148,"\"triadic\"":50}

### scatter_n

- profile：{"\"chromatic\"":127,"\"colorful_analytic\"":162,"\"compact_report\"":34,"\"dark_contrast\"":80,"\"dashboard_dense\"":129,"\"dense_scatter_family\"":188,"\"editorial\"":65,"\"monochrome_minimal\"":53,"\"presentation_emphasis\"":71,"\"publication_clean\"":91}
- color_mode：{"\"chromatic\"":161,"\"direct\"":119,"\"expanded\"":176,"\"muted\"":27,"\"paired\"":128,"\"random\"":195,"\"sequential\"":83,"\"triadic\"":111}

## 实际渲染与图库

|cohort|选择口径|选择数|旧Matplotlib PNG|旧Vega-Lite PNG|rendered|review|rejected|
|---|---|---:|---:|---:|---:|---:|---:|
|natural_1000|每类16，按覆盖从自然样本确定选取|144|144|144|144|0|0|
|random_4|每类4个未经特征选择的确定随机样本|36|36|36|36|0|0|
|targeted_14|每类14个显式控制，和自然频率分开|126|126|126|126|0|0|

自然覆盖样本与 random_4 可能重叠；上述数字是 cohort 渲染次数，不是独立图像去重数。targeted_14 包含 profile、图例列数/阴影、bar hatch 和 error 开关；未支持的视觉效果不能以配置存在宣称生效。新版本需严格使用同三组配额和种子协议，同类型/维度展示可能不同数据，不要求像素相同。

`show_error` 是误差可见请求；误差数组存在单独记 has_error_values。8 个旧 Matplotlib show_error True/False 探针直接检查 ErrorbarContainer/可见线段/端帽，8/8 通过。Vega scenegraph 几何 `error_*` drawable counts 与 show_error 不符的样本数 0（详见 baseline-summary.json，出现差异必须保留）。

rendered-evidence.json 保留实际 tick direction/length/width、title 字体 face/weight/style、图片 hash、尺寸、renderer status 和几何 mark counts。标题 requested weight/style 与实际字体 face 分开：指定 regular/bold 字体文件可能限制最终字重，不能只看采样值。tick contact 来自渲染阶段 snapshot，不把仅配置采样视作可见成功。

交付 `deliveries/style_diversity_audit_20261111/old/gallery_embedded.html`：独立内嵌全部实际图片。九个 `type_*.png`、七个 `dimension_*.png` 覆盖 profile/palette、字体、标题、图例、网格边框、marks/errors、ticks；contact 是旧 direct Matplotlib 真实渲染，HTML 同时展示旧 Vega-Lite。图中文字过小可用 HTML 查看原分辨率。所有图片经 Pillow verify，人工已打开本地标题 contact；未声称逐图完成视觉验收。

## 复现与新版入口

```sh
python3 diagnostics/style_diversity_audit_20261111.py --source runs/style_diversity_audit_20261111/baseline_8b2ca381/source --out runs/style_diversity_audit_20261111/replay_NEW_DIRECTORY --count 1000 --render-per-kind 16 --node ../.runtime/node
python3 diagnostics/style_diversity_audit_20261111.py --mode new --source . --out runs/style_diversity_audit_20261111/new_READY_SNAPSHOT/natural_1000 --count 1000 --render-per-kind 16 --node ../.runtime/node
```

新版先冻结源码和字体及 hash，待 worker 通知后运行；另以 --count 4 --render-per-kind 4 --random-render 和 --count 14 --render-per-kind 14 --targeted 生成匹配辅助 cohort。--compare OLD_COHORT NEW_COHORT --out NEW_COMPARISON_DIRECTORY 可生成字段/组合对照及按类型/维度 HTML；它不代替 contact 视觉审查。任何旧字段缺失/新字段新增、自然低频零命中、渲染不支持，都应保留而非强行归为等价。

## 新版实际结果

冻结源码及字体见 `runs/style_diversity_audit_20261111/new_1_1/source` 与 `snapshot-hashes.json`。九类各 1000 次请求，逐类成功数见下表；失败保留原始错误。自然统计与旧版使用同一种子协议和请求配额。

|类型|旧成功/请求|新成功/请求|旧/新 palette unique|旧/新 color_mode unique|profile TV|font TV|
|---|---:|---:|---:|---:|---:|---:|
|barh_1|999/1000|1000/1000|30/30|8/8|0.0484|0.0706|
|barh_n|999/1000|1000/1000|30/30|8/8|0.0278|0.0575|
|barv_1|998/1000|1000/1000|30/30|8/8|0.0430|0.0731|
|barv_n|1000/1000|1000/1000|30/30|8/8|0.0570|0.0630|
|barv_stack|1000/1000|1000/1000|30/30|8/8|0.0270|0.0590|
|line_1|1000/1000|1000/1000|30/30|8/8|0.0450|0.0710|
|line_n|999/1000|1000/1000|30/30|8/8|0.0476|0.0715|
|scatter_1|1000/1000|1000/1000|30/30|8/8|0.0410|0.0580|
|scatter_n|1000/1000|1000/1000|30/30|8/8|0.0390|0.0590|

TV 为实际频率总变差，0 表示本样本频率完全一致；没有把近似频率当成分布相同的统计证明。1000 次/类对很低频组合仍可能漏采。完整频率对照 `deliveries/style_diversity_audit_20261111/comparison/key-frequency-comparison.json`，全字段范围/组合对照 `runs/style_diversity_audit_20261111/comparison_natural/comparison.json`。

新版渲染 cohort：

```json
{
  "natural_1000": {
    "attempted": 9000,
    "failed": 0,
    "selected": 144,
    "source_unchanged": true,
    "render_report": {
      "total": 144,
      "rendered": 144,
      "review_required": 0,
      "rejected": 0
    }
  },
  "random_4": {
    "attempted": 36,
    "failed": 0,
    "selected": 36,
    "source_unchanged": true,
    "render_report": {
      "total": 36,
      "rendered": 36,
      "review_required": 0,
      "rejected": 0
    }
  },
  "targeted_14": {
    "attempted": 126,
    "failed": 0,
    "selected": 126,
    "source_unchanged": true,
    "render_report": {
      "total": 126,
      "rendered": 125,
      "review_required": 1,
      "rejected": 0
    }
  }
}
```

实际对比图库：`deliveries/style_diversity_audit_20261111/comparison/gallery_embedded.html` 独立内嵌图片；九个 type contacts 使用相同随机配额，七个 dimension contacts 按实际维度值配对，左旧 Matplotlib、右新 Vega-Lite。`contact-manifest.json` 记录每张图来源。未命中的维度不伪造匹配；自然覆盖样本与随机样本可能重复。

剩余差异：字体真实角色/缺失变体见 worker 报告；old Matplotlib 的 tight_layout/ticks/sci 格式、legend shadow 与 hatch 在 VL 中的可见映射差异需结合真图判断。不同数据和布局算法意味着图像不应像素相同。尚未进行逐图人工验收。新辅助 cohort 首轮 Node 相对路径失败完整保留 `*-aborted-node-path` 和原日志，使用绝对 Node 路径后重跑，未删除原始失败。

## 最终验证、接受边界与冻结 hash

当前生产 generation、assets（33 faces）、字体许可证、adapter/presentation/render/font_embedding 等与本次最终渲染副本逐文件 hash 一致，差异 0。聚合 SHA-256：`c5b8c224e655eb7dd936453a233f4251e530359e5d0ee629fc79fa2cba843623`；完整逐文件清单及主旧 git 完整提交见 `deliveries/style_diversity_audit_20261111/comparison/frozen-hashes.json`。采样初始 snapshot-hashes.json 和最终补齐许可证/renderer 的 render-snapshot-final-hashes.json 均保留；补齐资源没有改变采样配置。

实际 old/new 渲染各 306 次（自然覆盖144、随机36、定向126），不是独立样本去重数量。旧版 306 rendered / 0 review / 0 rejected；新版 305 rendered / 1 review / 0 rejected。新自然覆盖144/144和随机36/36 rendered；定向125 rendered、1 review_required、0 rejected；不能宣传辅助162/162质量门全过。

唯一 review：`new_1_1/targeted_14/rendered/line_1-000001`，seed=190142175。full 警告 `Data-mark bounds intersect an active plot clip`；`mark_1:0` 是 `reference_y_0_marks`，y=0，实际 y 域下界0.34264，因此零参考线在可见域外触发裁剪检测；主 line mark 未被该检查列为裁剪。compact 通过。此图及完整警告、几何保留在 `review-required.json` 和源样本目录，属于审计证据，未接受为质量门通过；未改生产消除该提示。

已检查 dark `new_1_1/random_4/line_n-000002` 原图（1068×432)：文字和曲线可辨，缩略图更细更小；SVG文字字号频数 {"11px":16,"12px":2,"13px":1}。这只是此原图的观察，不能推广为所有图全面可读性通过，不需为缩略图修改生产。旧 Matplotlib 高DPI英寸画布与VL物理/像素尺寸映射、字体/线宽在contact缩放下视觉不同；本审计没有完成全体物理字号等价证明。

新版显示全部 categorical labels，旧版渲染常 thinning；因此长标签/高类别数会占更大空间并压缩 plot，不能把这种视觉差别自动认定为多样性退化或完美复刻。对比使用不同数据、同类型/同配额及部分维度匹配，不要求同种子像素一致。

旧版部分 bar 无 show_error：缺失为 null/unknown，不作 False；has_error_values 仅表示误差数组。实际 error_* drawable mark 与旧8探针提供可见性证据；仅有 show_error 时才比较 requested/actual。legend_shadow requested、font角色可用性等也不可仅凭配置宣布可见成功。

最终16张contact通过Pillow verify，独立HTML的 324 个图片引用均为内嵌 data URI；报告与图库保留单个review，不等同逐图人工验收。
