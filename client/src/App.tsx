import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";
import { TuanScene, type TuanAction, type TuanActionKind } from "./TuanScene";

import stickerLaugh from "./assets/sticker-laugh.webp";
import stickerSmug from "./assets/sticker-smug.webp";
import stickerAngry from "./assets/sticker-angry.webp";
import stickerCry from "./assets/sticker-cry.webp";
import stickerLove from "./assets/sticker-love.webp";
import stickerSleepy from "./assets/sticker-sleepy.webp";
import stickerShocked from "./assets/sticker-shocked.webp";
import stickerCheer from "./assets/sticker-cheer.webp";
import stickerDeadpan from "./assets/sticker-deadpan.webp";

type Pet = ApiResponse<typeof api, "getState">["pet"];
type LogItem = ApiResponse<typeof api, "getState">["log"][number];
type FoodId = "milk" | "cookie" | "cake";
type CareKind = "feed" | "play" | "bath" | "train" | "sleep" | "poke";

const FOODS: { id: FoodId; name: string; price: number; desc: string; invKey: "invMilk" | "invCookie" | "invCake" }[] = [
  { id: "milk", name: "热牛奶", price: 10, desc: "饱食 +18 · 经验 +6", invKey: "invMilk" },
  { id: "cookie", name: "星星饼干", price: 25, desc: "饱食 +30 · 快乐 +10 · 经验 +10", invKey: "invCookie" },
  { id: "cake", name: "云朵蛋糕", price: 60, desc: "饱食 +55 · 快乐 +18 · 经验 +18", invKey: "invCake" },
];

const STICKERS = [
  { id: "laugh", name: "大笑", src: stickerLaugh },
  { id: "smug", name: "得意", src: stickerSmug },
  { id: "angry", name: "生气", src: stickerAngry },
  { id: "cry", name: "委屈", src: stickerCry },
  { id: "love", name: "爱心", src: stickerLove },
  { id: "sleepy", name: "困了", src: stickerSleepy },
  { id: "shocked", name: "震惊", src: stickerShocked },
  { id: "cheer", name: "加油", src: stickerCheer },
  { id: "deadpan", name: "无语", src: stickerDeadpan },
];

const STAGE_NAMES = ["幼团", "小毛团", "蓬蓬团", "圆滚团", "毛绒团长"];

const STAGE_PERKS = [
  {
    level: 1,
    look: "奶白小团，黑角刚冒头",
    surprise: "开养礼包",
    desc: "初始 30 毛绒币 + 热牛奶 ×2，先吃饱再谈梦想。",
  },
  {
    level: 3,
    look: "头顶长出小呆毛，个头大一圈",
    surprise: "探险鼻子",
    desc: "陪玩时有 25% 概率在垫子底下嗅出 5–12 毛绒币，玩着玩着就发财。",
  },
  {
    level: 6,
    look: "戴上粉色蝴蝶结，绒毛蓬起来",
    surprise: "幸运泡泡浴",
    desc: "洗澡时有 20% 概率从泡泡里捞出热牛奶或星星饼干，直接进背包。",
  },
  {
    level: 10,
    look: "圆滚滚，脖子上多了一圈小围巾",
    surprise: "会做梦了",
    desc: "每次哄睡都会做一个梦：梦见蛋糕、星星、牛奶温泉……梦境奖励真的到账（饱食 / 毛绒币 / 经验）。",
  },
  {
    level: 15,
    look: "戴上金星星，团长本长",
    surprise: "团长金光",
    desc: "每天第一次照顾必暴击：经验 +15、毛绒币 +10；每日签到也涨到 25 币（普通 15 币）。",
  },
];

// 探险图鉴目录（与服务端 EXPLORE_FRIENDS / EXPLORE_TREASURES 对应）。
const EXPLORE_CATALOG: { key: string; name: string; kind: string }[] = [
  { key: "hedgehog", name: "刺猬阿针", kind: "小伙伴" },
  { key: "firefly", name: "萤火虫小灯", kind: "小伙伴" },
  { key: "orangecat", name: "橘猫阿橘", kind: "小伙伴" },
  { key: "turtle", name: "乌龟慢慢", kind: "小伙伴" },
  { key: "squirrel", name: "松鼠阿松", kind: "小伙伴" },
  { key: "frog", name: "青蛙呱呱", kind: "小伙伴" },
  { key: "acorn", name: "金橡子", kind: "宝物" },
  { key: "shell", name: "彩虹贝壳", kind: "宝物" },
  { key: "button", name: "星星纽扣", kind: "宝物" },
  { key: "feather", name: "月光羽毛", kind: "宝物" },
];

// 口令本目录（与服务端 SKILLS 对应）：minStage 是解锁所需的进化阶段下标。
const SKILL_CATALOG: { key: string; name: string; minStage: number; desc: string }[] = [
  { key: "spin", name: "转圈圈", minStage: 0, desc: "原地转一整圈，绒毛转出小旋风" },
  { key: "roll", name: "打滚", minStage: 0, desc: "抱着肚子滚一圈，落地还要赖一下" },
  { key: "highfive", name: "击掌", minStage: 0, desc: "高高跳起来跟你击掌" },
  { key: "playsleep", name: "装睡", minStage: 0, desc: "秒躺装睡，偷看你一眼又猛地蹦起来" },
  { key: "earshake", name: "甩耳朵", minStage: 0, desc: "脑袋甩得像小风扇，耳朵呼呼响" },
  { key: "wink", name: "眨眼放电", minStage: 0, desc: "单眼一眨，附赠一颗小爱心" },
  { key: "balltop", name: "顶球", minStage: 0, desc: "拿脑袋连顶三下空气球，不落地" },
  { key: "sing", name: "唱歌", minStage: 0, desc: "摇头晃脑唱一段，跑调也自信" },
  { key: "bowspin", name: "蝴蝶结转圈", minStage: 2, desc: "戴着蝴蝶结连转两圈，裙摆一样飘" },
  { key: "dreamroll", name: "做梦翻滚", minStage: 3, desc: "闭着眼边做梦边翻滚，嘴里还念叨蛋糕" },
  { key: "scarfdance", name: "围巾舞", minStage: 3, desc: "围着小围巾左右摇摆，舞步自成一派" },
  { key: "patrol", name: "团长巡逻", minStage: 4, desc: "迈着方步巡逻小屋，路过还要点头检阅" },
];

// 联动手机震动：不支持震动的设备自动静默。
function buzz(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // 忽略：震动只是锦上添花
  }
}

function pokeTierOf(streak: number): number {
  if (streak >= 6) return 3;
  if (streak >= 4) return 2;
  if (streak >= 2) return 1;
  return 0;
}

function moodOf(pet: Pet): { mood: "happy" | "normal" | "sad" | "sleepy"; line: string } {
  if (pet.energy <= 15) return { mood: "sleepy", line: "困得眼睛都睁不开了，哄我睡一会儿嘛…" };
  if (pet.satiety <= 20) return { mood: "sad", line: "肚子咕咕叫…有吃的吗？" };
  if (pet.cleanliness <= 20) return { mood: "sad", line: "身上痒痒的，想洗个泡泡澡。" };
  if (pet.happiness <= 25) return { mood: "sad", line: "有点无聊，陪我玩一会儿好不好。" };
  if (pet.happiness >= 80 && pet.satiety >= 60)
    return { mood: "happy", line: "今天状态超好！看我原地转个圈！" };
  if (pet.intimacy >= 70) return { mood: "happy", line: "最喜欢你了，嘿嘿。" };
  return { mood: "normal", line: "你来啦！今天想陪我做点什么？" };
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-sm text-[var(--dim)]">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--surface-alt)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, backgroundColor: value <= 20 ? "#e05252" : color }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function App() {
  const stateQuery = useQuery({ queryKey: ["pet-state"], queryFn: () => api.getState({}) });
  const [display, setDisplay] = useState<{ pet: Pet; log: LogItem[] } | null>(null);
  const [anim, setAnim] = useState<TuanAction | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [evolvedStage, setEvolvedStage] = useState<number | null>(null);
  const [surpriseBanner, setSurpriseBanner] = useState<string | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [pokeStreak, setPokeStreak] = useState(0);
  const [lastExplore, setLastExplore] = useState<string | null>(null);
  const [lastScenarioText, setLastScenarioText] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const pokeStreakRef = useRef(0);
  const pokeResetTimer = useRef<number | null>(null);
  const pokeBusyRef = useRef(false);
  const pokePendingRef = useRef(0);

  useEffect(() => {
    if (stateQuery.data) setDisplay(stateQuery.data);
  }, [stateQuery.data]);

  const showToast = (text: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text });
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };
  const triggerAnim = (kind: TuanActionKind, level?: number) =>
    setAnim({ kind, nonce: Date.now() + Math.random(), level });
  const triggerTrick = (trickId: string) =>
    setAnim({ kind: "trick", nonce: Date.now() + Math.random(), trickId });

  const showBubble = (text: string) => {
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    setBubble(text);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), 3000);
  };

  const applyResult = (
    data: ApiResponse<typeof api, "doAction">,
    fallbackAnim?: TuanActionKind,
    trickId?: string,
  ) => {
    setDisplay({ pet: data.pet, log: data.log });
    showToast(data.message);
    if (data.reaction) showBubble(data.reaction);
    if (data.surprise) {
      setSurpriseBanner(data.surprise);
      buzz([60, 80, 60]);
    }
    if (data.evolvedTo !== null) {
      buzz([120, 60, 200]);
      triggerAnim("evolve");
      setEvolvedStage(data.evolvedTo);
    } else if (trickId) {
      buzz([40, 50, 40]);
      triggerTrick(trickId);
    } else if (fallbackAnim) triggerAnim(fallbackAnim);
    else if (data.leveledTo !== null) {
      buzz([50, 60, 50]);
      triggerAnim("play");
    }
  };
  const onErr = (e: unknown) => showToast(e instanceof Error ? e.message : "出了点问题，再试一次");

  const careMutation = useMutation({
    mutationFn: async (input: { kind: CareKind; foodId?: FoodId }) =>
      api.doAction(input.foodId ? { kind: input.kind, foodId: input.foodId } : { kind: input.kind }),
    onMutate: () => buzz(15),
    onSuccess: (data, input) => applyResult(data, input.kind === "feed" ? "feed" : input.kind),
    onError: onErr,
  });
  const buyMutation = useMutation({
    mutationFn: async (foodId: FoodId) => api.buyFood({ foodId }),
    onSuccess: (data) => applyResult(data),
    onError: onErr,
  });
  const claimMutation = useMutation({
    mutationFn: async () => api.claimTasks({}),
    onSuccess: (data) => applyResult(data),
    onError: onErr,
  });
  const checkinMutation = useMutation({
    mutationFn: async () => api.checkin({}),
    onSuccess: (data) => applyResult(data),
    onError: onErr,
  });
  const renameMutation = useMutation({
    mutationFn: async (name: string) => api.rename({ name }),
    onSuccess: (data) => {
      applyResult(data);
      setEditingName(false);
    },
    onError: onErr,
  });
  // 戳一戳单独走一条串行通道：连点时本地先动先震，服务端请求排队补上，不丢次数。
  const pokeMutation = useMutation({
    mutationFn: async (streak: number) => api.doAction({ kind: "poke", pokeStreak: streak }),
    onSuccess: (data) => applyResult(data),
    onError: onErr,
    onSettled: () => {
      if (pokePendingRef.current > 0) {
        pokePendingRef.current -= 1;
        pokeMutation.mutate(pokeStreakRef.current);
      } else {
        pokeBusyRef.current = false;
      }
    },
  });
  const exploreMutation = useMutation({
    mutationFn: async () => api.explore({}),
    onSuccess: (data) => {
      applyResult(data, "play");
      setLastExplore(data.message);
      buzz([40, 60, 40]);
    },
    onError: onErr,
  });
  const learnMutation = useMutation({
    mutationFn: async (skillId: string) => api.learnTrick({ skillId }),
    onSuccess: (data, skillId) => applyResult(data, undefined, skillId),
    onError: onErr,
  });
  const trickMutation = useMutation({
    mutationFn: async (skillId: string) => api.performTrick({ skillId }),
    onSuccess: (data, skillId) => applyResult(data, undefined, skillId),
    onError: onErr,
  });
  const scenarioMutation = useMutation({
    mutationFn: async (
      input:
        | { type: "start"; key: string }
        | { type: "choose"; choiceId: string }
        | { type: "abandon" },
    ) =>
      input.type === "start"
        ? await api.startScenario({ scenarioKey: input.key })
        : input.type === "choose"
          ? await api.chooseScenario({ choiceId: input.choiceId })
          : await api.abandonScenario({}),
    onSuccess: (data) => {
      applyResult(data, "play");
      setLastScenarioText(data.message);
      buzz([40, 60, 40]);
    },
    onError: onErr,
  });

  const doPoke = () => {
    pokeStreakRef.current += 1;
    const streak = pokeStreakRef.current;
    setPokeStreak(streak);
    if (pokeResetTimer.current) window.clearTimeout(pokeResetTimer.current);
    pokeResetTimer.current = window.setTimeout(() => {
      pokeStreakRef.current = 0;
      setPokeStreak(0);
    }, 2500);
    const tier = pokeTierOf(streak);
    buzz(tier === 0 ? 30 : tier === 1 ? [30, 50, 30] : tier === 2 ? [70, 40, 70] : [50, 40, 50, 40, 130]);
    triggerAnim("poke", tier);
    if (careMutation.isPending) return;
    if (pokeBusyRef.current) {
      pokePendingRef.current += 1;
    } else {
      pokeBusyRef.current = true;
      pokeMutation.mutate(streak);
    }
  };

  const busy = careMutation.isPending;

  if (!display) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          {stateQuery.isError ? (
            <>
              <p className="text-base text-[var(--text)]">培育小屋没打开，可能是网络抖了一下。</p>
              <button
                type="button"
                onClick={() => stateQuery.refetch()}
                className="mt-4 rounded-full bg-[var(--accent)] px-5 py-2 font-medium text-white"
              >
                重新打开
              </button>
            </>
          ) : (
            <p className="text-sm text-[var(--dim)]">正在把团子抱出来…</p>
          )}
        </main>
      </div>
    );
  }

  const { pet, log } = display;
  const { mood, line } = moodOf(pet);
  const xpPct = pet.xpNext > 0 ? Math.min(100, Math.round((pet.xp / pet.xpNext) * 100)) : 0;

  const careBtn =
    "flex min-h-11 items-center justify-center rounded-2xl px-3 py-2 text-base font-medium transition active:scale-95 disabled:opacity-50";

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto max-w-3xl px-4 pb-10">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-2 pt-4">
          {editingName ? (
            <span className="flex items-center gap-2">
              <input
                aria-label="团子的新名字"
                value={nameDraft}
                maxLength={8}
                onChange={(e) => setNameDraft(e.target.value)}
                className="min-h-9 w-32 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-lg"
              />
              <button
                type="button"
                disabled={!nameDraft.trim() || renameMutation.isPending}
                onClick={() => renameMutation.mutate(nameDraft.trim())}
                className="rounded-full bg-[var(--accent)] px-4 py-1.5 font-medium text-white disabled:opacity-50"
              >
                存好
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="rounded-full bg-[var(--surface-alt)] px-4 py-1.5"
              >
                算了
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <h1 className="font-display text-3xl leading-none">{pet.name}</h1>
              <button
                type="button"
                aria-label="给团子改名"
                onClick={() => {
                  setNameDraft(pet.name);
                  setEditingName(true);
                }}
                className="rounded-full bg-[var(--surface-alt)] px-3 py-1 text-sm text-[var(--dim)]"
              >
                改名
              </button>
            </span>
          )}
          <span className="rounded-full bg-[var(--pink)] px-3 py-1 text-sm font-medium text-white">
            {pet.stageName}
          </span>
          <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-sm text-[var(--dim)]">
            Lv.{pet.level} · 养了第 {pet.ageDays} 天 · 照顾过 {pet.totalActions} 次
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-semibold text-white tabular-nums">
              毛绒币 {pet.coins}
            </span>
            <button
              type="button"
              disabled={pet.checkedInToday || checkinMutation.isPending}
              onClick={() => checkinMutation.mutate()}
              className="rounded-full bg-[var(--surface)] px-3 py-1 text-sm font-medium ring-1 ring-[var(--border)] disabled:opacity-50"
            >
              {pet.checkedInToday ? "今日已签到" : pet.stage >= 4 ? "签到 +25" : "签到 +15"}
            </button>
          </span>
        </div>

        {/* Daily trait + surprise banner */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius)] bg-[var(--surface)] px-4 py-3 ring-1 ring-[var(--border)]">
          <span className="rounded-full bg-[#7a6fd0] px-3 py-1 text-sm font-semibold text-white">
            今日小脾气 · {pet.dailyTrait.name}
          </span>
          <span className="text-sm text-[var(--dim)]">{pet.dailyTrait.desc}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[var(--radius)] bg-[var(--surface)] px-4 py-3 ring-1 ring-[var(--border)]">
          <span className="rounded-full bg-[#e8893b] px-3 py-1 text-sm font-semibold text-white">
            今日新鲜招 · {pet.freshNews.skillName}
          </span>
          <span className="flex-1 text-sm">
            {pet.freshNews.text}。
            <span className="text-[var(--dim)]">团子说：「{pet.freshNews.line}」</span>
          </span>
          <button
            type="button"
            disabled={trickMutation.isPending || learnMutation.isPending}
            onClick={() =>
              pet.learnedSkills.includes(pet.dailySkillKey)
                ? trickMutation.mutate(pet.dailySkillKey)
                : pet.dailyTrialUsed
                  ? learnMutation.mutate(pet.dailySkillKey)
                  : trickMutation.mutate(pet.dailySkillKey)
            }
            className="min-h-9 rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {pet.learnedSkills.includes(pet.dailySkillKey)
              ? "耍新鲜招（加成中）"
              : pet.dailyTrialUsed
                ? "学下这一招"
                : "先体验一次"}
          </button>
        </div>
        {surpriseBanner ? (
          <div className="mt-2 flex items-start gap-2 rounded-[var(--radius)] bg-[#fff3d6] px-4 py-3 ring-1 ring-[var(--accent)] dark:bg-[#3d2c1f]">
            <p className="flex-1 text-base">
              <span className="font-semibold">惊喜！</span> {surpriseBanner}
            </p>
            <button
              type="button"
              aria-label="关掉惊喜提示"
              onClick={() => setSurpriseBanner(null)}
              className="rounded-full bg-[var(--surface-alt)] px-3 py-1 text-sm"
            >
              收好
            </button>
          </div>
        ) : null}

        {/* 3D stage */}
        <section
          className="relative mt-3 overflow-hidden rounded-[var(--radius)] ring-1 ring-[var(--border)]"
          style={{
            background:
              "linear-gradient(180deg, #ffe9c9 0%, #fff3df 55%, #ffe3ba 100%)",
          }}
        >
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 w-max max-w-[92%] -translate-x-1/2">
            <p className="rounded-2xl bg-white/85 px-4 py-2 text-center text-base shadow-sm backdrop-blur-sm">
              {bubble ?? line}
              {pokeStreak >= 2 ? (
                <span className="ml-2 rounded-full bg-[var(--pink)] px-2 py-0.5 text-xs font-semibold text-white">
                  连戳 ×{pokeStreak}
                </span>
              ) : null}
            </p>
          </div>
          <div className="h-[340px] sm:h-[400px]">
            <TuanScene stage={pet.stage} mood={mood} action={anim} onPoke={doPoke} />
          </div>
          <p className="pb-2.5 text-center text-xs text-[#9a7d63]">
            拖一拖转着看 · 点它戳一戳，手机会震哦
          </p>
        </section>

        {/* Stats */}
        <section className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
          <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-x-6">
            <StatBar label="饱食" value={pet.satiety} color="#e8893b" />
            <StatBar label="快乐" value={pet.happiness} color="#f28ba8" />
            <StatBar label="清洁" value={pet.cleanliness} color="#5ea8cf" />
            <StatBar label="精力" value={pet.energy} color="#7fbf9e" />
            <StatBar label="亲密度" value={pet.intimacy} color="#e86a5e" />
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-sm text-[var(--dim)]">经验</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--surface-alt)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                  style={{ width: `${xpPct}%` }}
                />
              </div>
              <span className="shrink-0 text-sm tabular-nums">
                {pet.xp}/{pet.xpNext}
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STAGE_NAMES.map((name, i) => (
              <span
                key={name}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  i === pet.stage
                    ? "bg-[var(--accent)] font-semibold text-white"
                    : i < pet.stage
                      ? "bg-[var(--surface-alt)] text-[var(--text)]"
                      : "bg-[var(--surface-alt)] text-[var(--dim)] opacity-60"
                }`}
              >
                {name}
                {i === pet.stage ? " · 现在" : ""}
              </span>
            ))}
          </div>
        </section>

        {/* Care actions */}
        <section className="mt-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <button type="button" disabled={busy} onClick={() => careMutation.mutate({ kind: "play" })}
              className={`${careBtn} bg-[var(--pink)] text-white`}>陪玩</button>
            <button type="button" disabled={busy} onClick={() => careMutation.mutate({ kind: "bath" })}
              className={`${careBtn} bg-[#5ea8cf] text-white`}>洗澡</button>
            <button type="button" disabled={busy} onClick={() => careMutation.mutate({ kind: "train" })}
              className={`${careBtn} bg-[var(--accent-deep)] text-white`}>特训</button>
            <button type="button" disabled={busy} onClick={() => careMutation.mutate({ kind: "sleep" })}
              className={`${careBtn} bg-[#7a6fd0] text-white`}>哄睡</button>
            <button type="button" onClick={doPoke}
              className={`${careBtn} bg-[var(--surface)] ring-1 ring-[var(--border)]`}>戳一戳</button>
            <button type="button" onClick={() => triggerAnim("play")}
              className={`${careBtn} bg-[var(--surface)] ring-1 ring-[var(--border)]`}>转一圈看看</button>
          </div>
        </section>

        {/* Trick book / 口令本 */}
        <section className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">口令本</h2>
            <span className="text-sm text-[var(--dim)]">
              已学会 {pet.learnedSkills.length}/{SKILL_CATALOG.length} 招
            </span>
            <span className="text-sm text-[var(--dim)]">
              学一招：精力 -10 · {pet.learnFreeToday ? "今日首次学习免币" : "15 毛绒币（今日首次已免）"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SKILL_CATALOG.map((skill) => {
              const learned = pet.learnedSkills.includes(skill.key);
              const locked = pet.stage < skill.minStage;
              const isDaily = pet.dailySkillKey === skill.key;
              const trickBusy = trickMutation.isPending || learnMutation.isPending;
              return (
                <div
                  key={skill.key}
                  className={`rounded-2xl px-3 py-2.5 ring-1 ${
                    isDaily
                      ? "bg-[#fff3d6] ring-[var(--accent)] dark:bg-[#3d2c1f]"
                      : learned
                        ? "bg-[var(--surface-alt)] ring-transparent"
                        : "bg-[var(--surface-alt)] ring-transparent"
                  } ${locked ? "opacity-55" : ""}`}
                >
                  <p className="flex flex-wrap items-center gap-1.5 font-medium leading-tight">
                    {skill.name}
                    {isDaily ? (
                      <span className="rounded-full bg-[#e8893b] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        今日新鲜招
                      </span>
                    ) : null}
                    {learned ? (
                      <span className="rounded-full bg-[var(--mint)] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        已学会
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-[var(--dim)]">{skill.desc}</p>
                  <div className="mt-2">
                    {locked ? (
                      <span className="text-xs text-[var(--dim)]">
                        长到「{STAGE_NAMES[skill.minStage]}」解锁
                      </span>
                    ) : learned ? (
                      <button
                        type="button"
                        disabled={trickBusy}
                        onClick={() => trickMutation.mutate(skill.key)}
                        className="min-h-9 rounded-full bg-[var(--pink)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {isDaily ? "耍一个 · 加成中" : "耍一个"}
                      </button>
                    ) : isDaily && !pet.dailyTrialUsed ? (
                      <span className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={trickBusy}
                          onClick={() => trickMutation.mutate(skill.key)}
                          className="min-h-9 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          先体验
                        </button>
                        <button
                          type="button"
                          disabled={trickBusy}
                          onClick={() => learnMutation.mutate(skill.key)}
                          className="min-h-9 rounded-full bg-[var(--surface)] px-3.5 py-1.5 text-sm font-medium ring-1 ring-[var(--border)] disabled:opacity-50"
                        >
                          学这个
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={trickBusy}
                        onClick={() => learnMutation.mutate(skill.key)}
                        className="min-h-9 rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {isDaily && pet.dailyTrialUsed ? "学这个（已体验）" : "学这个"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Scenario theatre — multi-act branching stories */}
        <section className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">奇遇剧场</h2>
            <span className="rounded-full bg-[#5ea8cf] px-2.5 py-0.5 text-xs font-semibold text-white">
              后院天气 · {pet.weather.name}
            </span>
            <span className="text-sm text-[var(--dim)]">每幕都要做选择，选法不同，结局不同</span>
          </div>

          {pet.activeScenario ? (
            <div className="mt-3 rounded-2xl bg-[#fff3d6] p-4 ring-1 ring-[var(--accent)] dark:bg-[#3d2c1f]">
              <p className="text-sm font-medium text-[var(--dim)]">
                《{pet.activeScenario.name}》· 第 {pet.activeScenario.act} 幕 · {pet.activeScenario.stepTitle}
              </p>
              {lastScenarioText ? (
                <p className="mt-2 rounded-xl bg-white/60 px-3 py-2 text-sm dark:bg-black/20">
                  {lastScenarioText}
                </p>
              ) : null}
              <p className="mt-2.5 text-base leading-relaxed">{pet.activeScenario.text}</p>
              <div className="mt-3 grid gap-2">
                {pet.activeScenario.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={scenarioMutation.isPending}
                    onClick={() => scenarioMutation.mutate({ type: "choose", choiceId: choice.id })}
                    className="flex min-h-11 flex-wrap items-center gap-2 rounded-2xl bg-[var(--surface)] px-4 py-2.5 text-left font-medium ring-1 ring-[var(--border)] transition active:scale-[0.98] disabled:opacity-50"
                  >
                    <span className="flex-1">{choice.label}</span>
                    {choice.checkLabel ? (
                      <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-xs text-[var(--dim)]">
                        {choice.checkLabel}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={scenarioMutation.isPending}
                onClick={() => scenarioMutation.mutate({ type: "abandon" })}
                className="mt-3 rounded-full bg-[var(--surface-alt)] px-4 py-1.5 text-sm text-[var(--dim)] disabled:opacity-50"
              >
                先回家（放弃这场）
              </button>
            </div>
          ) : (
            <>
              {lastScenarioText ? (
                <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[#fff3d6] px-4 py-3 ring-1 ring-[var(--accent)] dark:bg-[#3d2c1f]">
                  <p className="flex-1 text-sm leading-relaxed">{lastScenarioText}</p>
                  <button
                    type="button"
                    aria-label="关掉奇遇播报"
                    onClick={() => setLastScenarioText(null)}
                    className="rounded-full bg-[var(--surface-alt)] px-3 py-1 text-sm"
                  >
                    收好
                  </button>
                </div>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {pet.scenarios.map((s) => (
                  <div
                    key={s.key}
                    className={`rounded-2xl px-3.5 py-3 ring-1 ${
                      s.status === "done"
                        ? "bg-[#fff3d6] ring-[var(--accent)] dark:bg-[#3d2c1f]"
                        : "bg-[var(--surface-alt)] ring-transparent"
                    } ${s.status === "locked" ? "opacity-60" : ""}`}
                  >
                    <p className="flex flex-wrap items-center gap-1.5 font-medium leading-tight">
                      《{s.name}》
                      {s.status === "done" ? (
                        <span className="rounded-full bg-[var(--mint)] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                          已完结
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--dim)]">
                      {s.place} · 纪念品「{s.keepsake}」
                    </p>
                    <p className="mt-1 text-sm leading-snug">{s.desc}</p>
                    {s.status === "done" ? (
                      <p className="mt-1.5 flex flex-wrap gap-1">
                        {s.endings.map((e) => (
                          <span
                            key={e.key}
                            className={`rounded-full px-2 py-0.5 text-[11px] ${
                              s.endingsSeen.includes(e.key)
                                ? "bg-[var(--accent)] font-semibold text-white"
                                : "bg-[var(--surface)] text-[var(--dim)]"
                            }`}
                          >
                            {s.endingsSeen.includes(e.key) ? e.name : "？？？结局"}
                          </span>
                        ))}
                      </p>
                    ) : null}
                    <div className="mt-2.5">
                      {s.status === "locked" ? (
                        <span className="text-xs text-[var(--dim)]">{s.lockReason}</span>
                      ) : (
                        <button
                          type="button"
                          disabled={scenarioMutation.isPending || pet.energy < 15}
                          onClick={() => scenarioMutation.mutate({ type: "start", key: s.key })}
                          className="min-h-9 rounded-full bg-[#7a6fd0] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                        >
                          {s.status === "done" ? "再演一遍 · 精力 -15（奖励四折）" : "开演 · 精力 -15"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {pet.energy < 15 ? (
                <p className="mt-2 text-sm text-[var(--dim)]">精力不够开演啦，先吃点东西睡一觉。</p>
              ) : null}
            </>
          )}
        </section>

        {/* Backyard explore */}
        <section className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">后院探险</h2>
            <span className="text-sm text-[var(--dim)]">
              图鉴 {pet.finds.length}/{EXPLORE_CATALOG.length}
            </span>
            <button
              type="button"
              disabled={pet.energy < 10 || exploreMutation.isPending}
              onClick={() => exploreMutation.mutate()}
              className="ml-auto min-h-11 rounded-full bg-[var(--mint)] px-5 py-2 font-medium text-white disabled:opacity-40"
            >
              {exploreMutation.isPending ? "探险中…" : "出门探险 · 精力 -10"}
            </button>
          </div>
          {pet.energy < 10 ? (
            <p className="mt-1.5 text-sm text-[var(--dim)]">精力不够啦，先吃点东西睡一觉再出门。</p>
          ) : null}
          {lastExplore ? <p className="mt-2 text-base">{lastExplore}</p> : null}
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {EXPLORE_CATALOG.map((item) => {
              const found = pet.finds.some((f) => f.key === item.key);
              return (
                <div
                  key={item.key}
                  className={`rounded-xl px-1.5 py-2 text-center ring-1 ${
                    found
                      ? "bg-[#fff3d6] ring-[var(--accent)] dark:bg-[#3d2c1f]"
                      : "bg-[var(--surface-alt)] opacity-55 ring-transparent"
                  }`}
                >
                  <p className="text-sm font-medium leading-tight">{found ? item.name : "？？？"}</p>
                  <p className="mt-0.5 text-xs text-[var(--dim)]">{found ? item.kind : "还没遇见"}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Backpack & shop */}
        <section className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
          <h2 className="font-display text-xl">背包与小卖部</h2>
          <div className="mt-2 divide-y divide-[var(--border)]">
            {FOODS.map((food) => {
              const count = pet[food.invKey];
              return (
                <div key={food.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-36 flex-1">
                    <p className="font-medium">
                      {food.name}
                      <span className="ml-2 text-sm text-[var(--dim)]">背包 ×{count}</span>
                    </p>
                    <p className="text-xs text-[var(--dim)]">{food.desc}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || count <= 0}
                    onClick={() => careMutation.mutate({ kind: "feed", foodId: food.id })}
                    className="rounded-full bg-[var(--accent)] px-4 py-1.5 font-medium text-white disabled:opacity-40"
                  >
                    喂它
                  </button>
                  <button
                    type="button"
                    disabled={buyMutation.isPending || pet.coins < food.price}
                    onClick={() => buyMutation.mutate(food.id)}
                    className="rounded-full bg-[var(--surface-alt)] px-4 py-1.5 font-medium disabled:opacity-40"
                  >
                    买一份 {food.price} 币
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Daily tasks */}
        <section className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl">今日照料任务</h2>
            <button
              type="button"
              disabled={!pet.tasks.allDone || pet.tasks.claimed || claimMutation.isPending}
              onClick={() => claimMutation.mutate()}
              className="rounded-full bg-[var(--accent)] px-4 py-1.5 font-medium text-white disabled:opacity-40"
            >
              {pet.tasks.claimed ? "已领取" : "领取 30 币"}
            </button>
          </div>
          <ul className="mt-2 space-y-1.5 text-base">
            {[
              { done: pet.tasks.feed, label: "喂一次食" },
              { done: pet.tasks.play, label: "陪玩一次" },
              { done: pet.tasks.care, label: "护理一次（洗澡 / 特训 / 哄睡）" },
            ].map((t) => (
              <li key={t.label} className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs text-white ${
                    t.done ? "bg-[var(--mint)]" : "bg-[var(--border)]"
                  }`}
                  aria-hidden
                >
                  {t.done ? "✓" : ""}
                </span>
                <span className={t.done ? "text-[var(--dim)] line-through" : ""}>{t.label}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Atlas & rules — collapsed by default to keep the page light */}
        <details className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
          <summary className="cursor-pointer list-none">
            <span className="font-display text-xl">图鉴与玩法</span>
            <span className="ml-2 text-sm text-[var(--dim)]">
              下一阶 Lv.{STAGE_PERKS[pet.stage + 1]?.level ?? "—"} 解锁「{STAGE_PERKS[pet.stage + 1]?.surprise ?? "已全部解锁"}」· 点开看全部
            </span>
          </summary>
          <div className="mt-3 space-y-2">
            {STAGE_PERKS.map((perk, i) => {
              const unlocked = i <= pet.stage;
              return (
                <p key={perk.surprise} className={`text-sm ${unlocked ? "" : "opacity-55"}`}>
                  <span className="font-medium">{STAGE_NAMES[i]}</span>
                  <span className="text-[var(--dim)]"> Lv.{perk.level} · {perk.look} · </span>
                  {unlocked ? `已解锁「${perk.surprise}」` : `未解锁「${perk.surprise}」`}
                  <span className="text-[var(--dim)]"> — {perk.desc}</span>
                </p>
              );
            })}
          </div>
          <ul className="mt-3 list-disc space-y-1 border-t border-[var(--border)] pt-3 pl-5 text-sm text-[var(--dim)]">
            <li>每日小脾气：顺着顶上的紫色标签照顾，收益更高。</li>
            <li>口令本：学一招花精力 10，当天第一次学免币、之后每招 15 币；学会了永久保留，耍绝招也算一次照顾（能凑三连招）。</li>
            <li>今日新鲜招：每天换一招，没学会也能先体验一次；已学会的当天耍它，快乐和经验翻倍。新鲜事和新鲜招是配套的，每天都换。</li>
            <li>奇遇剧场：多幕分支故事，开演花精力 15。每幕的选择会考验绝招、图鉴收藏、五维、背包和天气——过关与否走向不同剧情，结局按你一路的选择判定（每剧本 2–3 种），完结得纪念品；演过的剧本可重演刷别的结局，奖励四折。进度自动存档，演到一半关掉下次接着演。</li>
            <li>三连招：连续三次照顾互不重样，第三下 +15 币、经验 +10。</li>
            <li>闪闪发光：照顾后五维全 ≥75，奖励 8 币。</li>
            <li>连戳彩蛋：对着团子连戳，正好第 10 下有惊喜掉落。</li>
            <li>五维按真实时间掉（单次结算封顶 24 小时）；经验靠照顾攒，每级需 等级×40。</li>
            <li>币的来源：签到 15（团长 25）、今日任务 30，外加连招、探险、梦境等掉落。</li>
          </ul>
        </details>


        {/* Care log */}
        <section className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
          <h2 className="font-display text-xl">培育日志</h2>
          {log.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--dim)]">还没有记录，喂它第一口吃的开始记录吧。</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {log.slice(0, 8).map((item) => (
                <li key={item.id} className="flex gap-3 text-sm">
                  <span className="shrink-0 tabular-nums text-[var(--dim)]">{formatTime(item.created_at)}</span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ExpressionCorner />
      </main>

      {evolvedStage !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" role="dialog" aria-modal="true" aria-label="进化惊喜">
          <div className="w-full max-w-sm rounded-[var(--radius)] bg-[var(--surface)] p-5 text-center shadow-xl ring-1 ring-[var(--border)]">
            <p className="text-sm font-medium text-[var(--dim)]">进化啦！</p>
            <p className="font-display mt-1 text-3xl">{STAGE_NAMES[evolvedStage]}</p>
            <p className="mt-2 text-base">
              新样子：{STAGE_PERKS[evolvedStage]?.look}
            </p>
            <p className="mt-2 rounded-2xl bg-[#fff3d6] px-3.5 py-3 text-base dark:bg-[#3d2c1f]">
              <span className="font-semibold">解锁惊喜 · {STAGE_PERKS[evolvedStage]?.surprise}</span>
              <br />
              <span className="text-sm">{STAGE_PERKS[evolvedStage]?.desc}</span>
            </p>
            <button
              type="button"
              onClick={() => setEvolvedStage(null)}
              className="mt-4 min-h-11 w-full rounded-full bg-[var(--accent)] px-5 py-2 font-medium text-white"
            >
              太棒了，继续养
            </button>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div key={toast.id} className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <p className="toast-pop rounded-full bg-[var(--text)] px-5 py-2.5 text-base text-[var(--bg)] shadow-lg">
            {toast.text}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ExpressionCorner() {
  const [sel, setSel] = useState(0);
  const [caption, setCaption] = useState("");
  const [busyPng, setBusyPng] = useState(false);
  const sticker = STICKERS[sel] ?? STICKERS[0];

  const exportPng = async () => {
    if (!sticker || busyPng) return;
    setBusyPng(true);
    try {
      const img = new Image();
      img.src = sticker.src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 880;
      const g = canvas.getContext("2d");
      if (!g) return;
      g.fillStyle = "#fff6ea";
      g.fillRect(0, 0, 720, 880);
      g.drawImage(img, 60, 24, 600, 600);
      const text = caption.trim();
      if (text) {
        g.fillStyle = "#4a3525";
        g.textAlign = "center";
        g.font = "bold 62px 'PingFang SC', 'Hiragino Sans GB', sans-serif";
        const lines =
          text.length > 9 ? [text.slice(0, Math.ceil(text.length / 2)), text.slice(Math.ceil(text.length / 2))] : [text];
        lines.forEach((ln, i) => {
          g.fillText(ln, 360, 724 + i * 84);
        });
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `毛绒团-${sticker.name}${text ? "-" + text.slice(0, 6) : ""}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setBusyPng(false);
    }
  };

  return (
    <>
      <section className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
        <h2 className="font-display text-xl">表情墙</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {STICKERS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSel(i)}
              aria-label={`选择表情：${s.name}`}
              aria-pressed={i === sel}
              className={`overflow-hidden rounded-2xl ring-2 transition ${
                i === sel ? "ring-[var(--accent)]" : "ring-transparent hover:ring-[var(--border)]"
              }`}
            >
              <img src={s.src} alt={`毛绒团${s.name}表情`} className="aspect-square w-full object-cover" />
              <span className="block bg-[var(--surface-alt)] py-1 text-center text-xs">{s.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-[var(--radius)] bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
        <h2 className="font-display text-xl">配字台</h2>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row">
          <div className="mx-auto w-52 shrink-0 overflow-hidden rounded-2xl bg-[#fff6ea] ring-1 ring-[var(--border)]">
            {sticker ? <img src={sticker.src} alt="配字预览" className="aspect-square w-full object-cover" /> : null}
            <p className="min-h-10 px-2 py-2 text-center text-base font-bold text-[#4a3525]">
              {caption.trim() || "（配字会出现在这里）"}
            </p>
          </div>
          <div className="flex-1">
            <label htmlFor="caption-input" className="text-sm text-[var(--dim)]">
              给「{sticker?.name}」配句话
            </label>
            <input
              id="caption-input"
              value={caption}
              maxLength={18}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="比如：拿来吧你"
              className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base"
            />
            <button
              type="button"
              disabled={busyPng}
              onClick={exportPng}
              className="mt-3 rounded-full bg-[var(--accent)] px-5 py-2 font-medium text-white disabled:opacity-50"
            >
              {busyPng ? "正在生成…" : "生成表情包 PNG"}
            </button>
            <p className="mt-2 text-xs text-[var(--dim)]">导出 720×880 的图，存下来就能发出去用。</p>
          </div>
        </div>
      </section>
    </>
  );
}
