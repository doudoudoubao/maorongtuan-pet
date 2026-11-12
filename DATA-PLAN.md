# Data Plan

## 2026-11-12 edit: 奇遇剧场（多幕分支剧本）
- `搞点复杂场景` (verbatim user request for this edit)
- 新增「奇遇剧场」：5 个多幕分支剧本（雾林寻宝 stage≥1 / 团子逛集市 无门槛 / 月光音乐会 需学会唱歌 / 老树洞的秘密 stage≥3 / 团长巡逻日 stage≥4+巡逻），每剧本 3–4 幕、每幕 2–3 个选择、2–3 种结局 + 专属纪念品。
- 选择带考验（服务端判定）：绝招（唱歌/顶球/眨眼/装睡/围巾舞/巡逻）、探险图鉴收藏（萤火虫/青蛙/金橡子/星星纽扣/月光羽毛当钥匙）、五维门槛（快乐/精力/亲密度）、背包食物消耗（饼干/蛋糕）、毛绒币花费、当天天气（按上海日期哈希的后院天气：晴/微风/多云/毛毛雨，雨天蹚溪失败）。考验过走 success 分支、没过走 fail 分支，剧情都推进；选择积累 flags，结尾按 flags 判定结局。分支可跳幕（雾林循哭声直达第 3 幕、领刺猬出林直接结局）。
- 新表 `scenario_progress`（迁移 0005）：status/step/flags/moves/completions/ending_key/endings_seen，进行中进度落库可续演，同时只进行一个剧本；新动作 startScenario（精力 -15、校验锁与互斥）/ chooseScenario / abandonScenario（放弃保留已完成记录）。完结发结局奖励币/经验与纪念品（写 scenario_end 日志），重演奖励四折、可刷未集结局（结局收集在剧本卡上以徽章展示，未集显示？？？结局）。
- 页面：口令本与后院探险之间新增奇遇剧场区块，顶部带后院天气徽章；进行中显示当前幕剧情 + 上一步结果 + 带考验标签的选择按钮 + 先回家；未进行时是剧本卡片墙（地点/纪念品/锁原因/结局收集/开演或再演按钮）。
- 沙箱实测：《团子逛集市》全程演完——帮摊（亲密度 +2）→ 抽奖（扣 10 币、云朵蛋糕进背包）→ 顶球考验因未学顶球走失败分支（精力 -4）→ flags 判定结局「热心团子」（非集市小明星，因缺 hero flag）→ 奖励 22 币/18 经验到账、endingsSeen 落库；锁定剧本开演被拦（提示长到小毛团）；重演后放弃，status 回 done 且结局收集保留。


## 2026-11-12 edit: 口令本绝招 + 学习系统 + 每日新鲜招/新鲜事
- `姿态动作太少了   不同的口令出现多种意想不到的动作 它也是需要学习的 每天都有新的技能  你每天搜集一些新鲜的事物啥的 赋予给他 每天都是很新鲜的感觉` (verbatim user request for this edit)
- 口令本（新表 `learned_skills`，迁移 0004）：12 招——8 基础（转圈圈/打滚/击掌/装睡/甩耳朵/眨眼放电/顶球/唱歌，幼团可学）+ 4 进阶（蝴蝶结转圈 stage≥2、做梦翻滚/围巾舞 stage≥3、团长巡逻 stage≥4），每招在 TuanScene 有独立动画曲线与粒子（翻滚用 rollZ、巡逻用 offsetX 横移、放电单眼 wink、唱歌张嘴+音符粒子等）。performTrick 按招结算快乐/亲密度/经验、耗少量精力，算一次照顾参与三连招/团长首照顾暴击/幸运日/闪闪发光；口令不进今日任务。
- 学习（learnTrick）：服务端校验阶段门槛与是否已学；成本精力 -10，当天首次学习免毛绒币、之后每招 15 币（页面口令本头部明示）；学成落库 + 经验 +5，日志 kind=skill；表演日志 kind=trick，体验日志 kind=trial_<skillKey>。
- 每日新鲜招 + 每日新鲜事（路径 A，本地池）：FRESH_NEWS 32 条本地文案，每条呼应一个口令（下雨→甩耳朵等）；服务端按 Asia/Shanghai 日期哈希从「当前阶段学得会」的条目里确定性选一条，pet 响应带 freshNews{text,line,source:"local",skillKey,skillName}、dailySkillKey、dailyTrialUsed、learnFreeToday、learnedSkills。新鲜招当天没学会可体验一次（trial 日志记账限一次），已学会当天耍快乐/经验翻倍。如实标注 source=local，不谎称实时新闻。
- 路径 B 预留未做：真实新鲜事需 cron + ctx.agent.spawnTask 搜集后落库（source 改真实来源），本轮不加 refresh_triggers；freshNews.source 字段就是为此留的接口。
- 页面：每日小脾气横幅下并排新增「今日新鲜招」横幅（新鲜事文案 + 团子台词 + 一键体验/学习/耍），口令本区块放在照顾按钮与后院探险之间，格子含已学会/今日新鲜招徽章、锁定阶段提示与学习成本。

## 2026-11-12 edit: 戳一戳震动反应 + 页面瘦身 + 后院探险
- `1.戳他应该有反应的，联动手机的，震动什么的。2.页面文字太多了，做的不够惊喜 3.做的开放一些 开放的养成游戏世界 4.其它的你在发现一下` (verbatim user request for this edit)
- 戳一戳：客户端 `navigator.vibrate` 分级震动（服务端/桌面自动静默）+ 本地立即播放分档动画（爱心→冒火→转圈冒星星），连戳计数由客户端维护并以 `pokeStreak` 传服务端；服务端按四档返回 `reaction` 台词显示在舞台气泡，第 6 下起「戳晕」档不再涨亲密度，正好连戳 10 下掉 8 币彩蛋（kind=surprise 日志）。戳请求走独立串行队列，连点不丢次数。
- 页面瘦身：原「成长惊喜图鉴」整卡 + 「玩法规则」整卡合并为默认折叠的「图鉴与玩法」details（摘要行剧透下一阶解锁），删舞台底部与属性区的说明小字、签到/脾气横幅的解释尾巴，日志只显示最近 8 条。
- 后院探险（开放世界）：新 `explore` action，精力 -10，随机地点 × 随机收获（币/食物/快乐），18% 遇新朋友、12% 挖新宝物；新表 `explore_finds`（迁移 0003）存图鉴收集（6 位小伙伴 + 4 件宝物），pet 响应新增 `finds`，页面有探险区与图鉴格（未收集显示？？？）。
- 顺手加的：进化/惊喜/升级时也有分级震动；照顾按钮轻震 15ms。


## 2026-11-12 edit: 成长惊喜 + 有趣规则
- `每长大有啥惊喜吗？ 养成游戏 规则是啥啊 搞一个有趣规则` (verbatim user request for this edit)
- 每阶进化惊喜（服务端真实生效，非文案）：Lv.3 小毛团「探险鼻子」陪玩 25% 掉 5–12 币 + 3D 呆毛；Lv.6 蓬蓬团「幸运泡泡浴」洗澡 20% 捞出食物 + 蝴蝶结；Lv.10 圆滚团「做梦」哄睡必做梦给奖励 + 3D 小围巾；Lv.15 毛绒团长「团长金光」每日首照顾暴击 + 签到 25 币 + 金星星。进化时客户端弹惊喜弹窗，另有「成长惊喜图鉴」常驻展示已解锁/未解锁。
- 有趣规则三条（均在 doAction 服务端结算，写入培育日志 kind=surprise）：①每日小脾气——按 Asia/Shanghai 日期哈希确定性轮换 6 种（贪吃/运动/泡泡/瞌睡/黏人/幸运），改变对应照顾收益；②照顾连招——按 care_log 最近两次照顾判定，连续三次互不重样第三下 +15 币/+10 经验；③闪闪发光——照顾后五维全 ≥75 奖励 8 币。
- 无 schema 变更：新状态全部由现有列（coins/inv/log）与日期推导，pet 响应新增 dailyTrait 与 action 响应新增 surprise 字段。

## Context provenance
- `毛绒团那个搞个毛绒团养殖系统吧 培育系统 可互动 3D动画等` (prior user statement; defined the breeding system: 五维状态、互动照顾、成长进化、3D 动画)
- `要存档版，我长期养` (current verbatim request; the one change that defines this build — all progress must persist server-side in ctx.db, with stat decay computed from real elapsed time)
- Parent-agent brief: 玩法照搬旧静态版（3D 团子、五种照顾动作、五阶段进化、小卖部、今日任务）+ 旧小屋的表情墙和配字台一并带过来 (assistant proposal already delivered to the user in the parent conversation and accepted by the user's 存档版 reply)
- Prior build handoff (from parent conversation): 旧静态版已实现 Three.js 3D 团子（奶白绒毛球身、黑角、挑眉、腮红、小尖牙，呼吸浮动、眨眼、可拖拽旋转）、五维状态（饱食/快乐/清洁/精力/亲密度，随时间消耗）、毛绒币经济、三样食物小卖部、陪玩/洗澡/特训/哄睡照顾动作与对应 3D 动画、五阶段进化（幼团→小毛团→蓬蓬团→圆滚团→毛绒团长，蓬蓬团起戴蝴蝶结、团长戴金星星）、今日照料任务、培育日志 — 本版按此规格在全栈架构上重建并落库。

## Tested sources
### 旧小屋角色素材（用户自有图片）
**Used by**: 表情墙、配字台、3D 舞台旁的主角图
**Test command**: `gm identify ~/workspace/ts-spaces/mao-rong-tuan-biao-qing-bao-xiao-wu/assets/*.webp`
**Sample output**: sticker-laugh/angry/smug/sleepy/shocked/cry/love/cheer/deadpan.webp 均为 513x513；tuan-main.webp 1600x1600 — 全部为用户此前生成的奶白毛绒团角色图，真实存在且尺寸合格
**Processing**: 构建时把这 10 个 webp 复制进本 artifact 的 `client/src/assets/` 并 import，成为 artifact 自有字节；不引用旧 artifact 的 URL。

### Three.js（3D 引擎）
**Used by**: 3D 培育舱（团子建模、呼吸/眨眼、拖拽旋转、照顾动作动画、粒子特效）
**Test command**: 按 web3d playbook：server-backed 构建用 `bun add three` + `bun add -d @types/three`，从 `three` import（构建期验证）
**Sample output**: playbook 明确 server-backed 构建走 npm 包而非 CDN，保证审计环境可渲染
**Processing**: 纯客户端渲染，无运行时外部请求。

## Long-term data behavior
- **Refresh policy**: 无定时刷新；状态在每次 `getState` / 照顾动作时由服务端按 `last_decay_at` 与当前时刻的真实间隔惰性结算（封顶单次最多结算 24 小时，避免久未打开数值崩坏），Asia/Shanghai 自然日切分每日任务与签到。
- **Growth**: 单只团子（pet_state 单行）+ 培育日志追加写（展示最近 30 条）；背包为固定 3 种食物的计数列。
- **Ordering**: 日志按时间倒序；任务按固定顺序。
- **Time semantics**: 所有时间戳存 UTC epoch ms，衰减与每日重置按 Asia/Shanghai 解释；首次打开由 `getState` 幂等建团（幼团 + 初始毛绒币 + 牛奶×2），不写种子迁移。

## Rejected approaches
- **Tried**: 沿用旧静态版的内存态玩法
  **Why rejected**: 用户明确要存档版长期养，静态页关掉即重置 — 本版改全栈 ctx.db 持久化。
- **Tried**: 每日 cron 定时衰减状态
  **Why rejected**: 惰性结算在读取时按真实间隔算即可，精确且零调度成本；不需要 refresh trigger。
