// Drizzle schema for the 毛绒团培育小屋: one pet_state row (id = 1) holds the
// whole long-term save; care_log appends every care moment.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const petState = sqliteTable("pet_state", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  stage: integer("stage").notNull(),
  level: integer("level").notNull(),
  xp: integer("xp").notNull(),
  coins: integer("coins").notNull(),
  satiety: integer("satiety").notNull(),
  happiness: integer("happiness").notNull(),
  cleanliness: integer("cleanliness").notNull(),
  energy: integer("energy").notNull(),
  intimacy: integer("intimacy").notNull(),
  invMilk: integer("inv_milk").notNull(),
  invCookie: integer("inv_cookie").notNull(),
  invCake: integer("inv_cake").notNull(),
  totalActions: integer("total_actions").notNull(),
  createdAt: integer("created_at").notNull(),
  lastDecayAt: integer("last_decay_at").notNull(),
  tasksDate: text("tasks_date").notNull(),
  taskFeed: integer("task_feed").notNull(),
  taskPlay: integer("task_play").notNull(),
  taskCare: integer("task_care").notNull(),
  taskClaimed: integer("task_claimed").notNull(),
  lastCheckinDate: text("last_checkin_date").notNull(),
});

export const careLog = sqliteTable("care_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  createdAt: integer("created_at").notNull(),
});

// 后院探险图鉴：每在探险里第一次遇见一位小伙伴 / 找到一件宝物，记一行。
export const exploreFinds = sqliteTable("explore_finds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  foundAt: integer("found_at").notNull(),
});

// 口令本：学会的绝招一行一个（skill_key 与服务端 SKILLS 目录对应），落库长期保留。
export const learnedSkills = sqliteTable("learned_skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  skillKey: text("skill_key").notNull().unique(),
  learnedAt: integer("learned_at").notNull(),
});

// 奇遇剧场：每个剧本一行进度——进行中存当前幕与已积累的剧情 flags（决定分支与
// 结局），完成后记 completions 与见过的结局，支持重演刷不同结局。
export const scenarioProgress = sqliteTable("scenario_progress", {
  scenarioKey: text("scenario_key").primaryKey(),
  status: text("status").notNull(), // active | done
  step: integer("step").notNull(),
  flags: text("flags").notNull(), // JSON string[]
  moves: integer("moves").notNull(),
  completions: integer("completions").notNull(),
  endingKey: text("ending_key"),
  endingsSeen: text("endings_seen").notNull(), // JSON string[]
  updatedAt: integer("updated_at").notNull(),
});
