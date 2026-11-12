// Actions for 毛绒团培育小屋 — the persistent (存档版) breeding system.
//
// The whole save lives in one pet_state row (id = 1) plus an append-only
// care_log. Stats decay lazily: every read/write first settles the pet
// against real elapsed time (capped at 24h per settle), so the团子 the
// user comes back to tomorrow really did get hungry overnight.

import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "./schema";

type PetRow = typeof schema.petState.$inferSelect;
type Db = ReturnType<Ctx["db"]>;

const STAGE_NAMES = ["幼团", "小毛团", "蓬蓬团", "圆滚团", "毛绒团长"];

// 每日小脾气：按上海日期确定性轮换，每天一种，照顾效果跟着变。
const DAILY_TRAITS = [
  { id: "greedy", name: "贪吃日", desc: "满脑子都是吃的：喂食快乐翻倍、经验 +50%" },
  { id: "sporty", name: "运动日", desc: "精力旺盛：特训经验翻倍，陪玩快乐额外 +8" },
  { id: "bubble", name: "泡泡日", desc: "超爱干净：洗澡清洁直接拉满，亲密度额外 +3" },
  { id: "sleepy", name: "瞌睡日", desc: "只想睡觉：哄睡精力 +50（平时 +35），经验额外 +5" },
  { id: "clingy", name: "黏人日", desc: "特别黏你：戳一戳亲密度 +3、快乐 +6（平时 +1 / +3）" },
  { id: "lucky", name: "幸运日", desc: "运气爆棚：每次照顾都有 30% 概率掉落 6–10 毛绒币" },
] as const;

function traitForDate(dateStr: string) {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = (h * 31 + (dateStr.charCodeAt(i) ?? 0)) >>> 0;
  return DAILY_TRAITS[h % DAILY_TRAITS.length] ?? DAILY_TRAITS[0];
}

const CARE_KINDS = ["feed", "play", "bath", "train", "sleep", "poke"] as const;

// 后院探险：能遇见的小伙伴和能找到的宝物（图鉴收集）。
const EXPLORE_FRIENDS = [
  { key: "hedgehog", name: "刺猬阿针" },
  { key: "firefly", name: "萤火虫小灯" },
  { key: "orangecat", name: "橘猫阿橘" },
  { key: "turtle", name: "乌龟慢慢" },
  { key: "squirrel", name: "松鼠阿松" },
  { key: "frog", name: "青蛙呱呱" },
] as const;

const EXPLORE_TREASURES = [
  { key: "acorn", name: "金橡子" },
  { key: "shell", name: "彩虹贝壳" },
  { key: "button", name: "星星纽扣" },
  { key: "feather", name: "月光羽毛" },
] as const;

const EXPLORE_PLACES = [
  "草丛里",
  "花坛边",
  "小溪边",
  "老树洞前",
  "屋顶上",
  "菜园子里",
  "石板路上",
  "云朵秋千旁",
] as const;

// 口令本（绝招目录）：8 个基础口令幼团就能学，4 个进阶口令按进化阶段解锁。
// minStage 是进化阶段下标（0 幼团 / 2 蓬蓬团 / 3 圆滚团 / 4 毛绒团长）。
const SKILLS = [
  { key: "spin", name: "转圈圈", minStage: 0, desc: "原地转一整圈，绒毛转出小旋风", line: "转圈圈！看我的小旋风！", happy: 8, intimacy: 1, xp: 8, energy: 3 },
  { key: "roll", name: "打滚", minStage: 0, desc: "抱着肚子滚一圈，落地还要赖一下", line: "滚呀滚，滚成一颗汤圆！", happy: 9, intimacy: 1, xp: 9, energy: 4 },
  { key: "highfive", name: "击掌", minStage: 0, desc: "高高跳起来跟你击掌", line: "击掌！耶——默契满分！", happy: 7, intimacy: 3, xp: 8, energy: 3 },
  { key: "playsleep", name: "装睡", minStage: 0, desc: "秒躺装睡，偷看你一眼又猛地蹦起来", line: "呼…呼…嘿嘿，骗到你了吧！", happy: 6, intimacy: 1, xp: 7, energy: 2 },
  { key: "earshake", name: "甩耳朵", minStage: 0, desc: "脑袋甩得像小风扇，耳朵呼呼响", line: "甩甩甩！烦恼全甩掉！", happy: 8, intimacy: 1, xp: 7, energy: 3 },
  { key: "wink", name: "眨眼放电", minStage: 0, desc: "单眼一眨，附赠一颗小爱心", line: "看招——啾！电到你没有？", happy: 9, intimacy: 3, xp: 8, energy: 3 },
  { key: "balltop", name: "顶球", minStage: 0, desc: "拿脑袋连顶三下空气球，不落地", line: "一、二、三！球呢？球在我头上！", happy: 10, intimacy: 1, xp: 10, energy: 5 },
  { key: "sing", name: "唱歌", minStage: 0, desc: "摇头晃脑唱一段，跑调也自信", line: "啦啦啦——这是我新学的调调！", happy: 11, intimacy: 2, xp: 10, energy: 4 },
  { key: "bowspin", name: "蝴蝶结转圈", minStage: 2, desc: "戴着蝴蝶结连转两圈，裙摆一样飘", line: "蝴蝶结转圈——漂亮吧！", happy: 12, intimacy: 2, xp: 14, energy: 5 },
  { key: "dreamroll", name: "做梦翻滚", minStage: 3, desc: "闭着眼边做梦边翻滚，嘴里还念叨蛋糕", line: "梦里……蛋糕山……滚过去吃……", happy: 12, intimacy: 2, xp: 14, energy: 4 },
  { key: "scarfdance", name: "围巾舞", minStage: 3, desc: "围着小围巾左右摇摆，舞步自成一派", line: "围巾舞开跳，左边右边一起摇！", happy: 13, intimacy: 2, xp: 14, energy: 5 },
  { key: "patrol", name: "团长巡逻", minStage: 4, desc: "迈着方步巡逻小屋，路过还要点头检阅", line: "团长巡逻中——一切正常，解散！", happy: 10, intimacy: 2, xp: 16, energy: 5 },
] as const;

function skillByKey(key: string) {
  return SKILLS.find((s) => s.key === key);
}

// 每日新鲜事（本地文案池，source 固定标 "local"，不谎称实时新闻）：每条呼应一个
// 口令——新鲜事提到下雨，今日新鲜招就偏向「甩耳朵」甩干雨点。按上海日期哈希
// 从「当前阶段学得会」的条目里确定性选一条，所以每天打开都是新的一条，且当天
// 反复打开不变。预留 source 字段：以后接 ctx.agent.spawnTask 定时搜集真实新鲜事
// 时，把选中的条目落库、source 改成对应来源即可，客户端不用改。
const FRESH_NEWS = [
  { text: "今天后院飘起了毛毛雨，团子站在屋檐下看了好久", line: "下雨也不怕，我会甩干雨点！", skillKey: "earshake" },
  { text: "雨过天晴，草尖上全是亮晶晶的水珠", line: "水珠甩起来，像下了场小星星雨！", skillKey: "earshake" },
  { text: "一只蝴蝶在花坛上盘旋，翅膀是橘色的", line: "追蝴蝶要转着圈追，才不晕！", skillKey: "spin" },
  { text: "风把一片大叶子吹到了垫子上，像张绿色小毯子", line: "躺叶子上打个滚，舒服！", skillKey: "roll" },
  { text: "隔壁橘猫阿橘今天来串门，在篱笆外坐了一上午", line: "见到朋友，当然要击个掌！", skillKey: "highfive" },
  { text: "午后太阳暖烘烘的，云朵飘得特别慢", line: "这种天气，最适合装睡骗点心了。", skillKey: "playsleep" },
  { text: "清晨有只小鸟在窗外唱歌，唱一句停一句", line: "它唱一句我学一句，看谁先跑调！", skillKey: "sing" },
  { text: "萤火虫小灯昨晚讲了个亮晶晶的故事", line: "我也会发光——看我眨眼放电！", skillKey: "wink" },
  { text: "松鼠阿松在树上往下扔橡子玩，接住三个才算赢", line: "扔给我！我用脑袋顶，稳得很！", skillKey: "balltop" },
  { text: "院子里新开了一小片野花，粉的白的都有", line: "开花的日子，要转圈庆祝！", skillKey: "spin" },
  { text: "乌云散了，晚霞把半边天染成橘子色", line: "这么好看的天，唱首歌配一下。", skillKey: "sing" },
  { text: "乌龟慢慢今天爬完了整个后院，创了它的新纪录", line: "慢慢来也能赢，击掌庆祝一下！", skillKey: "highfive" },
  { text: "一阵大风把晾着的小手帕吹得猎猎响", line: "风再大，也吹不晕我的小旋风！", skillKey: "spin" },
  { text: "今天的云朵有一朵长得像棉花糖，还有一朵像小鱼", line: "看云看困了，先装睡一小会儿。", skillKey: "playsleep" },
  { text: "青蛙呱呱在池塘边开了独唱会，观众只有荷叶", line: "下次我去给它伴唱，合唱团成立！", skillKey: "sing" },
  { text: "露水把蜘蛛网缀成了项链，闪闪发亮", line: "亮晶晶的东西，我最会眨眼配合了。", skillKey: "wink" },
  { text: "有颗熟透的果子从树上掉下来，骨碌碌滚了好远", line: "滚得没我标准，看我的！", skillKey: "roll" },
  { text: "小鸟衔来一根特别直的树枝，放在了门口", line: "这是送我的指挥棒？那我唱一首！", skillKey: "sing" },
  { text: "今天有只蜜蜂绕着团子飞了三圈，像在跳舞", line: "它跳三圈，我跳四圈，不能输！", skillKey: "spin" },
  { text: "雨水在石板路上积了个小水洼，照得见天空", line: "水洼里也有个团子，它也会甩耳朵！", skillKey: "earshake" },
  { text: "蝴蝶结被风吹得飘起来，像只小粉鸟", line: "蝴蝶结都想跳舞了，转起来！", skillKey: "bowspin" },
  { text: "花坛里最大的那朵花今天完全打开了", line: "为这朵花，转两圈表示祝贺！", skillKey: "bowspin" },
  { text: "晾衣绳上的小围巾晾干了，闻起来是太阳的味道", line: "围巾一戴，舞步自来！", skillKey: "scarfdance" },
  { text: "起风了，围巾角被吹得一飘一飘的", line: "跟着风跳围巾舞，正好合拍！", skillKey: "scarfdance" },
  { text: "昨晚的月亮特别圆，照得院子亮堂堂的", line: "月亮底下做的梦，翻滚起来都带光。", skillKey: "dreamroll" },
  { text: "团子午睡时听见了远处的雷声，闷闷的像鼓点", line: "鼓点响起来，梦里也要翻个跟头！", skillKey: "dreamroll" },
  { text: "新来的小团子们今天列队参观小屋，排得还挺齐", line: "团长要巡逻检阅，步子得迈方正了。", skillKey: "patrol" },
  { text: "篱笆边新搭了个小瞭望台，站上去能看见整条小路", line: "瞭望台归团长巡逻范围，收到！", skillKey: "patrol" },
  { text: "今天大家把落叶扫成了一小堆，金黄金黄的", line: "巡逻完毕，最后在落叶堆上打个滚！", skillKey: "patrol" },
  { text: "后院的秋千吱呀吱呀晃了一下午，没人推它", line: "是风在荡秋千！我给它击掌加油。", skillKey: "highfive" },
  { text: "一颗蒲公英飘过窗前，种子像小伞兵", line: "小伞兵慢降落，我原地转圈迎接！", skillKey: "spin" },
  { text: "今早的雾很浓，站在垫子上看不见自己的脚尖", line: "看不见脚尖没关系，闭眼放电照样准。", skillKey: "wink" },
] as const;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + (s.charCodeAt(i) ?? 0)) >>> 0;
  return h;
}

// 今日新鲜事 + 今日新鲜招：同一日期种子选条目，招和事天然呼应；只从当前
// 阶段学得会的口令里选，保证新鲜招当天真的能体验/学习。
function dailyFresh(stage: number, dateStr: string) {
  const eligible = FRESH_NEWS.filter((n) => (skillByKey(n.skillKey)?.minStage ?? 99) <= stage);
  const pool = eligible.length > 0 ? eligible : [...FRESH_NEWS];
  const item = pool[hashStr(`${dateStr}:fresh`) % pool.length] ?? pool[0];
  if (!item) throw new Error("新鲜事池是空的");
  return item;
}

// 戳一戳分级反应：连戳越多，团子越「有意见」。
const POKE_LINES = [
  ["嘿嘿，好痒~", "干嘛戳我，怪不好意思的", "戳到啦！软不软？", "嗯？叫我干嘛"],
  ["又戳！再戳要收费了哦", "戳上瘾了是吧…", "嘿，你的手不酸吗"],
  ["够了够了！腮红要被戳掉了", "再戳我就……我就……哼！", "救命，有人欺负团子！"],
  ["眼前全是小星星…", "晕了晕了，世界在转圈圈…", "我投降，投降还不行嘛"],
] as const;

function pokeTier(streak: number): number {
  if (streak >= 6) return 3;
  if (streak >= 4) return 2;
  if (streak >= 2) return 1;
  return 0;
}

const DREAMS = [
  { text: "梦见了一块会飞的云朵蛋糕，醒来还吧唧嘴", satiety: 8, coins: 0, xp: 4 },
  { text: "梦见自己捡到一串星星，醒来枕边真有毛绒币", satiety: 0, coins: 9, xp: 4 },
  { text: "梦见变成团长指挥一群小团子列队，威风极了", satiety: 0, coins: 0, xp: 10 },
  { text: "梦见泡在牛奶温泉里，浑身香喷喷", satiety: 4, coins: 0, xp: 4 },
] as const;

// ——— 奇遇剧场：多幕分支剧本 ———
// 每个剧本 3–4 幕，每幕 2–3 个选择。选择可以带「考验」：绝招 / 图鉴收藏 /
// 五维数值 / 背包食物 / 毛绒币 / 当天天气——考验过了走 success 分支，没过
// 走 fail 分支（剧情照样推进，只是滋味不同）。选择积累 flags，走到结尾时
// 按 flags 判定结局（每剧本 2–3 种）。进度存 scenario_progress，关掉重开
// 接着演；演完能重演刷别的结局（重演奖励 40%）。
type ScenarioEffect = {
  coins?: number;
  xp?: number;
  happiness?: number;
  satiety?: number;
  energy?: number;
  cleanliness?: number;
  intimacy?: number;
  invMilk?: number;
  invCookie?: number;
  invCake?: number;
  setFlags?: string[];
};
type ScenarioCheck =
  | { type: "skill"; key: string }
  | { type: "find"; key: string }
  | { type: "stat"; stat: "intimacy" | "happiness" | "energy" | "cleanliness" | "satiety"; min: number }
  | { type: "item"; food: "milk" | "cookie" | "cake" }
  | { type: "coins"; amount: number }
  | { type: "weatherDry" };
type ScenarioOutcome = { text: string; effects?: ScenarioEffect; next: number | "end" };
type ScenarioChoice = {
  id: string;
  label: string;
  check?: ScenarioCheck;
  success: ScenarioOutcome;
  fail?: ScenarioOutcome;
};
type ScenarioStep = {
  title: string;
  text: string | ((flags: readonly string[]) => string);
  choices: ScenarioChoice[];
};
type ScenarioDef = {
  key: string;
  name: string;
  place: string;
  desc: string;
  intro: string;
  minStage: number;
  requireSkill?: string;
  keepsake: string;
  steps: ScenarioStep[];
  endings: { key: string; name: string; text: string; rewardCoins: number; rewardXp: number; when: (flags: readonly string[]) => boolean }[];
};

const SCENARIOS: ScenarioDef[] = [
  {
    key: "misty-forest",
    name: "雾林寻宝",
    place: "后院尽头的雾林",
    desc: "雾里有哭声也有亮光，跟着哪边走，故事完全不一样。",
    intro: "雾林的雾今天格外浓，团子背上小包，站在林口深吸一口气——出发！",
    minStage: 1,
    keepsake: "雾光松果",
    steps: [
      {
        title: "林口的岔路",
        text: "刚进雾林就起了岔路：左边飘来断断续续的哭声，右边有一点亮光在树影里一闪一闪。",
        choices: [
          {
            id: "to-sound",
            label: "循着哭声走",
            success: { text: "拨开雾气，哭声越来越近——是迷路的小伙伴！", effects: { setFlags: ["to_sound"] }, next: 2 },
          },
          {
            id: "to-light",
            label: "追着亮光走",
            check: { type: "find", key: "firefly" },
            success: { text: "是萤火虫小灯！老朋友见面，它主动飞到前头带路，雾都显得亮堂了。", effects: { happiness: 6, setFlags: ["firefly_guide"] }, next: 1 },
            fail: { text: "亮光是挂在树梢的露水珠，晃了一路才发现追错了，白跑一截。", effects: { energy: -4 }, next: 1 },
          },
        ],
      },
      {
        title: "涨水的小溪",
        text: "一条小溪横在路中间，水比平时深。溪对面隐约有个小土包，包上插着面褪色的小旗。",
        choices: [
          {
            id: "wade",
            label: "蹚水过溪",
            check: { type: "weatherDry" },
            success: { text: "水只到肚皮，蹚过去抖抖水就干了——小旗下面埋着个旧铁盒！", effects: { cleanliness: -8, setFlags: ["iron_box"] }, next: 3 },
            fail: { text: "今天溪水涨得急，一个小浪把团子推回岸边，浑身湿透，只好绕远路。", effects: { cleanliness: -18, energy: -5 }, next: 2 },
          },
          {
            id: "bridge",
            label: "找独木桥慢慢过",
            success: { text: "上游有根倒下的老树干，团子屏住呼吸挪过去，稳稳当当。", effects: { energy: -5, setFlags: ["careful"] }, next: 2 },
          },
        ],
      },
      {
        title: "哭声的主人",
        text: "灌木丛后缩着一只小刺猬，背上扎着片大叶子，原来是刺猬阿针——它采蘑菇迷了路，急得直掉眼泪。",
        choices: [
          {
            id: "sing-comfort",
            label: "唱首歌安慰它",
            check: { type: "skill", key: "sing" },
            success: { text: "一首跑调的歌把阿针逗笑了，眼泪还没干就跟着哼起来，俩团子成了朋友。", effects: { happiness: 8, intimacy: 3, setFlags: ["helped_friend"] }, next: 3 },
            fail: { text: "团子张了张嘴，发现这门本事还没学会，只好拍拍阿针的叶子陪它坐了一会儿。", effects: { intimacy: 2, setFlags: ["helped_friend"] }, next: 3 },
          },
          {
            id: "share-cookie",
            label: "分它一块星星饼干",
            check: { type: "item", food: "cookie" },
            success: { text: "阿针小口小口吃完饼干，眼睛亮起来，非要把最大的一朵蘑菇塞进团子的包里。", effects: { intimacy: 4, setFlags: ["helped_friend", "mushroom_gift"] }, next: 3 },
            fail: { text: "摸了摸背包——星星饼干没带！阿针懂事地摇头说没关系，团子心里有点过意不去。", effects: { setFlags: ["helped_friend"] }, next: 3 },
          },
          {
            id: "lead-way",
            label: "直接领它出林",
            success: { text: "团子凭着来路的记号把阿针领到林口，挥手告别，各回各家。", effects: { intimacy: 2, setFlags: ["helped_friend"] }, next: "end" },
          },
        ],
      },
      {
        title: "雾散之前",
        text: (flags) =>
          flags.includes("iron_box")
            ? "雾开始散了。临走前，团子想起小溪边那个旧铁盒，盖子锈得紧紧的。"
            : "雾开始散了。林子深处有一棵老松树，树洞里好像藏着什么亮亮的东西。",
        choices: [
          {
            id: "open-box",
            label: "打开旧铁盒 / 掏树洞",
            check: { type: "find", key: "button" },
            success: { text: "星星纽扣正好卡进铁盒的锁眼——咔哒！里面是一小堆毛绒币和一颗会发微光的松果！", effects: { coins: 24, setFlags: ["treasure"] }, next: "end" },
            fail: { text: "盒子纹丝不动，树洞也只摸到一把干草。不过爪子带出了一颗沾着雾气的松果，凉凉的，很好看。", effects: { setFlags: ["pinecone_only"] }, next: "end" },
          },
          {
            id: "head-home",
            label: "趁雾散赶紧回家",
            success: { text: "踩着夕阳跑回小屋，这一趟的故事够讲一整个晚上了。", effects: { happiness: 5 }, next: "end" },
          },
        ],
      },
    ],
    endings: [
      {
        key: "big-winner",
        name: "雾林大赢家",
        text: "又交了朋友又挖到宝，这一趟雾林之行满载而归！",
        rewardCoins: 40,
        rewardXp: 30,
        when: (f) => f.includes("treasure") && f.includes("helped_friend"),
      },
      {
        key: "warm-way-home",
        name: "温暖回家路",
        text: "宝物不宝物的另说，林子里多了一个会等它的朋友。",
        rewardCoins: 25,
        rewardXp: 20,
        when: (f) => f.includes("helped_friend"),
      },
      {
        key: "fog-clears",
        name: "雾散了",
        text: "雾散了，林子还是那片林子，但团子走过一遍，胆子大了一圈。",
        rewardCoins: 15,
        rewardXp: 12,
        when: () => true,
      },
    ],
  },
  {
    key: "market-day",
    name: "团子逛集市",
    place: "山脚下的周末集市",
    desc: "好吃的、抽奖的、卖艺的，口袋里的币和肚子总要先紧着一个。",
    intro: "集市的吆喝声老远就听见了，团子把毛绒币揣好，一头扎进人堆里。",
    minStage: 0,
    keepsake: "彩带气球",
    steps: [
      {
        title: "先逛哪摊",
        text: "一进集市三家摊子同时招手：热乎的糖炒栗子、围了一圈人的杂耍班、还有个收摊打折的旧货摊。",
        choices: [
          {
            id: "buy-snack",
            label: "买包糖炒栗子（15 币）",
            check: { type: "coins", amount: 15 },
            success: { text: "栗子烫手又香甜，边走边吃，集市都变甜了。", effects: { satiety: 12, happiness: 6, setFlags: ["snack"] }, next: 1 },
            fail: { text: "摸了摸口袋——币不够！摊主爷爷笑着抓了一小把塞过来：下次补上。", effects: { satiety: 6, setFlags: ["owed_favor"] }, next: 1 },
          },
          {
            id: "watch-show",
            label: "挤进去看杂耍",
            success: { text: "小猴翻跟头翻得团子直拍爪子，还被邀请上台顶了下球，全场喝彩。", effects: { happiness: 10, setFlags: ["show"] }, next: 1 },
          },
          {
            id: "help-stall",
            label: "帮旧货摊大婶扶摊子",
            success: { text: "风把摊布吹歪了，团子用圆身子压住一角，帮大婶稳稳支好摊。", effects: { intimacy: 2, setFlags: ["helped_stall"] }, next: 1 },
          },
        ],
      },
      {
        title: "抽奖摊",
        text: "「抽一次 10 币，大奖是整块云朵蛋糕！」摊主摇着签筒。团子盯着那块蛋糕，咽了口口水。",
        choices: [
          {
            id: "draw",
            label: "抽一次试试手气（10 币）",
            check: { type: "coins", amount: 10 },
            success: {
              text: "签筒一摇——大奖签！摊主瞪圆眼睛把云朵蛋糕捧了出来，全集市都看过来了。",
              effects: { invCake: 1, setFlags: ["prize"] },
              next: 2,
            },
            fail: { text: "口袋比脸还干净，抽不了。不过摊主送了根棒棒糖安慰签，舔着也甜。", effects: { happiness: 3 }, next: 2 },
          },
          {
            id: "draw-lucky",
            label: "闭眼抽，赌一把好运",
            check: { type: "stat", stat: "happiness", min: 60 },
            success: { text: "快乐的人运气不会差——二等奖！一瓶热牛奶到手，摊主直呼内行。", effects: { invMilk: 1, setFlags: ["lucky_draw"] }, next: 2 },
            fail: { text: "抽了张「谢谢惠顾」，团子把签纸折成小帽子戴头上，也算没白来。", effects: { happiness: 2 }, next: 2 },
          },
          {
            id: "skip-draw",
            label: "捂紧口袋，不抽",
            success: { text: "团子对蛋糕行了个注目礼，转身走得头也不回——摊主在背后喊了句「有定力」。", effects: { setFlags: ["saved"] }, next: 2 },
          },
        ],
      },
      {
        title: "飞走的气球",
        text: "一阵大风刮过，气球摊的一串气球全飞上了天！摊主奶奶急得直跺脚，那是她今天全部的货。",
        choices: [
          {
            id: "ball-catch",
            label: "跳起来用顶球绝招勾气球",
            check: { type: "skill", key: "balltop" },
            success: { text: "一、二、三连顶！气球被稳稳勾回线头，奶奶高兴地把最大的一只彩带气球系在团子角上。", effects: { happiness: 8, setFlags: ["hero"] }, next: "end" },
            fail: { text: "团子蹦得老高，可惜还没学会顶球，指尖擦着气球线滑了过去。奶奶摆摆手说没事，又系了根彩带给它。", effects: { energy: -4, setFlags: ["ribbon"] }, next: "end" },
          },
          {
            id: "chase",
            label: "撒腿追着气球跑",
            success: { text: "追出半条街，总算在矮树杈上拦下大半气球，累得直喘，但奶奶笑得合不拢嘴。", effects: { energy: -8, setFlags: ["hero"] }, next: "end" },
          },
          {
            id: "comfort",
            label: "先安慰奶奶再说",
            success: { text: "气球是追不回来了，团子陪奶奶重新扎了一串新的，慢是慢点，扎得更结实。", effects: { intimacy: 3, setFlags: ["kind_heart"] }, next: "end" },
          },
        ],
      },
    ],
    endings: [
      {
        key: "market-star",
        name: "集市小明星",
        text: "抽中大奖又救了气球，今天半个集市都认识团子了。",
        rewardCoins: 35,
        rewardXp: 26,
        when: (f) => f.includes("hero") && (f.includes("prize") || f.includes("lucky_draw")),
      },
      {
        key: "warm-heart",
        name: "热心团子",
        text: "没买到什么稀罕物，但帮了人、救了场，心里比口袋还满。",
        rewardCoins: 22,
        rewardXp: 18,
        when: (f) => f.includes("hero") || f.includes("helped_stall") || f.includes("kind_heart"),
      },
      {
        key: "snack-tour",
        name: "逛吃逛吃",
        text: "这一趟主打一个吃饱喝足，集市嘛，开心最重要。",
        rewardCoins: 12,
        rewardXp: 10,
        when: () => true,
      },
    ],
  },
  {
    key: "moonpond-concert",
    name: "月光音乐会",
    place: "池塘边的月光舞台",
    desc: "今晚团子是主唱。唱什么、跟谁合唱、灯光谁来打，全看你的安排。",
    intro: "池塘的荷叶上落满月光，观众席（石头和草叶）坐满了小伙伴，团子清了清嗓子。",
    minStage: 0,
    requireSkill: "sing",
    keepsake: "月光乐谱",
    steps: [
      {
        title: "开场曲",
        text: "第一首歌，台下全是眼睛。独唱显本事，合唱有气势，团子等你发话。",
        choices: [
          {
            id: "duet-frog",
            label: "邀青蛙呱呱合唱",
            check: { type: "find", key: "frog" },
            success: { text: "呱声和团子的奶音一高一低，意外地合拍，荷叶都跟着晃。", effects: { happiness: 10, setFlags: ["duet"] }, next: 1 },
            fail: { text: "呱呱今天没来（还没在探险里遇见它），团子只好对着池塘的倒影唱，倒影也算观众。", effects: { happiness: 4, setFlags: ["echo_solo"] }, next: 1 },
          },
          {
            id: "solo",
            label: "独唱一首拿手的",
            check: { type: "stat", stat: "happiness", min: 50 },
            success: { text: "状态正佳，一开口就把全场唱安静了，唱完三秒才爆发出掌声。", effects: { happiness: 8, setFlags: ["solo_star"] }, next: 1 },
            fail: { text: "有点紧张，第一句飘了。团子挠挠头重新来过，台下善意地笑成一片。", effects: { setFlags: ["nervous"] }, next: 1 },
          },
        ],
      },
      {
        title: "灯光时刻",
        text: "唱到一半，萤火虫们组成的灯光组忽明忽暗——节奏乱了，需要有人打个信号把它们带齐。",
        choices: [
          {
            id: "wink-lights",
            label: "眨眼放电当信号灯",
            check: { type: "skill", key: "wink" },
            success: { text: "啾——啾——放电的节奏一出，萤火虫们立刻跟上，整片池塘亮得像星河落地。", effects: { setFlags: ["lights"] }, next: 2 },
            fail: { text: "团子眨了半天眼，萤火虫以为它在抛媚眼，飞得更乱了。最后大家索性随缘亮，也挺好看。", effects: { happiness: 4, setFlags: ["wild_lights"] }, next: 2 },
          },
          {
            id: "let-it-be",
            label: "不管灯光，唱就完了",
            success: { text: "灯光再乱也压不住歌声，唱到动情处，连月亮都好像凑近了一点。", effects: { happiness: 5, setFlags: ["all_voice"] }, next: 2 },
          },
        ],
      },
      {
        title: "压轴高音",
        text: "最后一首的最高音，全场屏住呼吸。这一下，决定今晚是封神还是翻车。",
        choices: [
          {
            id: "high-note",
            label: "拼尽全力飙高音",
            check: { type: "stat", stat: "energy", min: 25 },
            success: { text: "高音稳稳站住，还颤了个漂亮的尾音！萤火虫全体起立（飞起来了），安可声响成一片。", effects: { happiness: 10, setFlags: ["finale"] }, next: "end" },
            fail: { text: "精力有点跟不上了，高音在半山腰拐了个弯——全场先是一愣，然后笑翻，没人舍得怪它。", effects: { happiness: 5, setFlags: ["cute_fail"] }, next: "end" },
          },
          {
            id: "chorus-end",
            label: "拉上全场大合唱",
            success: { text: "团子一挥爪，所有小伙伴一起唱起来，声音飘过池塘，飘到很远很远的地方。", effects: { intimacy: 4, setFlags: ["chorus"] }, next: "end" },
          },
        ],
      },
    ],
    endings: [
      {
        key: "moon-star",
        name: "月光巨星",
        text: "灯光、歌声、高音全在线，今晚的月亮都是给团子打的追光。",
        rewardCoins: 38,
        rewardXp: 30,
        when: (f) => f.includes("finale") && f.includes("lights"),
      },
      {
        key: "chorus-night",
        name: "合唱之夜",
        text: "记住今晚的不一定是高音，是所有声音一起响起来的那一下。",
        rewardCoins: 24,
        rewardXp: 20,
        when: (f) => f.includes("duet") || f.includes("chorus") || f.includes("solo_star"),
      },
      {
        key: "star-encore",
        name: "星空安可",
        text: "有点小翻车，但观众缘拉满——安可喊了三遍才散场。",
        rewardCoins: 14,
        rewardXp: 12,
        when: () => true,
      },
    ],
  },
  {
    key: "treehole-secret",
    name: "老树洞的秘密",
    place: "后院最老的那棵树",
    desc: "树洞有守门的猫头鹰，洞里有别人的储藏室，最深处还有一扇根做的小门。",
    intro: "老树洞黑黢黢的，团子举着小灯站在洞口，听见里面传来窸窸窣窣的声音。",
    minStage: 3,
    keepsake: "树洞地图",
    steps: [
      {
        title: "守门的猫头鹰",
        text: "猫头鹰守在洞口，慢悠悠地说：「进洞可以，先让我看看你够不够格。」",
        choices: [
          {
            id: "offer-acorn",
            label: "献上图鉴里的金橡子",
            check: { type: "find", key: "acorn" },
            success: { text: "猫头鹰眼睛一亮——那是它年轻时藏的橡子！它不但放行，还亲自领路。", effects: { setFlags: ["owl_friend"] }, next: 1 },
            fail: { text: "背包和图鉴里都没有金橡子。猫头鹰歪头看了看团子的黑角，挥挥翅膀：看在可爱的份上，进吧。", effects: { setFlags: ["cute_pass"] }, next: 1 },
          },
          {
            id: "sing-owl",
            label: "给猫头鹰唱首催眠曲",
            check: { type: "skill", key: "playsleep" },
            success: { text: "团子先唱歌再装睡，一套连招把猫头鹰哄得直点头……真睡着了。踮着脚进洞！", effects: { setFlags: ["owl_asleep"] }, next: 1 },
            fail: { text: "催眠这门手艺还没学到家，猫头鹰越听越精神。最后它叹口气：进去吧，别吵醒我就行。", effects: { setFlags: ["cute_pass"] }, next: 1 },
          },
          {
            id: "squeeze",
            label: "从树根缝里挤进去",
            success: { text: "吸气——收肚子——挤进去了！就是蹭了一身树皮灰，蓬松造型毁了一半。", effects: { cleanliness: -12, setFlags: ["squeezed"] }, next: 1 },
          },
        ],
      },
      {
        title: "谁的储藏室",
        text: "树洞中层是个小储藏室：松果、干果、一罐封着口的野蜂蜜，还有一张画在树皮上的简易地图。",
        choices: [
          {
            id: "take-honey",
            label: "尝一口野蜂蜜",
            success: { text: "就一口……好吧两口。甜得耳朵都竖起来了，肚子也暖暖的。", effects: { satiety: 14, happiness: 5, setFlags: ["honey"] }, next: 2 },
          },
          {
            id: "study-map",
            label: "认真记下树皮地图",
            success: { text: "地图把树洞的岔路标得清清楚楚，连最深处那扇根门都画了个圈。", effects: { xp: 6, setFlags: ["map"] }, next: 2 },
          },
          {
            id: "tidy-up",
            label: "帮主人把储藏室码整齐",
            success: { text: "松果归松果、干果归干果，码得整整齐齐。不知道主人是谁，但它回来一定会高兴。", effects: { intimacy: 3, setFlags: ["generous"] }, next: 2 },
          },
        ],
      },
      {
        title: "根做的小门",
        text: "最深处有一扇树根盘成的小门，门环上刻着一片羽毛的形状，推一推，纹丝不动。",
        choices: [
          {
            id: "feather-key",
            label: "用月光羽毛试试门环",
            check: { type: "find", key: "feather" },
            success: { text: "月光羽毛刚碰到门环，根须就自己松开了——门后是间小小的宝库，金币的光晃得团子眯起眼！", effects: { coins: 30, setFlags: ["vault"] }, next: "end" },
            fail: { text: "图鉴里还没有月光羽毛，门环不为所动。门缝里倒是滚出一小包松鼠的储粮饼干，像是安慰奖。", effects: { invCookie: 2, setFlags: ["pantry"] }, next: "end" },
          },
          {
            id: "nap-hollow",
            label: "算了，在树洞里睡个午觉",
            success: { text: "树洞里又安静又暖和，团子蜷成一团，睡了个近来最沉的午觉。", effects: { energy: 20, happiness: 4, setFlags: ["rested"] }, next: "end" },
          },
        ],
      },
    ],
    endings: [
      {
        key: "hole-guardian",
        name: "树洞守护者",
        text: "打开了根门还惦记着帮人收拾储藏室——这棵树以后就归团子罩了。",
        rewardCoins: 40,
        rewardXp: 30,
        when: (f) => f.includes("vault") && f.includes("generous"),
      },
      {
        key: "secret-finder",
        name: "秘密发现者",
        text: "树洞的秘密挖到了一大半，剩下的那点，留给下次探险。",
        rewardCoins: 26,
        rewardXp: 20,
        when: (f) => f.includes("vault") || f.includes("map"),
      },
      {
        key: "nap-king",
        name: "树洞午觉王",
        text: "宝藏没全挖到，但这一觉睡得值回票价。",
        rewardCoins: 14,
        rewardXp: 12,
        when: () => true,
      },
    ],
  },
  {
    key: "patrol-day",
    name: "团长巡逻日",
    place: "整个后院防区",
    desc: "当上团长的第一天巡逻：点名、修篱笆、躲大雨，样样都是事。",
    intro: "团长上任第一天，金星星擦得锃亮，背着小手站在院子中央，就等小伙伴们集合。",
    minStage: 4,
    requireSkill: "patrol",
    keepsake: "金哨子",
    steps: [
      {
        title: "集合点名",
        text: "集合时间到了，小伙伴们还三三两两在路上晃悠。团长的威严，要靠第一嗓子立住。",
        choices: [
          {
            id: "patrol-stance",
            label: "迈方步巡逻检阅",
            check: { type: "skill", key: "patrol" },
            success: { text: "方步一迈、金星一闪，小伙伴们不自觉地排成一列，连橘猫都站直了。", effects: { setFlags: ["discipline"] }, next: 1 },
            fail: { text: "巡逻这招还没正式学会，方步迈成了顺拐，队伍没排齐，先笑成一团。", effects: { happiness: 5 }, next: 1 },
          },
          {
            id: "cake-bribe",
            label: "拿云朵蛋糕当集合奖励",
            check: { type: "item", food: "cake" },
            success: { text: "蛋糕香气一出，三秒集合完毕。团长在本子上记下：这招好用，就是费蛋糕。", effects: { setFlags: ["beloved"] }, next: 1 },
            fail: { text: "背包里没有云朵蛋糕！团子只好扯着嗓子挨个喊，嗓子都喊冒烟了。", effects: { energy: -5 }, next: 1 },
          },
        ],
      },
      {
        title: "篱笆破了个洞",
        text: "巡逻到东边，篱笆被风吹开个大洞——外面的野猫正探头探脑，这个洞必须马上堵上。",
        choices: [
          {
            id: "scarf-fix",
            label: "跳围巾舞把藤条编进篱笆",
            check: { type: "skill", key: "scarfdance" },
            success: { text: "左右摇摆间藤条穿来穿去，篱笆补得比原来还密实，舞步修墙两不误。", effects: { setFlags: ["fixed"] }, next: 2 },
            fail: { text: "围巾舞还没学会，藤条跟团子较上劲了。最后糊了层大叶子上去，勉强能挡。", effects: { setFlags: ["patched"] }, next: 2 },
          },
          {
            id: "stand-guard",
            label: "亲自站岗守着洞口",
            success: { text: "团长往洞口一坐，纹丝不动守了半天，野猫绕道走了。就是腿坐麻了。", effects: { energy: -10, setFlags: ["guarded"] }, next: 2 },
          },
        ],
      },
      {
        title: "天降大雨",
        text: "刚补完篱笆，乌云压顶，大雨说来就来！小伙伴们四散找躲雨的地方，眼看就要淋成落汤鸡。",
        choices: [
          {
            id: "shelter-all",
            label: "张开围巾给大家挡雨",
            check: { type: "stat", stat: "intimacy", min: 60 },
            success: { text: "平时攒的亲密度这时候全用上了——小伙伴们齐刷刷挤到团子身边，围巾底下满满当当，一个都没淋着。", effects: { intimacy: 3, setFlags: ["shelter_hero"] }, next: "end" },
            fail: { text: "大家还没那么黏团子，喊了半天只聚来一半，剩下的在各个屋檐下瑟瑟发抖。团子自己也淋透了。", effects: { cleanliness: -15, setFlags: ["wet"] }, next: "end" },
          },
          {
            id: "sing-sun",
            label: "对着乌云唱歌，把雨唱停",
            check: { type: "skill", key: "sing" },
            success: { text: "唱到第三首，雨点真的稀了，最后一句唱完，云缝里漏出一道光。全场欢呼：团长万岁！", effects: { happiness: 8, setFlags: ["sun"] }, next: "end" },
            fail: { text: "歌声很努力，但乌云不给面子，雨该下还下。不过大家说，雨里听歌也挺浪漫的。", effects: { happiness: 3, setFlags: ["wet"] }, next: "end" },
          },
        ],
      },
    ],
    endings: [
      {
        key: "gold-captain",
        name: "金牌团长",
        text: "队伍带得稳、篱笆修得好、雨里护得住人——金哨子实至名归。",
        rewardCoins: 45,
        rewardXp: 34,
        when: (f) => (f.includes("shelter_hero") || f.includes("sun")) && (f.includes("fixed") || f.includes("guarded")),
      },
      {
        key: "reliable-captain",
        name: "靠谱团长",
        text: "第一天巡逻有模有样，小伙伴们已经开始期待明天了。",
        rewardCoins: 28,
        rewardXp: 22,
        when: (f) => f.includes("shelter_hero") || f.includes("sun") || f.includes("discipline") || f.includes("beloved"),
      },
      {
        key: "wet-captain",
        name: "湿漉漉团长",
        text: "团长不好当啊。洗个热水澡，明天再战。",
        rewardCoins: 15,
        rewardXp: 12,
        when: () => true,
      },
    ],
  },
];

function scenarioByKey(key: string) {
  return SCENARIOS.find((s) => s.key === key);
}

// 后院天气：按上海日期哈希确定性轮换（和每日小脾气同法），当天不变。
const WEATHERS = [
  { id: "sunny", name: "晴天" },
  { id: "breeze", name: "微风" },
  { id: "cloudy", name: "多云" },
  { id: "rain", name: "毛毛雨" },
] as const;

function weatherForDate(dateStr: string) {
  return WEATHERS[hashStr(`${dateStr}:weather`) % WEATHERS.length] ?? WEATHERS[0];
}

function checkLabel(check: ScenarioCheck): string {
  switch (check.type) {
    case "skill":
      return `考验 · 绝招「${skillByKey(check.key)?.name ?? check.key}」`;
    case "find":
      return `考验 · 图鉴收藏`;
    case "stat": {
      const statName =
        check.stat === "intimacy"
          ? "亲密度"
          : check.stat === "happiness"
            ? "快乐"
            : check.stat === "energy"
              ? "精力"
              : check.stat === "cleanliness"
                ? "清洁"
                : "饱食";
      return `考验 · ${statName} ≥${check.min}`;
    }
    case "item":
      return `消耗 · ${FOODS_REF[check.food]} ×1`;
    case "coins":
      return `花费 · ${check.amount} 毛绒币`;
    case "weatherDry":
      return "看天色 · 今天别下雨";
  }
}

// FOODS 在下方定义，这里留个引用别名给 checkLabel 用（同模块内提升引用）。
const FOODS_REF = {
  milk: "热牛奶",
  cookie: "星星饼干",
  cake: "云朵蛋糕",
} as const;

function scenarioLockReason(
  def: ScenarioDef,
  pet: PetRow,
  learnedKeys: ReadonlySet<string>,
): string | null {
  if (pet.stage < def.minStage) {
    return `长到「${STAGE_NAMES[def.minStage] ?? ""}」解锁`;
  }
  if (def.requireSkill && !learnedKeys.has(def.requireSkill)) {
    return `先学会绝招「${skillByKey(def.requireSkill)?.name ?? def.requireSkill}」`;
  }
  return null;
}

type ScenarioProgressRow = typeof schema.scenarioProgress.$inferSelect;

async function loadProgress(db: Db): Promise<ScenarioProgressRow[]> {
  return db.select().from(schema.scenarioProgress);
}

function parseFlags(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function evalScenarioCheck(
  check: ScenarioCheck,
  pet: PetRow,
  learnedKeys: ReadonlySet<string>,
  findKeys: ReadonlySet<string>,
  weatherId: string,
): boolean {
  switch (check.type) {
    case "skill":
      return learnedKeys.has(check.key);
    case "find":
      return findKeys.has(check.key);
    case "stat":
      return pet[check.stat] >= check.min;
    case "item":
      return (check.food === "milk" ? pet.invMilk : check.food === "cookie" ? pet.invCookie : pet.invCake) > 0;
    case "coins":
      return pet.coins >= check.amount;
    case "weatherDry":
      return weatherId !== "rain";
  }
}

function applyScenarioEffects(next: PetRow, effects: ScenarioEffect | undefined) {
  if (!effects) return;
  if (effects.coins) next.coins = Math.max(0, next.coins + effects.coins);
  if (effects.xp) next.xp += effects.xp;
  if (effects.happiness) next.happiness = clampStat(next.happiness + effects.happiness);
  if (effects.satiety) next.satiety = clampStat(next.satiety + effects.satiety);
  if (effects.energy) next.energy = clampStat(next.energy + effects.energy);
  if (effects.cleanliness) next.cleanliness = clampStat(next.cleanliness + effects.cleanliness);
  if (effects.intimacy) next.intimacy = clampStat(next.intimacy + effects.intimacy);
  if (effects.invMilk) next.invMilk = Math.max(0, next.invMilk + effects.invMilk);
  if (effects.invCookie) next.invCookie = Math.max(0, next.invCookie + effects.invCookie);
  if (effects.invCake) next.invCake = Math.max(0, next.invCake + effects.invCake);
}

function applyLevelUps(next: PetRow): { leveledTo: number | null; evolvedTo: number | null } {
  let leveledTo: number | null = null;
  let evolvedTo: number | null = null;
  while (next.xp >= xpForNext(next.level)) {
    next.xp -= xpForNext(next.level);
    next.level += 1;
    leveledTo = next.level;
  }
  const newStage = stageForLevel(next.level);
  if (newStage > next.stage) {
    next.stage = newStage;
    evolvedTo = newStage;
  }
  return { leveledTo, evolvedTo };
}

async function savePetStats(db: Db, next: PetRow) {
  await db
    .update(schema.petState)
    .set({
      satiety: next.satiety,
      happiness: next.happiness,
      cleanliness: next.cleanliness,
      energy: next.energy,
      intimacy: next.intimacy,
      xp: next.xp,
      level: next.level,
      stage: next.stage,
      coins: next.coins,
      invMilk: next.invMilk,
      invCookie: next.invCookie,
      invCake: next.invCake,
      totalActions: next.totalActions,
    })
    .where(eq(schema.petState.id, 1));
}

const FOODS = {
  milk: { name: "热牛奶", price: 10, satiety: 18, happiness: 4, xp: 6, intimacy: 1 },
  cookie: { name: "星星饼干", price: 25, satiety: 30, happiness: 10, xp: 10, intimacy: 2 },
  cake: { name: "云朵蛋糕", price: 60, satiety: 55, happiness: 18, xp: 18, intimacy: 3 },
} as const;
type FoodId = keyof typeof FOODS;

// Stat points lost per hour away.
const DECAY_PER_HOUR = {
  satiety: 2.2,
  happiness: 1.6,
  cleanliness: 1.2,
  energy: 1.4,
  intimacy: 0.5,
} as const;

const clampStat = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function stageForLevel(level: number): number {
  if (level >= 15) return 4;
  if (level >= 10) return 3;
  if (level >= 6) return 2;
  if (level >= 3) return 1;
  return 0;
}

function xpForNext(level: number): number {
  return level * 40;
}

function shanghaiDate(nowMs: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "1970";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function insertLog(db: Db, kind: string, text: string, now: number) {
  await db.insert(schema.careLog).values({ kind, text, createdAt: now });
}

async function loadOrCreatePet(db: Db, now: number): Promise<PetRow> {
  const rows = await db.select().from(schema.petState).limit(1);
  const existing = rows[0];
  if (existing) return existing;
  await db.insert(schema.petState).values({
    id: 1,
    name: "团团",
    stage: 0,
    level: 1,
    xp: 0,
    coins: 30,
    satiety: 70,
    happiness: 70,
    cleanliness: 80,
    energy: 80,
    intimacy: 10,
    invMilk: 2,
    invCookie: 0,
    invCake: 0,
    totalActions: 0,
    createdAt: now,
    lastDecayAt: now,
    tasksDate: shanghaiDate(now),
    taskFeed: 0,
    taskPlay: 0,
    taskCare: 0,
    taskClaimed: 0,
    lastCheckinDate: "",
  });
  await insertLog(db, "born", "团团来到了培育小屋，养殖正式开始。", now);
  const created = await db.select().from(schema.petState).limit(1);
  const pet = created[0];
  if (!pet) throw new Error("建团失败，请重试");
  return pet;
}

// Applies elapsed-time decay and the daily task reset; persists when
// anything actually changed. Returns the settled row.
async function settle(db: Db, pet: PetRow, now: number): Promise<PetRow> {
  const today = shanghaiDate(now);
  const elapsedMs = Math.min(Math.max(now - pet.lastDecayAt, 0), 24 * 3600 * 1000);
  const hours = elapsedMs / 3600000;
  const dayChanged = pet.tasksDate !== today;
  if (elapsedMs < 60 * 1000 && !dayChanged) return pet;

  const next: PetRow = {
    ...pet,
    satiety: clampStat(pet.satiety - DECAY_PER_HOUR.satiety * hours),
    happiness: clampStat(pet.happiness - DECAY_PER_HOUR.happiness * hours),
    cleanliness: clampStat(pet.cleanliness - DECAY_PER_HOUR.cleanliness * hours),
    energy: clampStat(pet.energy - DECAY_PER_HOUR.energy * hours),
    intimacy: clampStat(pet.intimacy - DECAY_PER_HOUR.intimacy * hours),
    lastDecayAt: now,
    tasksDate: today,
    taskFeed: dayChanged ? 0 : pet.taskFeed,
    taskPlay: dayChanged ? 0 : pet.taskPlay,
    taskCare: dayChanged ? 0 : pet.taskCare,
    taskClaimed: dayChanged ? 0 : pet.taskClaimed,
  };
  await db
    .update(schema.petState)
    .set({
      satiety: next.satiety,
      happiness: next.happiness,
      cleanliness: next.cleanliness,
      energy: next.energy,
      intimacy: next.intimacy,
      lastDecayAt: next.lastDecayAt,
      tasksDate: next.tasksDate,
      taskFeed: next.taskFeed,
      taskPlay: next.taskPlay,
      taskCare: next.taskCare,
      taskClaimed: next.taskClaimed,
    })
    .where(eq(schema.petState.id, 1));
  return next;
}

async function getSettled(ctx: Ctx): Promise<{ db: Db; pet: PetRow; now: number }> {
  const db = ctx.db<typeof schema>();
  const now = Date.now();
  const pet = await loadOrCreatePet(db, now);
  const settled = await settle(db, pet, now);
  return { db, pet: settled, now };
}

const petShape = z.object({
  name: z.string(),
  stage: z.number(),
  stageName: z.string(),
  level: z.number(),
  xp: z.number(),
  xpNext: z.number(),
  coins: z.number(),
  satiety: z.number(),
  happiness: z.number(),
  cleanliness: z.number(),
  energy: z.number(),
  intimacy: z.number(),
  invMilk: z.number(),
  invCookie: z.number(),
  invCake: z.number(),
  totalActions: z.number(),
  ageDays: z.number(),
  checkedInToday: z.boolean(),
  finds: z.array(z.object({ key: z.string(), name: z.string() })),
  learnedSkills: z.array(z.string()),
  dailySkillKey: z.string(),
  dailyTrialUsed: z.boolean(),
  learnFreeToday: z.boolean(),
  freshNews: z.object({
    text: z.string(),
    line: z.string(),
    source: z.string(),
    skillKey: z.string(),
    skillName: z.string(),
  }),
  dailyTrait: z.object({ id: z.string(), name: z.string(), desc: z.string() }),
  weather: z.object({ id: z.string(), name: z.string() }),
  scenarios: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      place: z.string(),
      desc: z.string(),
      keepsake: z.string(),
      status: z.enum(["locked", "available", "active", "done"]),
      lockReason: z.string().nullable(),
      endingsSeen: z.array(z.string()),
      endings: z.array(z.object({ key: z.string(), name: z.string() })),
    }),
  ),
  activeScenario: z
    .object({
      key: z.string(),
      name: z.string(),
      stepTitle: z.string(),
      text: z.string(),
      act: z.number(),
      choices: z.array(
        z.object({ id: z.string(), label: z.string(), checkLabel: z.string().nullable() }),
      ),
    })
    .nullable(),
  tasks: z.object({
    feed: z.boolean(),
    play: z.boolean(),
    care: z.boolean(),
    claimed: z.boolean(),
    allDone: z.boolean(),
  }),
});

const logItem = z.object({
  id: z.number(),
  kind: z.string(),
  text: z.string(),
  created_at: z.string(),
});

const stateResponse = z.object({
  pet: petShape,
  log: z.array(logItem),
});

const actionResponse = z.object({
  ok: z.literal(true),
  pet: petShape,
  log: z.array(logItem),
  message: z.string(),
  reaction: z.string().nullable(),
  surprise: z.string().nullable(),
  leveledTo: z.number().nullable(),
  evolvedTo: z.number().nullable(),
});

type StateResponse = z.infer<typeof stateResponse>;
type ActionResponse = z.infer<typeof actionResponse>;

async function loadFinds(db: Db): Promise<{ key: string; name: string }[]> {
  const rows = await db
    .select()
    .from(schema.exploreFinds)
    .orderBy(schema.exploreFinds.id);
  return rows.map((r) => ({ key: r.key, name: r.name }));
}

async function loadLearned(db: Db): Promise<{ skillKey: string; learnedAt: number }[]> {
  const rows = await db
    .select()
    .from(schema.learnedSkills)
    .orderBy(schema.learnedSkills.id);
  return rows.map((r) => ({ skillKey: r.skillKey, learnedAt: r.learnedAt }));
}

async function toPet(db: Db, pet: PetRow, now: number): Promise<z.infer<typeof petShape>> {
  const today = shanghaiDate(now);
  const dayStart = Date.parse(`${today}T00:00:00+08:00`);
  const learned = await loadLearned(db);
  const fresh = dailyFresh(pet.stage, today);
  const trialRows = await db
    .select()
    .from(schema.careLog)
    .orderBy(desc(schema.careLog.id))
    .limit(60);
  const dailyTrialUsed = trialRows.some(
    (r) => r.kind === `trial_${fresh.skillKey}` && r.createdAt >= dayStart,
  );
  const learnedKeys = new Set(learned.map((l) => l.skillKey));
  const progressRows = await loadProgress(db);
  const progressByKey = new Map(progressRows.map((r) => [r.scenarioKey, r]));
  const activeRow = progressRows.find((r) => r.status === "active");
  const scenarios = SCENARIOS.map((def) => {
    const row = progressByKey.get(def.key);
    const lockReason = scenarioLockReason(def, pet, learnedKeys);
    const status: "locked" | "available" | "active" | "done" =
      row?.status === "active"
        ? "active"
        : row && row.completions > 0
          ? "done"
          : lockReason
            ? "locked"
            : "available";
    return {
      key: def.key,
      name: def.name,
      place: def.place,
      desc: def.desc,
      keepsake: def.keepsake,
      status,
      lockReason: status === "locked" ? lockReason : null,
      endingsSeen: row ? parseFlags(row.endingsSeen) : [],
      endings: def.endings.map((e) => ({ key: e.key, name: e.name })),
    };
  });
  let activeScenario: z.infer<typeof petShape>["activeScenario"] = null;
  if (activeRow) {
    const def = scenarioByKey(activeRow.scenarioKey);
    const step = def?.steps[activeRow.step];
    if (def && step) {
      const flags = parseFlags(activeRow.flags);
      activeScenario = {
        key: def.key,
        name: def.name,
        stepTitle: step.title,
        text: typeof step.text === "function" ? step.text(flags) : step.text,
        act: activeRow.step + 1,
        choices: step.choices.map((c) => ({
          id: c.id,
          label: c.label,
          checkLabel: c.check ? checkLabel(c.check) : null,
        })),
      };
    }
  }
  return {
    name: pet.name,
    stage: pet.stage,
    stageName: STAGE_NAMES[pet.stage] ?? "幼团",
    level: pet.level,
    xp: pet.xp,
    xpNext: xpForNext(pet.level),
    coins: pet.coins,
    satiety: pet.satiety,
    happiness: pet.happiness,
    cleanliness: pet.cleanliness,
    energy: pet.energy,
    intimacy: pet.intimacy,
    invMilk: pet.invMilk,
    invCookie: pet.invCookie,
    invCake: pet.invCake,
    totalActions: pet.totalActions,
    ageDays: Math.max(1, Math.floor((now - pet.createdAt) / 86400000) + 1),
    checkedInToday: pet.lastCheckinDate === today,
    finds: await loadFinds(db),
    learnedSkills: learned.map((l) => l.skillKey),
    dailySkillKey: fresh.skillKey,
    dailyTrialUsed,
    learnFreeToday: !learned.some((l) => l.learnedAt >= dayStart),
    freshNews: {
      text: fresh.text,
      line: fresh.line,
      source: "local",
      skillKey: fresh.skillKey,
      skillName: skillByKey(fresh.skillKey)?.name ?? "",
    },
    dailyTrait: traitForDate(today),
    weather: weatherForDate(today),
    scenarios,
    activeScenario,
    tasks: {
      feed: pet.taskFeed === 1,
      play: pet.taskPlay === 1,
      care: pet.taskCare === 1,
      claimed: pet.taskClaimed === 1,
      allDone: pet.taskFeed === 1 && pet.taskPlay === 1 && pet.taskCare === 1,
    },
  };
}

async function loadLog(db: Db): Promise<z.infer<typeof logItem>[]> {
  const rows = await db
    .select()
    .from(schema.careLog)
    .orderBy(desc(schema.careLog.id))
    .limit(30);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    text: r.text,
    created_at: new Date(r.createdAt).toISOString(),
  }));
}

async function buildState(ctx: Ctx): Promise<StateResponse> {
  const { db, pet, now } = await getSettled(ctx);
  return { pet: await toPet(db, pet, now), log: await loadLog(db) };
}

export const Actions = {
  getState: defineAction({
    description:
      "读取毛绒团的存档状态：五维属性（已按真实流逝时间结算消耗）、等级进化、毛绒币、食物库存、今日任务、签到状态和最近培育日志；首次调用会建团。",
    request: z.object({}),
    response: stateResponse,
    handler: async (ctx): Promise<StateResponse> => buildState(ctx),
  }),

  doAction: defineAction({
    description:
      "对毛绒团做一次照顾动作：feed（喂背包里的食物，需传 foodId）、play 陪玩、bath 洗澡、train 特训、sleep 哄睡、poke 戳一戳（传 pokeStreak 连戳次数，反应分四档：开心→收费→生气→戳晕，连戳 10 下有彩蛋）；结算每日小脾气加成、进化阶段本事（探险鼻子/幸运泡泡浴/做梦/团长暴击）、三连招与闪闪发光奖励、经验升级与进化，并写入培育日志。戳的反应台词在返回的 reaction 字段。",
    request: z.object({
      kind: z.enum(["feed", "play", "bath", "train", "sleep", "poke"]),
      foodId: z.enum(["milk", "cookie", "cake"]).optional(),
      pokeStreak: z.number().int().min(1).max(99).optional(),
    }),
    response: actionResponse,
    handler: async (ctx, args): Promise<ActionResponse> => {
      const { db, pet, now } = await getSettled(ctx);
      const next: PetRow = { ...pet };
      let message = "";
      let reaction: string | null = null;
      let logText = "";
      const surprises: string[] = [];

      const trait = traitForDate(shanghaiDate(now));
      const startStage = pet.stage;

      // 连招判定与团长每日首照顾：读最近照顾记录（在本次动作落库前）。
      const recentRows = await db
        .select()
        .from(schema.careLog)
        .orderBy(desc(schema.careLog.id))
        .limit(40);
      const recentCare = recentRows.filter((r) =>
        (CARE_KINDS as readonly string[]).includes(r.kind),
      );
      const prev1 = recentCare[0]?.kind;
      const prev2 = recentCare[1]?.kind;
      const isCombo =
        prev1 !== undefined &&
        prev2 !== undefined &&
        prev1 !== prev2 &&
        prev1 !== args.kind &&
        prev2 !== args.kind;
      const dayStart = Date.parse(`${shanghaiDate(now)}T00:00:00+08:00`);
      const isFirstCareToday = !recentCare.some((r) => r.createdAt >= dayStart);

      const gainXp = (amount: number) => {
        next.xp += amount;
      };

      switch (args.kind) {
        case "feed": {
          const foodId: FoodId = args.foodId ?? "milk";
          const food = FOODS[foodId];
          const invKey = foodId === "milk" ? "invMilk" : foodId === "cookie" ? "invCookie" : "invCake";
          if (next[invKey] <= 0) {
            throw new Error(`${food.name}没有了，去小卖部买一点吧`);
          }
          next[invKey] -= 1;
          const greedy = trait.id === "greedy";
          const happyGain = greedy ? food.happiness * 2 : food.happiness;
          const xpGain = greedy ? Math.round(food.xp * 1.5) : food.xp;
          next.satiety = clampStat(next.satiety + food.satiety);
          next.happiness = clampStat(next.happiness + happyGain);
          next.intimacy = clampStat(next.intimacy + food.intimacy);
          gainXp(xpGain);
          next.taskFeed = 1;
          message = greedy
            ? `贪吃日！喂了${food.name}，快乐翻倍 +${happyGain}、经验 +${xpGain}`
            : `喂了${food.name}，饱食 +${food.satiety}`;
          logText = `喂了${food.name}，吃得腮帮子鼓鼓的。`;
          break;
        }
        case "play": {
          if (next.energy < 8) throw new Error("它累得睁不开眼，先哄它睡一会儿吧");
          const sporty = trait.id === "sporty";
          const happyGain = sporty ? 24 : 16;
          next.happiness = clampStat(next.happiness + happyGain);
          next.energy = clampStat(next.energy - 8);
          next.satiety = clampStat(next.satiety - 4);
          next.intimacy = clampStat(next.intimacy + 2);
          gainXp(12);
          next.taskPlay = 1;
          message = sporty
            ? `运动日！陪玩快乐额外加成 +${happyGain}`
            : "陪它蹦蹦跳跳玩了一圈，快乐 +16";
          logText = "陪玩了一圈，原地蹦了三下还转了个圈。";
          // 小毛团起：探险鼻子，陪玩有概率嗅到毛绒币。
          if (startStage >= 1 && Math.random() < 0.25) {
            const found = 5 + Math.floor(Math.random() * 8);
            next.coins += found;
            surprises.push(`探险鼻子发作：在垫子底下嗅出 ${found} 毛绒币！`);
          }
          break;
        }
        case "bath": {
          const bubble = trait.id === "bubble";
          next.cleanliness = bubble ? 100 : clampStat(next.cleanliness + 30);
          next.happiness = clampStat(next.happiness + 5);
          next.intimacy = clampStat(next.intimacy + (bubble ? 4 : 1));
          gainXp(8);
          next.taskCare = 1;
          message = bubble ? "泡泡日！洗完清洁直接拉满，香到冒泡" : "洗得香喷喷，清洁 +30";
          logText = "洗了个泡泡澡，绒毛蓬松得像朵云。";
          // 蓬蓬团起：幸运泡泡浴，有概率从泡泡里捞出吃的。
          if (startStage >= 2 && Math.random() < 0.2) {
            if (Math.random() < 0.5) {
              next.invMilk += 1;
              surprises.push("幸运泡泡浴：从泡泡里捞出一瓶热牛奶，放进背包啦！");
            } else {
              next.invCookie += 1;
              surprises.push("幸运泡泡浴：从泡泡里捞出一块星星饼干，放进背包啦！");
            }
          }
          break;
        }
        case "train": {
          if (next.energy < 12) throw new Error("精力不够特训，先吃点东西睡一觉吧");
          const sporty = trait.id === "sporty";
          next.energy = clampStat(next.energy - 12);
          next.satiety = clampStat(next.satiety - 6);
          next.happiness = clampStat(next.happiness + 4);
          gainXp(sporty ? 44 : 22);
          next.taskCare = 1;
          message = sporty ? "运动日！特训经验翻倍 +44" : "特训完成，经验 +22";
          logText = "特训了一组翻滚连招，落地时得意地挑了挑眉。";
          break;
        }
        case "sleep": {
          const sleepyDay = trait.id === "sleepy";
          const energyGain = sleepyDay ? 50 : 35;
          next.energy = clampStat(next.energy + energyGain);
          next.happiness = clampStat(next.happiness + 3);
          gainXp(sleepyDay ? 10 : 5);
          next.taskCare = 1;
          message = sleepyDay
            ? `瞌睡日！这一觉特别沉，精力 +${energyGain}`
            : "睡了个好觉，精力 +35";
          logText = "哄睡成功，小尖牙随着呼吸一动一动的。";
          // 圆滚团起：会做梦了，梦境给真实小奖励。
          if (startStage >= 3) {
            const dream = DREAMS[Math.floor(Math.random() * DREAMS.length)] ?? DREAMS[0];
            next.satiety = clampStat(next.satiety + dream.satiety);
            next.coins += dream.coins;
            gainXp(dream.xp);
            surprises.push(`做梦啦：${dream.text}（梦境奖励已到账）`);
          }
          break;
        }
        case "poke": {
          const clingy = trait.id === "clingy";
          const streak = args.pokeStreak ?? 1;
          const tier = pokeTier(streak);
          const lines = POKE_LINES[tier] ?? POKE_LINES[0];
          reaction = lines[Math.floor(Math.random() * lines.length)] ?? lines[0];
          // 连戳彩蛋：正好连戳 10 下，绒毛里掉出一颗小星星（哪档都算）。
          if (streak === 10) {
            next.coins += 8;
            surprises.push("连戳彩蛋：从绒毛里戳出一颗小星星，换了 8 毛绒币！");
          }
          if (tier >= 3) {
            // 戳晕档：这一下不涨亲密度，它需要缓缓。
            next.happiness = clampStat(next.happiness + 1);
            gainXp(1);
            message = "戳晕了…让它缓一缓吧";
            logText = `被连戳了 ${streak} 下，晕乎乎地原地转了半圈。`;
          } else {
            next.happiness = clampStat(next.happiness + (clingy ? 6 : 3));
            next.intimacy = clampStat(next.intimacy + (clingy ? 3 : 1));
            gainXp(2);
            message = reaction;
            logText =
              tier === 0
                ? "被戳了一指头，软乎乎地晃了晃。"
                : tier === 1
                  ? `被连戳了 ${streak} 下，开始跟你收费了（口头）。`
                  : `被连戳了 ${streak} 下，腮红都快被戳掉了。`;
          }
          break;
        }
      }

      // 幸运日掉落。
      if (trait.id === "lucky" && Math.random() < 0.3) {
        const found = 6 + Math.floor(Math.random() * 5);
        next.coins += found;
        surprises.push(`幸运日掉落：捡到 ${found} 毛绒币！`);
      }
      // 毛绒团长：每日第一次照顾必暴击。
      if (startStage >= 4 && isFirstCareToday) {
        next.coins += 10;
        gainXp(15);
        surprises.push("团长金光暴击：今日第一次照顾经验 +15、毛绒币 +10！");
      }
      // 照顾连招：连续三次照顾互不重样。
      if (isCombo) {
        next.coins += 15;
        gainXp(10);
        surprises.push("三连招达成！换着花样照顾，奖励 15 毛绒币、经验 +10");
      }
      // 闪闪发光：照顾后五维全部 ≥75。
      if (
        next.satiety >= 75 &&
        next.happiness >= 75 &&
        next.cleanliness >= 75 &&
        next.energy >= 75 &&
        next.intimacy >= 75
      ) {
        next.coins += 8;
        surprises.push("闪闪发光！五维全高，奖励 8 毛绒币");
      }

      // Level-ups and evolution.
      let leveledTo: number | null = null;
      let evolvedTo: number | null = null;
      while (next.xp >= xpForNext(next.level)) {
        next.xp -= xpForNext(next.level);
        next.level += 1;
        leveledTo = next.level;
      }
      const newStage = stageForLevel(next.level);
      if (newStage > next.stage) {
        next.stage = newStage;
        evolvedTo = newStage;
      }
      next.totalActions += 1;

      const surpriseText = surprises.length > 0 ? surprises.join(" ") : null;

      await db
        .update(schema.petState)
        .set({
          satiety: next.satiety,
          happiness: next.happiness,
          cleanliness: next.cleanliness,
          energy: next.energy,
          intimacy: next.intimacy,
          xp: next.xp,
          level: next.level,
          stage: next.stage,
          coins: next.coins,
          invMilk: next.invMilk,
          invCookie: next.invCookie,
          invCake: next.invCake,
          taskFeed: next.taskFeed,
          taskPlay: next.taskPlay,
          taskCare: next.taskCare,
          totalActions: next.totalActions,
        })
        .where(eq(schema.petState.id, 1));
      await insertLog(db, args.kind, logText, now);
      if (surpriseText) {
        await insertLog(db, "surprise", `惊喜：${surpriseText}`, now);
      }
      if (leveledTo !== null) {
        await insertLog(db, "levelup", `升到了 ${leveledTo} 级，个头悄悄大了一圈。`, now);
      }
      if (evolvedTo !== null) {
        await insertLog(
          db,
          "evolve",
          `进化啦！现在是「${STAGE_NAMES[evolvedTo] ?? ""}」了。`,
          now,
        );
        message = `进化成了${STAGE_NAMES[evolvedTo] ?? ""}！`;
      }

      ctx.invalidateQueries();
      return {
        ok: true,
        pet: await toPet(db, next, now),
        log: await loadLog(db),
        message,
        reaction,
        surprise: surpriseText,
        leveledTo,
        evolvedTo,
      };
    },
  }),

  buyFood: defineAction({
    description: "在小卖部用毛绒币买一份食物放进背包（热牛奶 10、星星饼干 25、云朵蛋糕 60）。",
    request: z.object({ foodId: z.enum(["milk", "cookie", "cake"]) }),
    response: actionResponse,
    handler: async (ctx, args): Promise<ActionResponse> => {
      const { db, pet, now } = await getSettled(ctx);
      const food = FOODS[args.foodId];
      if (pet.coins < food.price) {
        throw new Error(`毛绒币不够，${food.name}要 ${food.price} 币，先做今日任务攒币吧`);
      }
      const next: PetRow = { ...pet, coins: pet.coins - food.price };
      if (args.foodId === "milk") next.invMilk += 1;
      else if (args.foodId === "cookie") next.invCookie += 1;
      else next.invCake += 1;
      await db
        .update(schema.petState)
        .set({
          coins: next.coins,
          invMilk: next.invMilk,
          invCookie: next.invCookie,
          invCake: next.invCake,
        })
        .where(eq(schema.petState.id, 1));
      ctx.invalidateQueries();
      return {
        ok: true,
        pet: await toPet(db, next, now),
        log: await loadLog(db),
        message: `买了${food.name}，放进背包啦`,
        reaction: null,
        surprise: null,
        leveledTo: null,
        evolvedTo: null,
      };
    },
  }),

  claimTasks: defineAction({
    description: "今日照料任务（喂食、陪玩、护理各一次）全部完成后领取 30 毛绒币奖励，每天限领一次。",
    request: z.object({}),
    response: actionResponse,
    handler: async (ctx): Promise<ActionResponse> => {
      const { db, pet, now } = await getSettled(ctx);
      if (pet.taskClaimed === 1) throw new Error("今天的任务奖励已经领过啦");
      if (!(pet.taskFeed === 1 && pet.taskPlay === 1 && pet.taskCare === 1)) {
        throw new Error("任务还没做完：喂食、陪玩、护理各做一次就能领");
      }
      const next: PetRow = { ...pet, coins: pet.coins + 30, taskClaimed: 1 };
      await db
        .update(schema.petState)
        .set({ coins: next.coins, taskClaimed: 1 })
        .where(eq(schema.petState.id, 1));
      await insertLog(db, "reward", "今日照料任务完成，领了 30 毛绒币。", now);
      ctx.invalidateQueries();
      return {
        ok: true,
        pet: await toPet(db, next, now),
        log: await loadLog(db),
        message: "任务奖励 +30 毛绒币",
        reaction: null,
        surprise: null,
        leveledTo: null,
        evolvedTo: null,
      };
    },
  }),

  checkin: defineAction({
    description: "每日签到领毛绒币（普通 15、毛绒团长 25）；同一天（Asia/Shanghai）只能签一次。",
    request: z.object({}),
    response: actionResponse,
    handler: async (ctx): Promise<ActionResponse> => {
      const { db, pet, now } = await getSettled(ctx);
      const today = shanghaiDate(now);
      if (pet.lastCheckinDate === today) throw new Error("今天已经签到过啦，明天再来");
      const reward = pet.stage >= 4 ? 25 : 15;
      const next: PetRow = { ...pet, coins: pet.coins + reward, lastCheckinDate: today };
      await db
        .update(schema.petState)
        .set({ coins: next.coins, lastCheckinDate: today })
        .where(eq(schema.petState.id, 1));
      await insertLog(db, "checkin", `今日签到，领了 ${reward} 毛绒币${pet.stage >= 4 ? "（团长签到加成）" : ""}。`, now);
      ctx.invalidateQueries();
      return {
        ok: true,
        pet: await toPet(db, next, now),
        log: await loadLog(db),
        message: pet.stage >= 4 ? "团长签到加成！+25 毛绒币" : "签到成功 +15 毛绒币",
        reaction: null,
        surprise: pet.stage >= 4 ? "毛绒团长签到有加成：25 币（普通 15 币）" : null,
        leveledTo: null,
        evolvedTo: null,
      };
    },
  }),

  rename: defineAction({
    description: "给毛绒团改名（1–8 个字），新名字会存进存档并记入培育日志。",
    request: z.object({ name: z.string().trim().min(1).max(8) }),
    response: actionResponse,
    handler: async (ctx, args): Promise<ActionResponse> => {
      const { db, pet, now } = await getSettled(ctx);
      const next: PetRow = { ...pet, name: args.name };
      await db
        .update(schema.petState)
        .set({ name: args.name })
        .where(eq(schema.petState.id, 1));
      await insertLog(db, "rename", `改名叫「${args.name}」了，喊它的时候耳朵会动。`, now);
      ctx.invalidateQueries();
      return {
        ok: true,
        pet: await toPet(db, next, now),
        log: await loadLog(db),
        message: `以后就叫${args.name}啦`,
        reaction: null,
        surprise: null,
        leveledTo: null,
        evolvedTo: null,
      };
    },
  }),

  learnTrick: defineAction({
    description:
      "教毛绒团学一个口令本里的绝招：校验进化阶段门槛（进阶口令要长到对应阶段）和是否已学会，成本为精力 -10，当天第一次学习免毛绒币、之后每个 15 币；学成写入 learned_skills 落库并记培育日志 kind=skill。",
    request: z.object({ skillId: z.string().min(1).max(24) }),
    response: actionResponse,
    handler: async (ctx, args): Promise<ActionResponse> => {
      const { db, pet, now } = await getSettled(ctx);
      const skill = skillByKey(args.skillId);
      if (!skill) throw new Error("口令本里没有这一招");
      if (pet.stage < skill.minStage) {
        throw new Error(
          `这一招要长到「${STAGE_NAMES[skill.minStage] ?? ""}」才能学，现在还是「${STAGE_NAMES[pet.stage] ?? ""}」`,
        );
      }
      const learned = await loadLearned(db);
      if (learned.some((l) => l.skillKey === skill.key)) {
        throw new Error(`「${skill.name}」已经学会啦，去耍一个吧`);
      }
      if (pet.energy < 10) throw new Error("它累得学不动了，先吃点东西睡一觉吧");
      const today = shanghaiDate(now);
      const dayStart = Date.parse(`${today}T00:00:00+08:00`);
      const freeToday = !learned.some((l) => l.learnedAt >= dayStart);
      const coinCost = freeToday ? 0 : 15;
      if (pet.coins < coinCost) {
        throw new Error(`毛绒币不够，学这一招要 ${coinCost} 币，先做今日任务攒币吧`);
      }
      const next: PetRow = {
        ...pet,
        energy: clampStat(pet.energy - 10),
        coins: pet.coins - coinCost,
        xp: pet.xp + 5,
        totalActions: pet.totalActions + 1,
      };
      let leveledTo: number | null = null;
      let evolvedTo: number | null = null;
      while (next.xp >= xpForNext(next.level)) {
        next.xp -= xpForNext(next.level);
        next.level += 1;
        leveledTo = next.level;
      }
      const newStage = stageForLevel(next.level);
      if (newStage > next.stage) {
        next.stage = newStage;
        evolvedTo = newStage;
      }
      await db
        .update(schema.petState)
        .set({
          energy: next.energy,
          coins: next.coins,
          xp: next.xp,
          level: next.level,
          stage: next.stage,
          totalActions: next.totalActions,
        })
        .where(eq(schema.petState.id, 1));
      await db
        .insert(schema.learnedSkills)
        .values({ skillKey: skill.key, learnedAt: now });
      await insertLog(
        db,
        "skill",
        `学会了新口令「${skill.name}」${freeToday ? "（今日首次学习，免币）" : `（花了 ${coinCost} 毛绒币）`}，学的第一遍就耍得有模有样。`,
        now,
      );
      if (evolvedTo !== null) {
        await insertLog(db, "evolve", `进化啦！现在是「${STAGE_NAMES[evolvedTo] ?? ""}」了。`, now);
      }
      ctx.invalidateQueries();
      return {
        ok: true,
        pet: await toPet(db, next, now),
        log: await loadLog(db),
        message: freeToday
          ? `学会啦！「${skill.name}」加入口令本（今日首次学习免币）`
          : `学会啦！「${skill.name}」加入口令本（-${coinCost} 毛绒币）`,
        reaction: skill.line,
        surprise: null,
        leveledTo,
        evolvedTo,
      };
    },
  }),

  performTrick: defineAction({
    description:
      "让毛绒团耍一个口令：已学会的随时可耍（按绝招结算快乐/亲密度/经验，耗少量精力）；今日新鲜招当天没学会也能先体验一次（kind=trial_<skill> 日志记账，当天限一次）；已学会的新鲜招当天耍有快乐/经验翻倍加成。耍绝招算一次照顾，参与三连招、团长每日首照顾暴击、幸运日掉落与闪闪发光判定。",
    request: z.object({ skillId: z.string().min(1).max(24) }),
    response: actionResponse,
    handler: async (ctx, args): Promise<ActionResponse> => {
      const { db, pet, now } = await getSettled(ctx);
      const skill = skillByKey(args.skillId);
      if (!skill) throw new Error("口令本里没有这一招");
      if (pet.stage < skill.minStage) {
        throw new Error(`这一招要长到「${STAGE_NAMES[skill.minStage] ?? ""}」才能耍`);
      }
      const today = shanghaiDate(now);
      const dayStart = Date.parse(`${today}T00:00:00+08:00`);
      const fresh = dailyFresh(pet.stage, today);
      const isDaily = fresh.skillKey === skill.key;
      const learned = await loadLearned(db);
      const isLearned = learned.some((l) => l.skillKey === skill.key);

      // 连招 / 团长首照顾判定（在本次落库前读，和 doAction 同口径，trick 也算照顾）。
      const recentRows = await db
        .select()
        .from(schema.careLog)
        .orderBy(desc(schema.careLog.id))
        .limit(60);
      const recentCare = recentRows.filter(
        (r) => (CARE_KINDS as readonly string[]).includes(r.kind) || r.kind === "trick",
      );
      const prev1 = recentCare[0]?.kind;
      const prev2 = recentCare[1]?.kind;
      const isCombo =
        prev1 !== undefined &&
        prev2 !== undefined &&
        prev1 !== prev2 &&
        prev1 !== "trick" &&
        prev2 !== "trick";
      const isFirstCareToday = !recentCare.some((r) => r.createdAt >= dayStart);

      let isTrial = false;
      if (!isLearned) {
        if (!isDaily) throw new Error(`还没学会「${skill.name}」，先点「学这个」教它吧`);
        const trialed = recentRows.some(
          (r) => r.kind === `trial_${skill.key}` && r.createdAt >= dayStart,
        );
        if (trialed) throw new Error("今天的体验机会用过啦，点「学这个」正式学会它吧");
        isTrial = true;
      }
      if (pet.energy < skill.energy) {
        throw new Error("它累得耍不动了，先吃点东西睡一觉吧");
      }

      const trait = traitForDate(today);
      const startStage = pet.stage;
      const boosted = isDaily && isLearned;
      const happyGain = boosted ? skill.happy * 2 : skill.happy;
      const xpGain = boosted ? skill.xp * 2 : skill.xp;
      const next: PetRow = {
        ...pet,
        energy: clampStat(pet.energy - skill.energy),
        happiness: clampStat(pet.happiness + happyGain),
        intimacy: clampStat(pet.intimacy + skill.intimacy),
        xp: pet.xp + xpGain,
        totalActions: pet.totalActions + 1,
      };
      const surprises: string[] = [];
      if (trait.id === "lucky" && Math.random() < 0.3) {
        const found = 6 + Math.floor(Math.random() * 5);
        next.coins += found;
        surprises.push(`幸运日掉落：捡到 ${found} 毛绒币！`);
      }
      if (startStage >= 4 && isFirstCareToday) {
        next.coins += 10;
        next.xp += 15;
        surprises.push("团长金光暴击：今日第一次照顾经验 +15、毛绒币 +10！");
      }
      if (isCombo) {
        next.coins += 15;
        next.xp += 10;
        surprises.push("三连招达成！换着花样照顾，奖励 15 毛绒币、经验 +10");
      }
      if (
        next.satiety >= 75 &&
        next.happiness >= 75 &&
        next.cleanliness >= 75 &&
        next.energy >= 75 &&
        next.intimacy >= 75
      ) {
        next.coins += 8;
        surprises.push("闪闪发光！五维全高，奖励 8 毛绒币");
      }

      let leveledTo: number | null = null;
      let evolvedTo: number | null = null;
      while (next.xp >= xpForNext(next.level)) {
        next.xp -= xpForNext(next.level);
        next.level += 1;
        leveledTo = next.level;
      }
      const newStage = stageForLevel(next.level);
      if (newStage > next.stage) {
        next.stage = newStage;
        evolvedTo = newStage;
      }

      await db
        .update(schema.petState)
        .set({
          energy: next.energy,
          happiness: next.happiness,
          intimacy: next.intimacy,
          xp: next.xp,
          level: next.level,
          stage: next.stage,
          coins: next.coins,
          totalActions: next.totalActions,
        })
        .where(eq(schema.petState.id, 1));
      await insertLog(db, "trick", `耍了一招「${skill.name}」：${skill.line}`, now);
      if (isTrial) {
        await insertLog(db, `trial_${skill.key}`, `体验了今日新鲜招「${skill.name}」（还没正式学会）。`, now);
      }
      const surpriseText = surprises.length > 0 ? surprises.join(" ") : null;
      if (surpriseText) {
        await insertLog(db, "surprise", `惊喜：${surpriseText}`, now);
      }
      if (leveledTo !== null) {
        await insertLog(db, "levelup", `升到了 ${leveledTo} 级，个头悄悄大了一圈。`, now);
      }
      let message = isTrial
        ? `体验了一把「${skill.name}」！学会它就能天天耍啦`
        : boosted
          ? `今日新鲜招加成！耍了「${skill.name}」，快乐/经验翻倍`
          : `耍了「${skill.name}」，快乐 +${happyGain}`;
      if (evolvedTo !== null) {
        await insertLog(db, "evolve", `进化啦！现在是「${STAGE_NAMES[evolvedTo] ?? ""}」了。`, now);
        message = `进化成了${STAGE_NAMES[evolvedTo] ?? ""}！`;
      }
      ctx.invalidateQueries();
      return {
        ok: true,
        pet: await toPet(db, next, now),
        log: await loadLog(db),
        message,
        reaction: skill.line,
        surprise: surpriseText,
        leveledTo,
        evolvedTo,
      };
    },
  }),

  explore: defineAction({
    description:
      "带毛绒团去后院探险一次（消耗精力 10）：随机地点随机收获——毛绒币、食物、快乐，或第一次遇见小伙伴 / 找到宝物记入探险图鉴（共 10 件可收集）；结果写入培育日志。",
    request: z.object({}),
    response: actionResponse,
    handler: async (ctx): Promise<ActionResponse> => {
      const { db, pet, now } = await getSettled(ctx);
      if (pet.energy < 10) throw new Error("精力不够出门探险，先吃点东西睡一觉吧");
      const next: PetRow = { ...pet, energy: clampStat(pet.energy - 10) };
      next.xp += 6;

      const place = EXPLORE_PLACES[Math.floor(Math.random() * EXPLORE_PLACES.length)] ?? "草丛里";
      const foundKeys = new Set((await loadFinds(db)).map((f) => f.key));
      const roll = Math.random();
      let story = "";
      let surprise: string | null = null;
      let newFind: { key: string; name: string } | null = null;

      if (roll < 0.18) {
        const unmet = EXPLORE_FRIENDS.filter((f) => !foundKeys.has(f.key));
        const friend = unmet[Math.floor(Math.random() * unmet.length)];
        if (friend) {
          newFind = friend;
          story = `在${place}第一次遇见${friend.name}，互相蹭了蹭鼻子，约好下次一起玩！`;
          surprise = `探险图鉴 +1：新朋友「${friend.name}」`;
          next.happiness = clampStat(next.happiness + 8);
        }
      }
      if (!newFind && roll >= 0.18 && roll < 0.3) {
        const ungot = EXPLORE_TREASURES.filter((t) => !foundKeys.has(t.key));
        const treasure = ungot[Math.floor(Math.random() * ungot.length)];
        if (treasure) {
          newFind = treasure;
          story = `在${place}挖到了一件宝物：${treasure.name}！小心翼翼地收进了小屋。`;
          surprise = `探险图鉴 +1：宝物「${treasure.name}」`;
        }
      }
      if (!story) {
        const r2 = Math.random();
        if (r2 < 0.42) {
          const coins = 6 + Math.floor(Math.random() * 11);
          next.coins += coins;
          story = `在${place}翻出一小堆毛绒币，数了数有 ${coins} 个，美滋滋。`;
        } else if (r2 < 0.7) {
          if (Math.random() < 0.5) {
            next.invMilk += 1;
            story = `在${place}发现一瓶没开封的热牛奶，带回背包啦。`;
          } else {
            next.invCookie += 1;
            story = `在${place}发现一块星星饼干，带回背包啦。`;
          }
        } else {
          next.happiness = clampStat(next.happiness + 6);
          const scenes = [
            `在${place}追了半天蝴蝶，没追到，但笑得很开心。`,
            `在${place}躺着看云，认出了一朵长得像蛋糕的。`,
            `在${place}跟自己的影子玩了会儿石头剪刀布，平局。`,
          ];
          story = scenes[Math.floor(Math.random() * scenes.length)] ?? scenes[0] ?? "在后院开心地转了一圈。";
        }
      }

      // Level-ups from explore xp.
      let leveledTo: number | null = null;
      let evolvedTo: number | null = null;
      while (next.xp >= xpForNext(next.level)) {
        next.xp -= xpForNext(next.level);
        next.level += 1;
        leveledTo = next.level;
      }
      const newStage = stageForLevel(next.level);
      if (newStage > next.stage) {
        next.stage = newStage;
        evolvedTo = newStage;
      }
      next.totalActions += 1;

      await db
        .update(schema.petState)
        .set({
          energy: next.energy,
          happiness: next.happiness,
          coins: next.coins,
          xp: next.xp,
          level: next.level,
          stage: next.stage,
          invMilk: next.invMilk,
          invCookie: next.invCookie,
          totalActions: next.totalActions,
        })
        .where(eq(schema.petState.id, 1));
      if (newFind) {
        await db
          .insert(schema.exploreFinds)
          .values({ key: newFind.key, name: newFind.name, foundAt: now });
      }
      await insertLog(db, "explore", `探险：${story}`, now);
      if (evolvedTo !== null) {
        await insertLog(db, "evolve", `进化啦！现在是「${STAGE_NAMES[evolvedTo] ?? ""}」了。`, now);
      }

      ctx.invalidateQueries();
      return {
        ok: true,
        pet: await toPet(db, next, now),
        log: await loadLog(db),
        message: story,
        reaction: null,
        surprise,
        leveledTo,
        evolvedTo,
      };
    },
  }),

  startScenario: defineAction({
    description:
      "开始一个奇遇剧场的分支剧本（精力 -15）：校验进化阶段/绝招解锁条件与「同时只能进行一个剧本」，进度写入 scenario_progress；剧本每幕的选择与结局由 chooseScenario 推进。",
    request: z.object({ scenarioKey: z.string().min(1).max(32) }),
    response: actionResponse,
    handler: async (ctx, args): Promise<ActionResponse> => {
      const { db, pet, now } = await getSettled(ctx);
      const def = scenarioByKey(args.scenarioKey);
      if (!def) throw new Error("奇遇剧场里没有这个剧本");
      const progressRows = await loadProgress(db);
      const active = progressRows.find((r) => r.status === "active");
      if (active) {
        throw new Error(`《${scenarioByKey(active.scenarioKey)?.name ?? "奇遇"}》还没演完，先把它演完或先回家吧`);
      }
      const learnedKeys = new Set((await loadLearned(db)).map((l) => l.skillKey));
      const lockReason = scenarioLockReason(def, pet, learnedKeys);
      if (lockReason) throw new Error(lockReason);
      if (pet.energy < 15) throw new Error("精力不够出门演奇遇，先吃点东西睡一觉吧");
      const next: PetRow = { ...pet, energy: clampStat(pet.energy - 15), totalActions: pet.totalActions + 1 };
      await savePetStats(db, next);
      const existing = progressRows.find((r) => r.scenarioKey === def.key);
      if (existing) {
        await db
          .update(schema.scenarioProgress)
          .set({ status: "active", step: 0, flags: "[]", moves: 0, updatedAt: now })
          .where(eq(schema.scenarioProgress.scenarioKey, def.key));
      } else {
        await db.insert(schema.scenarioProgress).values({
          scenarioKey: def.key,
          status: "active",
          step: 0,
          flags: "[]",
          moves: 0,
          completions: 0,
          endingKey: null,
          endingsSeen: "[]",
          updatedAt: now,
        });
      }
      await insertLog(db, "scenario", `奇遇《${def.name}》开演：${def.intro}`, now);
      ctx.invalidateQueries();
      return {
        ok: true,
        pet: await toPet(db, next, now),
        log: await loadLog(db),
        message: def.intro,
        reaction: null,
        surprise: null,
        leveledTo: null,
        evolvedTo: null,
      };
    },
  }),

  chooseScenario: defineAction({
    description:
      "在进行中的奇遇剧本里做一个选择：按考验（绝招/图鉴/五维/背包/毛绒币/天气）判定走成功还是失败分支，结算数值变化并积累剧情 flags；走到结尾按 flags 判定结局，发奖励与纪念品，进度落库。",
    request: z.object({ choiceId: z.string().min(1).max(32) }),
    response: actionResponse,
    handler: async (ctx, args): Promise<ActionResponse> => {
      const { db, pet, now } = await getSettled(ctx);
      const progressRows = await loadProgress(db);
      const active = progressRows.find((r) => r.status === "active");
      if (!active) throw new Error("现在没有进行中的奇遇，先挑个剧本开演吧");
      const def = scenarioByKey(active.scenarioKey);
      const step = def?.steps[active.step];
      if (!def || !step) throw new Error("剧本进度对不上了，先回家歇一歇吧");
      const choice = step.choices.find((c) => c.id === args.choiceId);
      if (!choice) throw new Error("这一幕没有这个选择");

      const learnedKeys = new Set((await loadLearned(db)).map((l) => l.skillKey));
      const findKeys = new Set((await loadFinds(db)).map((f) => f.key));
      const today = shanghaiDate(now);
      const passed = choice.check
        ? evalScenarioCheck(choice.check, pet, learnedKeys, findKeys, weatherForDate(today).id)
        : true;
      const outcome = passed ? choice.success : (choice.fail ?? choice.success);

      const next: PetRow = { ...pet, totalActions: pet.totalActions + 1 };
      // 考验通过才付出代价（食物 / 毛绒币）。
      if (passed && choice.check?.type === "item") {
        if (choice.check.food === "milk") next.invMilk = Math.max(0, next.invMilk - 1);
        else if (choice.check.food === "cookie") next.invCookie = Math.max(0, next.invCookie - 1);
        else next.invCake = Math.max(0, next.invCake - 1);
      }
      if (passed && choice.check?.type === "coins") {
        next.coins = Math.max(0, next.coins - choice.check.amount);
      }
      applyScenarioEffects(next, outcome.effects);
      const { leveledTo, evolvedTo } = applyLevelUps(next);
      await savePetStats(db, next);

      const flags = parseFlags(active.flags);
      for (const f of outcome.effects?.setFlags ?? []) {
        if (!flags.includes(f)) flags.push(f);
      }
      const moves = active.moves + 1;
      await insertLog(db, "scenario", `《${def.name}》· ${step.title}：${outcome.text}`, now);

      let message = outcome.text;
      let surprise: string | null = null;
      if (outcome.next === "end" || moves >= 12) {
        const ending = def.endings.find((e) => e.when(flags)) ?? def.endings[def.endings.length - 1];
        if (!ending) throw new Error("剧本缺少结局定义");
        const isReplay = active.completions > 0;
        const rewardCoins = isReplay ? Math.round(ending.rewardCoins * 0.4) : ending.rewardCoins;
        const rewardXp = isReplay ? Math.round(ending.rewardXp * 0.4) : ending.rewardXp;
        const fin: PetRow = { ...next, coins: next.coins + rewardCoins };
        fin.xp += rewardXp;
        const finLevels = applyLevelUps(fin);
        await savePetStats(db, fin);
        const endingsSeen = parseFlags(active.endingsSeen);
        if (!endingsSeen.includes(ending.key)) endingsSeen.push(ending.key);
        await db
          .update(schema.scenarioProgress)
          .set({
            status: "done",
            flags: JSON.stringify(flags),
            moves,
            completions: active.completions + 1,
            endingKey: ending.key,
            endingsSeen: JSON.stringify(endingsSeen),
            updatedAt: now,
          })
          .where(eq(schema.scenarioProgress.scenarioKey, def.key));
        await insertLog(
          db,
          "scenario_end",
          `奇遇《${def.name}》结局「${ending.name}」：${ending.text}纪念品「${def.keepsake}」收好了${isReplay ? "（重演奖励打四折）" : ""}。`,
          now,
        );
        message = `${outcome.text} —— 结局「${ending.name}」：${ending.text}`;
        surprise = `奇遇完结！纪念品「${def.keepsake}」到手，奖励 ${rewardCoins} 毛绒币、经验 +${rewardXp}`;
        ctx.invalidateQueries();
        return {
          ok: true,
          pet: await toPet(db, fin, now),
          log: await loadLog(db),
          message,
          reaction: null,
          surprise,
          leveledTo: finLevels.leveledTo ?? leveledTo,
          evolvedTo: finLevels.evolvedTo ?? evolvedTo,
        };
      }

      const nextStep = typeof outcome.next === "number" ? outcome.next : active.step;
      await db
        .update(schema.scenarioProgress)
        .set({
          step: nextStep,
          flags: JSON.stringify(flags),
          moves,
          updatedAt: now,
        })
        .where(eq(schema.scenarioProgress.scenarioKey, def.key));
      if (evolvedTo !== null) {
        await insertLog(db, "evolve", `进化啦！现在是「${STAGE_NAMES[evolvedTo] ?? ""}」了。`, now);
        message = `进化成了${STAGE_NAMES[evolvedTo] ?? ""}！`;
      }
      ctx.invalidateQueries();
      return {
        ok: true,
        pet: await toPet(db, next, now),
        log: await loadLog(db),
        message,
        reaction: null,
        surprise: null,
        leveledTo,
        evolvedTo,
      };
    },
  }),

  abandonScenario: defineAction({
    description: "放弃当前进行中的奇遇剧本回家（不退精力）；已完成过的剧本保留完成记录与结局收集，只清掉进行中进度。",
    request: z.object({}),
    response: actionResponse,
    handler: async (ctx): Promise<ActionResponse> => {
      const { db, pet, now } = await getSettled(ctx);
      const progressRows = await loadProgress(db);
      const active = progressRows.find((r) => r.status === "active");
      if (!active) throw new Error("现在没有进行中的奇遇");
      const def = scenarioByKey(active.scenarioKey);
      if (active.completions > 0) {
        await db
          .update(schema.scenarioProgress)
          .set({ status: "done", step: 0, flags: "[]", moves: 0, updatedAt: now })
          .where(eq(schema.scenarioProgress.scenarioKey, active.scenarioKey));
      } else {
        await db
          .delete(schema.scenarioProgress)
          .where(eq(schema.scenarioProgress.scenarioKey, active.scenarioKey));
      }
      await insertLog(db, "scenario", `奇遇《${def?.name ?? "奇遇"}》演到一半先回家了，下次重新开演。`, now);
      ctx.invalidateQueries();
      return {
        ok: true,
        pet: await toPet(db, pet, now),
        log: await loadLog(db),
        message: "先回家啦，这个故事下次重新讲",
        reaction: null,
        surprise: null,
        leveledTo: null,
        evolvedTo: null,
      };
    },
  }),
} satisfies ActionsModule;
