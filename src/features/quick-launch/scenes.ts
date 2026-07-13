/**
 * Scene Definitions & Auto-classification / 场景定义与自动分类
 *
 * AI 五大子场景均为精确枚举（白名单），无启发式兜底。
 * 每条规则独立一行，附带中文注释。
 */
import type { AppInfo } from "@/lib/tauri/types/app-manager"
import type { LaunchScene, LaunchSceneKey } from "@/features/quick-launch/types"

export const SCENE_RULES_VERSION = "quick-launch-rules-v1"

export const LAUNCH_SCENES: LaunchScene[] = [
  { key: "dev", labelKey: "quickLaunch.scene.dev", icon: "Code2" },
  { key: "ai-ide", labelKey: "quickLaunch.scene.aiIde", icon: "Bot" },
  { key: "ai-claw", labelKey: "quickLaunch.scene.aiClaw", icon: "Zap" },
  { key: "ai-assistant", labelKey: "quickLaunch.scene.aiAssistant", icon: "Sparkles" },
  { key: "ai-office", labelKey: "quickLaunch.scene.aiOffice", icon: "Briefcase" },
  { key: "ai-model", labelKey: "quickLaunch.scene.aiModel", icon: "Cpu" },
  { key: "ai-tool", labelKey: "quickLaunch.scene.aiTool", icon: "Wrench" },
  { key: "writing", labelKey: "quickLaunch.scene.writing", icon: "PenTool" },
  { key: "browser", labelKey: "quickLaunch.scene.browser", icon: "Globe" },
  { key: "communication", labelKey: "quickLaunch.scene.communication", icon: "MessageCircle" },
  { key: "design", labelKey: "quickLaunch.scene.design", icon: "Palette" },
  { key: "entertainment", labelKey: "quickLaunch.scene.entertainment", icon: "Play" },
  { key: "system", labelKey: "quickLaunch.scene.system", icon: "Cog" },
  { key: "other", labelKey: "quickLaunch.scene.other", icon: "MoreHorizontal" },
]

/** bundleId 或 name 匹配数组中任一模式 */
function matchAny(bid: string, name: string, patterns: string[]): boolean {
  return patterns.some((p) => bid.includes(p) || name.toLowerCase().includes(p))
}

export function classifyAppToScene(app: AppInfo): LaunchSceneKey {
  const bid = app.bundleId.toLowerCase()
  const name = app.name.toLowerCase()

  // ═══════════════════════════════════════════════════════════════
  // AI IDE — AI 编程/编辑器（含传统 IDE）
  // ═══════════════════════════════════════════════════════════════
  if (
    matchAny(bid, name, [
      // ── 传统 IDE ──
      "com.microsoft.vscode", // VS Code
      "vscode", // VS Code（名称匹配）
      "com.jetbrains.", // JetBrains 全家桶（WebStorm/IntelliJ/PyCharm/GoLand/Rider）
      "webstorm", // WebStorm
      "intellij", // IntelliJ IDEA
      "pycharm", // PyCharm
      "goland", // GoLand
      "rider", // Rider
      "com.github.", // GitHub Desktop
      "gitkraken", // GitKraken
      "com.sublimetext.", // Sublime Text
      "sublime", // Sublime Text（名称匹配）
      "com.apple.dt.xcode", // Xcode
      "xcode", // Xcode（名称匹配）
      "com.coteditor.", // CotEditor
      "com.neovide.", // Neovide
      "dev.zed.", // Zed 编辑器
      "com.zed.", // Zed 编辑器
      "zed", // Zed 编辑器（名称匹配）
      "android studio", // Android Studio
      "com.google.android.studio", // Android Studio
      // ── Antigravity IDE 系列（排除 Tools 版本）──
      "antigravity-ide", // Antigravity IDE
      "com.google.antigravity", // Antigravity（基础版/IDE 版）
      // ── 开发工具（容器/API/数据库）──
      "com.docker.", // Docker Desktop
      "docker", // Docker（名称匹配）
      "com.getpostman.", // Postman
      "postman", // Postman（名称匹配）
      "com.tableplus.", // TablePlus
      "com.sequelpro.", // Sequel Pro
      "com.redis.", // Redis Desktop Manager
      "com.tadpole.", // Tadpole（DB 工具）
      "com.electron.insomnia", // Insomnia
      "com.1password", // 1Password
      "com.tower2.", // Tower Git
      "com.sourcetree.", // SourceTree
      "com.axosoft.", // GitKraken（旧 bundleId）
      "com.smartgit.", // SmartGit
      // ── AI 原生编辑器 ──
      "com.cursor.", // Cursor（排除助手版本，见下方排除）
      "cursor", // Cursor（名称匹配，排除助手版本）
      "com.codeium.", // Codeium
      "com.windsurf", // Windsurf
      "windsurf", // Windsurf（名称匹配）
      "com.trae.", // Trae IDE（字节跳动）
      "com.bytedance.trae", // Trae（字节跳动）
      "trae", // Trae（名称匹配）
      "cn.trae.app", // Trae CN
      "com.augmentcode.", // Augment Code
      "augment", // Augment（名称匹配）
      "com.github.copilot", // GitHub Copilot 独立端
      "com.sourcegraph.cody", // Cody
      "cody", // Cody（名称匹配）
      "com.amazon.q", // Amazon Q Developer
      "com.replit.", // Replit
      "com.stackblitz.", // StackBlitz
      "com.bolt.", // Bolt.new
      "com.lovable.", // Lovable
      "com.vercel.v0", // v0（Vercel）
      "com.cline.", // Cline
      "cline", // Cline（名称匹配）
      "com.continue.", // Continue
      "com.pearai.", // PearAI
      "com.voideditor.", // Void Editor
      "com.melty.", // Melty
      // ── 国产 AI 编程工具 ──
      "codebuddy", // CodeBuddy / CodeBuddy CN（腾讯）
      "com.tencent.codebuddy", // CodeBuddy
      "hbuilderx", // HBuilderX（DCloud）
      "io.dcloud.hbuilderx", // HBuilderX
      "opencode", // OpenCode
      "ai.opencode.desktop", // OpenCode
      "zcode", // ZCode
      "dev.zcode.app", // ZCode
      "qoder", // Qoder CN
      "com.aliyun.lingma.ide", // Qoder CN（灵码）
      "dev.kiro.desktop", // Kiro IDE（排除 AccountManager）
      "com.tencent.webchatdev", // 微信开发者工具
      "com.wechat.devtools", // 微信开发者工具
      "com.tencent.wechatdev", // 微信开发者工具
      "com.tencent.webplusdevtools", // 微信开发者工具（webplus 版 bundleId）
      "wechat devtools", // 微信开发者工具（名称匹配）
      "微信开发者工具", // 微信开发者工具（中文匹配）
    ]) &&
    // 排除：Trae Solo/Work → ai-office
    !name.includes("solo") &&
    !name.includes("work") &&
    // 排除：Antigravity Tools → ai-tool
    !bid.includes("antigravity-tools") &&
    !name.includes("antigravity tools") &&
    // 排除：Kiro AccountManager → ai-tool
    !bid.includes("account-manager") &&
    !name.includes("accountmanager") &&
    !name.includes("account manager") &&
    // 排除：Cursor助手 → ai-tool
    !name.includes("助手") &&
    !name.includes("assistant")
  )
    return "ai-ide"

  // ═══════════════════════════════════════════════════════════════
  // AI OFFICE — AI 办公（Notion/Obsidian/Manus/Trae Solo/Dumate...）
  // ═══════════════════════════════════════════════════════════════
  if (
    matchAny(bid, name, [
      // ── Trae 非编程模式 ──
      "trae solo", // Trae Solo（MTC 模式）
      "trae work", // TRAE Work（办公模式）
      "com.trae.solo.app", // Trae Solo
      "cn.trae.solo.app", // Trae Solo CN
      // ── AI 办公平台 ──
      "com.bytedance.coze", // Coze（扣子）— 字节 AI 办公平台
      "com.coze.", // Coze
      "coze", // Coze（名称匹配）
      // ── AI 演示/文档 ──
      "com.gamma.", // Gamma（AI PPT/网站）
      "gamma", // Gamma（名称匹配）
      "com.tome.", // Tome
      "tome", // Tome（名称匹配）
      "com.beautiful.ai", // Beautiful.ai
      "com.beautifulai", // Beautiful.ai
      // ── AI 内容/写作 ──
      "com.jasper.", // Jasper
      "jasper", // Jasper（名称匹配）
      "com.writesonic.", // Writesonic
      "com.copyai.", // Copy.ai
      "com.copy.ai", // Copy.ai
      "com.grammarly.", // Grammarly
      "grammarly", // Grammarly（名称匹配）
      // ── AI 音视频/会议 ──
      "com.descript.", // Descript（AI 视频编辑）
      "com.otter.", // Otter.ai（AI 会议记录）
      "ai.otter", // Otter.ai
      "com.fireflies.", // Fireflies.ai（AI 会议助手）
      "ai.fireflies", // Fireflies.ai
      // ── AI 笔记/知识管理 ──
      "com.mem.", // Mem（AI 笔记）
      "ai.mem", // Mem
      "com.taskade.", // Taskade（AI 项目管理）
      "com.usemotion.", // Motion（AI 日程）
      "com.superhuman.", // Superhuman（AI 邮件）
      "com.lex.page", // Lex（AI 写作）
      "com.decktopus.", // Decktopus
      "com.slidesai.", // Slides AI
      "notion.", // Notion（AI 办公）
      "notion.id", // Notion
      "md.obsidian", // Obsidian（知识管理）
      "obsidian", // Obsidian（名称匹配）
      "com.craft.documents", // Craft
      "craft", // Craft（名称匹配）
      // ── AI Agent/副手（办公类）──
      "im.manus.", // Manus（通用 AI Agent）
      "manus", // Manus（名称匹配）
      "com.dumate.", // Dumate
      "dumate", // Dumate（名称匹配）
      "com.baidu.qianfan.desktop", // DuMate（百度千帆）
      "com.tencent.workbuddy", // WorkBuddy（腾讯 AI 办公）
      "com.workbuddy.", // WorkBuddy
      "workbuddy", // WorkBuddy（名称匹配）
      "com.cuemate.", // Cuemate
      "cuemate", // Cuemate（名称匹配）
      "com.tencent.imamac", // ima.copilot（腾讯 AI 办公）
      "ima.copilot", // ima.copilot（名称匹配）
      // ── 其他 AI 办公 ──
      "marvis", // Marvis
      "com.tencent.mac.marvis", // Marvis（腾讯）
      "com.sensetime.desktop.raccoon", // 商汤 office-raccoon（AI 办公）
      "office-raccoon", // office-raccoon（名称匹配）
    ])
  )
    return "ai-office"

  // ═══════════════════════════════════════════════════════════════
  // AI CLAW — OpenClaw 生态
  // ═══════════════════════════════════════════════════════════════
  if (
    matchAny(bid, name, [
      "ai.openclaw", // OpenClaw（AI 标识）
      "com.openclaw", // OpenClaw
      "openclaw", // OpenClaw（名称匹配）
      "autoclaw", // AutoClaw
      "com.lobsterai.", // LobsterAI
      "lobster", // Lobster（名称匹配）
    ])
  )
    return "ai-claw"

  // ═══════════════════════════════════════════════════════════════
  // AI MODEL — 本地模型推理与 AI 图像
  // ═══════════════════════════════════════════════════════════════
  if (
    matchAny(bid, name, [
      // ── 模型运行 ──
      "com.electron.ollama", // Ollama
      "com.ollama.", // Ollama
      "ai.ollama", // Ollama
      "ollama", // Ollama（名称匹配）
      "com.lmstudio", // LM Studio
      "ai.lmstudio", // LM Studio
      "com.lm-studio", // LM Studio
      "lm studio", // LM Studio（名称匹配）
      "ai.elementlabs.lmstudio", // LM Studio（Element Labs）
      // ── 图像生成 ──
      "com.comfyui.", // ComfyUI
      "com.comfyorg.", // ComfyUI
      "org.comfyui", // ComfyUI
      "comfyui", // ComfyUI（名称匹配）
      "comfy", // ComfyUI（简称）
      "com.todesktop.241012ess7yxs0e", // Comfy Desktop
      "comfy desktop", // Comfy Desktop（名称匹配）
      "com.mnn.", // MNN（阿里）
      "ai.mnn", // MNN
      "mnn", // MNN（名称匹配）
      "ai.unsloth.", // Unsloth
      "com.unsloth.", // Unsloth
      "unsloth", // Unsloth（名称匹配）
      "com.jan.", // Jan
      "ai.jan", // Jan
      "jan", // Jan（名称匹配）
      "com.nomic.gpt4all", // GPT4All
      "ai.gpt4all", // GPT4All
      "gpt4all", // GPT4All（名称匹配）
      "com.localai.", // LocalAI
      "ai.localai", // LocalAI
      "com.automatic1111", // AUTOMATIC1111（SD WebUI）
      "com.stablediffusion", // Stable Diffusion
      "com.stability.", // Stability AI
      "ai.stability", // Stability AI
      "stable diffusion", // Stable Diffusion（名称匹配）
      "com.invokeai.", // InvokeAI
      "ai.invoke", // InvokeAI
      "com.drawthings.", // Draw Things
      "com.diffusionbee", // DiffusionBee
      "draw things", // Draw Things（名称匹配）
      "diffusionbee", // DiffusionBee（名称匹配）
      "com.huggingface.", // Hugging Face
      "ai.huggingface", // Hugging Face
      "hugging face", // Hugging Face（名称匹配）
      "com.pinokio.", // Pinokio
      "pinokio", // Pinokio（名称匹配）
      "ai.elementlabs.", // Element Labs
      "com.exo.", // Exo（分布式推理）
      "ai.exo", // Exo
      "com.nousresearch.hermes", // Hermes One（Nous Research LLM）
      "nousresearch", // Nous Research（名称匹配）
      // ── Apple 内置 AI 图像工具 ──
      "com.apple.generativeplaygroundapp", // Image Playground
      "image playground", // Image Playground（名称匹配）
    ])
  )
    return "ai-model"

  // ═══════════════════════════════════════════════════════════════
  // AI TOOL — AI 辅助工具（翻译/环境管理/面试辅助/多模型客户端等）
  // ═══════════════════════════════════════════════════════════════
  if (
    matchAny(bid, name, [
      // ── 多模型/AI 客户端 ──
      "com.kangfenmao.cherrystudio", // Cherry Studio（多模型客户端）
      "cherry studio", // Cherry Studio（名称匹配）
      // ── Codex++ 工具系列 ──
      "com.bigpizzav3.codexplusplus", // Codex++
      "codex++", // Codex++（名称匹配）
      "codexplusplus", // Codex++（bundleId 匹配）
      // ── AI 环境管理 ──
      "com.echobird.ai", // EchoBird（AI 环境管理）
      "echobird", // EchoBird（名称匹配）
      // ── AI 面试辅助 ──
      "com.chunginlee.interviewcoder", // Interview Engine（AI 面试辅助）
      "interview engine", // Interview Engine（名称匹配）
      "interviewcoder", // Interview Coder（名称匹配）
      // ── AI 其他工具 ──
      "com.muyulab.muyu", // 幕语（AI 语音/工具）
      "幕语", // 幕语（中文匹配）
      "暮语", // 暮语（旧名兼容）
      // ── AI 工具（IDE 附属/助手类）──
      "com.lbjlaq.antigravity-tools", // Antigravity Tools
      "antigravity tools", // Antigravity Tools（名称匹配）
      "com.kiro.account-manager", // Kiro AccountManager
      "kiroaccountmanager", // KiroAccountManager（名称匹配）
      "com.cursor.wuxianxubei", // Cursor 助手
      "cursor助手", // Cursor 助手（名称匹配）
      // ── CC Switch（AI 工具）──
      "com.ccswitch.desktop", // CC Switch
      "cc switch", // CC Switch（名称匹配）
    ])
  )
    return "ai-tool"

  // ═══════════════════════════════════════════════════════════════
  // AI ASSISTANT — AI 对话助手/聊天
  // ═══════════════════════════════════════════════════════════════
  if (
    matchAny(bid, name, [
      // ── 国际 AI 助手 ──
      "com.openai.", // ChatGPT / Codex
      "com.electron.chatgpt", // ChatGPT（Electron）
      "chatgpt", // ChatGPT（名称匹配）
      "com.anthropic.", // Claude
      "claude", // Claude（名称匹配）
      "com.moonshot.kimi", // Kimi（月之暗面）
      "com.kimi.", // Kimi
      "kimi", // Kimi（名称匹配）
      "com.deepseek.", // DeepSeek
      "deepseek", // DeepSeek（名称匹配）
      "com.google.gemini", // Gemini
      "com.google.gemini macos", // Gemini MacOS
      "gemini", // Gemini（名称匹配）
      "com.microsoft.copilot", // Microsoft Copilot（聊天版）
      "copilot", // Copilot（名称匹配）
      "com.perplexity.", // Perplexity
      "ai.perplexity", // Perplexity
      "perplexity", // Perplexity（名称匹配）
      "com.quora.poe", // Poe（Quora）
      "poe", // Poe（名称匹配）
      "com.x.ai.grok", // Grok（xAI）
      "com.xai.grok", // Grok
      "grok", // Grok（名称匹配）
      // ── 国内 AI 助手 ──
      "com.bytedance.doubao", // 豆包（字节跳动）
      "com.lark.doubao", // 豆包
      "com.volcengine.ark", // 豆包
      "com.bot.pc.doubao", // 豆包 PC 版
      "doubao", // 豆包（名称匹配）
      "com.alibaba.tongyi", // 通义千问（阿里）
      "com.aliyun.tongyi", // 通义千问
      "com.baidu.wenxin", // 文心一言（百度）
      "com.baidu.ernie", // 文心一言
      "com.baidu.qianfan.", // 文心一言（千帆）
      "com.tencent.yuanbao", // 元宝（腾讯）
      "com.tencent.hunyuan", // 元宝（混元）
      "com.zhipuai.", // 智谱清言
      // ── 其他 AI 助手 ──
      "com.mistral.", // Mistral / LeChat
      "ai.mistral", // Mistral
      "com.inflection.pi", // Pi（Inflection）
      "com.heypi.", // Pi
      "com.you.", // You.com
      "com.minimax.agent", // MiniMax Code
      "minimax", // MiniMax（名称匹配）
      "com.apple.siri", // Siri
      "siri", // Siri（名称匹配）
    ])
  )
    return "ai-assistant"

  // ═══════════════════════════════════════════════════════════════
  // DEV — 终端/数据库/脚本等开发工具
  // ═══════════════════════════════════════════════════════════════
  if (
    matchAny(bid, name, [
      // ── 终端类 ──
      "dev.warp", // Warp 终端
      "com.warp.", // Warp 终端
      "io.warp.", // Warp 终端
      "warp", // Warp（名称匹配）
      "com.waveterminal.", // Wave 终端
      "dev.wave", // Wave 终端
      "wave", // Wave（名称匹配）
      "com.googlecode.iterm2", // iTerm2
      "iterm", // iTerm2（名称匹配）
      "net.kovidgoyal.kitty", // Kitty 终端
      "terminal", // Terminal / 各类终端（名称匹配）
      "com.apple.terminal", // Apple Terminal
      // ── 数据库工具 ──
      "org.python.idle", // Python IDLE
      "idle", // IDLE（名称匹配）
      "pgadmin", // pgAdmin（PostgreSQL 管理 GUI）
      "postgresql", // PostgreSQL 工具/文档
      "psql", // SQL Shell (psql)
      "sql shell", // SQL Shell
      // ── 脚本/自动化 ──
      "com.apple.scripteditor", // Script Editor
      "script editor", // Script Editor（名称匹配）
      "com.apple.automator", // Automator
      "automator", // Automator（名称匹配）
      // ── 开发者工具 ──
      "developer.apple.wwdc", // Apple Developer (WWDC)
      "developer", // Developer（名称匹配，仅 wwdc 相关）
    ]) &&
    // Developer 仅匹配 WWDC 相关
    (bid.includes("wwdc") || !name.includes("developer") || name.includes("wwdc"))
  )
    return "dev"

  // ═══════════════════════════════════════════════════════════════
  // BROWSER — 浏览器
  // ═══════════════════════════════════════════════════════════════
  if (
    matchAny(bid, name, [
      "com.google.chrome", // Google Chrome
      "chrome", // Chrome（名称匹配）
      "com.apple.safari", // Safari
      "safari", // Safari（名称匹配）
      "com.microsoft.edgemac", // Microsoft Edge
      "edge", // Edge（名称匹配）
      "com.brave.browser", // Brave
      "brave", // Brave（名称匹配）
      "com.vivaldi.", // Vivaldi
      "org.mozilla.firefox", // Firefox
      "firefox", // Firefox（名称匹配）
      "com.arc.browser", // Arc Browser
      "arc", // Arc（名称匹配）
      "com.sigmaos.", // SigmaOS
      "com.zen.browser", // Zen Browser
      "zen", // Zen（名称匹配）
      "org.torproject.", // Tor Browser
      "com.operasoftware.", // Opera
      "豆包浏览器", // 豆包浏览器（字节跳动）
    ])
  )
    return "browser"

  // ═══════════════════════════════════════════════════════════════
  // COMMUNICATION — 沟通/社交
  // ═══════════════════════════════════════════════════════════════
  if (
    matchAny(bid, name, [
      "com.tencent.xinwechat", // 微信
      "com.tencent.qq", // QQ
      "com.tencent.meeting", // 腾讯会议
      "com.alibaba.dingtalk", // 钉钉
      "com.bytedance.lark", // 飞书/Lark
      "com.electron.lark", // 飞书/Lark（Electron 版）
      "com.ss.lark", // 飞书/Lark
      "lark", // Lark（名称匹配）
      "com.tinyspeck.slackmacgap", // Slack
      "com.hnc.discord", // Discord
      "com.microsoft.teams", // Microsoft Teams
      "us.zoom.xos", // Zoom
      "com.zoom.", // Zoom
      "org.telegram.", // Telegram
      "com.whatsapp.", // WhatsApp
      "com.vk.", // VK
      "com.twitter.", // Twitter/X
      "com.tweetdeck.", // TweetDeck
      "com.laiwei.rattan", // Rattan
      "com.tencent.weworkmac", // 企业微信
      "wework", // 企业微信（名称匹配）
      // ── Apple 内置通讯 ──
      "com.apple.facetime", // FaceTime
      "facetime", // FaceTime（名称匹配）
      "com.apple.mobilesms", // Messages
      "messages", // Messages（名称匹配）
      "com.apple.mobilephone", // Phone
      "phone", // Phone（名称匹配）
      // ── 名称匹配 ──
      "微信", // 微信
      "wechat", // WeChat
      "钉钉", // 钉钉
      "飞书", // 飞书
      "slack", // Slack
      "discord", // Discord
      "zoom", // Zoom
      "telegram", // Telegram
      "whatsapp", // WhatsApp
      "teams", // Teams
      "qq", // QQ
      "企业微信", // 企业微信
    ])
  )
    return "communication"

  // ═══════════════════════════════════════════════════════════════
  // ENTERTAINMENT — 娱乐
  // ═══════════════════════════════════════════════════════════════
  if (
    matchAny(bid, name, [
      "com.spotify.", // Spotify
      "com.apple.music", // Apple Music
      "com.netease.163music", // 网易云音乐
      "com.tencent.qqmusic", // QQ 音乐
      "com.iina.", // IINA 播放器
      "org.videolan.vlc", // VLC
      "com.plexapp.", // Plex
      "tv.plex.", // Plex
      "com.valvesoftware.steam", // Steam
      "com.epicgames.", // Epic Games
      "com.blizzard.", // 暴雪/Battle.net
      "com.riotgames.", // Riot Games
      "com.mojang.", // Minecraft
      // ── 抖音 ──
      "com.ss.iphone.ugc.aweme", // 抖音
      "com.bytedance.aweme", // 抖音
      "com.bytedance.douyin", // 抖音
      "com.bytedance.ugc", // 抖音
      "com.bytedance.douyin.desktop", // 抖音桌面版
      // ── 开心消消乐 ──
      "com.happyelements.hexiaoxiaole", // 开心消消乐
      "com.happyelements.", // 乐元素
      // ── Listen1（音乐聚合器）──
      "com.listen1.", // Listen1
      "listen1", // Listen1（名称匹配）
      // ── Apple 内置娱乐 ──
      "com.apple.music", // Apple Music（已在上方，冗余保险）
      "com.apple.tv", // Apple TV
      "tv", // TV（名称匹配，仅 Apple TV）
      "com.apple.podcasts", // Podcasts
      "podcasts", // Podcasts（名称匹配）
      "com.apple.quicktimeplayerx", // QuickTime Player
      "quicktime player", // QuickTime Player（名称匹配）
      "com.apple.photobooth", // Photo Booth
      "photo booth", // Photo Booth（名称匹配）
      "com.apple.chess", // Chess
      "chess", // Chess（名称匹配）
      "com.apple.games", // Games
      "games", // Games（名称匹配，仅 Apple Games）
      "com.apple.voicememos", // VoiceMemos
      "voice memos", // Voice Memos（名称匹配）
      "voicememos", // VoiceMemos（bundleId 匹配）
      // ── 名称匹配 ──
      "spotify", // Spotify
      "music", // 音乐类
      "网易云", // 网易云音乐
      "qq音乐", // QQ 音乐
      "iina", // IINA
      "vlc", // VLC
      "steam", // Steam
      "抖音", // 抖音
      "douyin", // 抖音
      "tiktok", // TikTok
      "消消乐", // 消消乐
      "happyelements", // 乐元素
      "college kings", // College Kings（游戏）
      "horny villa", // Horny Villa（游戏）
      "lust goddess", // Lust Goddess（游戏）
    ]) &&
    // "tv" 仅匹配 Apple TV（避免误匹配其他含 tv 的应用）
    (name !== "tv" || bid.includes("apple.tv"))
  )
    return "entertainment"

  // ═══════════════════════════════════════════════════════════════
  // DESIGN — 设计/创作
  // ═══════════════════════════════════════════════════════════════
  if (
    matchAny(bid, name, [
      "com.figma.", // Figma
      "figma", // Figma（名称匹配）
      "com.adobe.photoshop", // Adobe Photoshop
      "photoshop", // Photoshop（名称匹配）
      "com.adobe.illustrator", // Adobe Illustrator
      "illustrator", // Illustrator（名称匹配）
      "com.adobe.indesign", // Adobe InDesign
      "com.adobe.aftereffects", // Adobe After Effects
      "com.adobe.premiere", // Adobe Premiere
      "com.sketchapp.", // Sketch
      "sketch", // Sketch（名称匹配）
      "com.bohemiancoding.", // Bohemian Coding
      "com.pixelmator.", // Pixelmator
      "pixelmator", // Pixelmator（名称匹配）
      "com.captureone.", // Capture One
      "com.seriflabs.affinity", // Affinity Suite
      "com.blackmagicdesign.davinci", // DaVinci Resolve
      "com.blender.", // Blender
      "blender", // Blender（名称匹配）
      "com.maxon.", // Maxon（Cinema 4D）
      "com.principleformac.", // Principle
      "org.inkscape.", // Inkscape
      "net.gimp.", // GIMP
      "canva", // Canva（名称匹配）
      // ── Apple 内置设计/图像工具 ──
      "com.apple.photos", // Photos
      "photos", // Photos（名称匹配）
      "com.apple.preview", // Preview
      "preview", // Preview（名称匹配）
      "com.apple.freeform", // Freeform
      "freeform", // Freeform（名称匹配）
      "com.apple.fontbook", // Font Book
      "font book", // Font Book（名称匹配）
      "com.apple.digitalcolormeter", // Digital Color Meter
      "digital color meter", // Digital Color Meter（名称匹配）
      "com.apple.image_capture", // Image Capture
      "image capture", // Image Capture（名称匹配）
      "com.apple.grapher", // Grapher
      "grapher", // Grapher（名称匹配）
    ])
  )
    return "design"

  // ═══════════════════════════════════════════════════════════════
  // WRITING — 写作/笔记/日历/邮件（不含 Notion/Obsidian，已移至 ai-office）
  // ═══════════════════════════════════════════════════════════════
  if (
    matchAny(bid, name, [
      "com.bear.", // Bear
      "bear", // Bear（名称匹配）
      "com.apple.iwork.pages", // Pages
      "com.microsoft.word", // Microsoft Word
      "word", // Word（名称匹配）
      "com.ulyssesapp.", // Ulysses
      "com.iawriter.", // iA Writer
      "com.agiletortoise.drafts", // Drafts
      "com.evernote.", // Evernote
      "com.logseq.", // Logseq
      "logseq", // Logseq（名称匹配）
      "com.inkdrop.", // Inkdrop
      "com.apple.stickies", // Stickies（便签）
      "com.apple.textedit", // TextEdit（文本编辑）
      // ── 邮件客户端 ──
      "com.readdle.spark", // Spark 邮件
      "com.sparkmailapp.", // Spark 邮件
      "com.apple.mail", // Apple Mail
      "com.microsoft.outlook", // Outlook
      "outlook", // Outlook（名称匹配）
      "com.mimestream.", // Mimestream
      "mail", // 邮件类（名称匹配）
      // ── 日历/提醒 ──
      "com.flexibits.fantastical", // Fantastical
      "com.busymac.busycal", // BusyCal
      "com.apple.ical", // Calendar
      "calendar", // Calendar（名称匹配）
      "com.apple.reminders", // Reminders
      "reminders", // Reminders（名称匹配）
      // ── Apple 内置写作/笔记/阅读 ──
      "com.apple.notes", // Apple Notes
      "notes", // Notes（名称匹配）
      "com.apple.ibooksx", // Books
      "books", // Books（名称匹配）
      "com.apple.news", // News
      "news", // News（名称匹配，仅 Apple News）
      "com.apple.journal", // Journal
      "journal", // Journal（名称匹配）
      "com.apple.dictionary", // Dictionary
      "dictionary", // Dictionary（名称匹配）
      "com.apple.addressbook", // Contacts
      "contacts", // Contacts（名称匹配）
      // ── 中文匹配 ──
      "备忘录", // Apple 备忘录
    ]) &&
    // "news" 仅匹配 Apple News（避免误匹配其他含 news 的应用）
    (name !== "news" || bid.includes("apple.news"))
  )
    return "writing"

  // ═══════════════════════════════════════════════════════════════
  // SYSTEM — 系统工具（含 Apple 内置系统应用）
  // ═══════════════════════════════════════════════════════════════
  if (
    matchAny(bid, name, [
      // ── 系统增强 ──
      "com.rogueamoeba.", // Rogue Amoeba 系列
      "com.macpaw.cleanmymac", // CleanMyMac
      "com.alsoft.disksensei", // Disk Sensei
      "com.runningwithcrayons.alfred", // Alfred
      "com.raycast.", // Raycast
      "com.knollsoft.rectangle", // Rectangle
      "com.magnet", // Magnet
      // ── 密码/安全 ──
      "com.apple.passwords", // Apple Passwords
      "passwords", // Passwords（名称匹配）
      // ── 翻译工具 ──
      "com.pot-app.desktop", // Pot（翻译工具）
      "pot-app", // Pot（名称匹配）
      // ── 其他工具 ──
      "无影", // 无影云电脑
      "com.aliyun.wuying.osx", // 无影云电脑
      "影刀", // 影刀 RPA
      "com.yingdao.yd", // 影刀
      "apifox", // Apifox
      "cn.apifox.app", // Apifox
      "app cleaner", // App Cleaner
      "com.nektony.app-cleaner", // App Cleaner
      "com.baidu.netdisk", // 百度网盘
      "baidunetdisk", // 百度网盘（名称匹配）
      "百度网盘", // 百度网盘（中文匹配）
      "百度云", // 百度云/百度网盘
      "bench", // Bench DevTools
      "com.bench.app", // Bench
      "downie", // Downie 4
      "com.charliemonroe.downie", // Downie
      "godot", // Godot
      "org.godotengine.godot", // Godot
      "xmind", // Xmind
      "net.xmind.vana.app", // Xmind
      "wps", // WPS Office
      "com.kingsoft.wpsoffice", // WPS Office
      "stats", // Stats
      "eu.exelban.stats", // Stats
      "orbstack", // OrbStack
      "dev.kdrag0n.macvirt", // OrbStack
      "fork", // Fork（Git 客户端）
      "com.danpristupov.fork", // Fork
      // ── 远程/代理/效率工具 ──
      "com.todesk.", // ToDesk（远程控制）
      "todesk", // ToDesk（名称匹配）
      "open design", // OpenDesign（设计/协同工具）
      "opendesign", // OpenDesign
      "io.open-design.desktop", // OpenDesign
      "shadowrocket", // Shadowrocket（网络代理）
      "com.liguangming.shadowrocket", // Shadowrocket
      "only switch", // Only Switch（开关管理）
      "jacklandrin.onlyswitch", // Only Switch
      "manggo", // Manggo
      "com.pylogmon.manggo", // Manggo
      "icollections", // iCollections（桌面整理）
      "com.naarak.collections", // iCollections
      "cn.better365.fastzip", // FastZip（压缩工具）
      "fastzip", // FastZip（名称匹配）
      "com.paulpacifico.shutterencoder", // Shutter Encoder（视频编码）
      "shutter encoder", // Shutter Encoder（名称匹配）
      "io.nekohasekai.sfavt", // sing-box（网络代理）
      "sing-box", // sing-box（名称匹配）
      "eu.davidbures.cork", // Cork（Homebrew GUI）
      "org.python.pythonlauncher", // Python Launcher
      // ── Apple 内置系统工具 ──
      "com.apple.activitymonitor", // Activity Monitor
      "activity monitor", // Activity Monitor（名称匹配）
      "com.apple.airport.airportutility", // AirPort Utility
      "airport utility", // AirPort Utility（名称匹配）
      "com.apple.appstore", // App Store
      "app store", // App Store（名称匹配）
      "com.apple.audio.audio midisEtuP", // Audio MIDI Setup
      "audio midi setup", // Audio MIDI Setup（名称匹配）
      "com.apple.bluetoothfileexchange", // Bluetooth File Exchange
      "bluetooth file exchange", // Bluetooth File Exchange（名称匹配）
      "com.apple.bootcampassistant", // Boot Camp Assistant
      "boot camp assistant", // Boot Camp Assistant（名称匹配）
      "com.apple.calculator", // Calculator
      "calculator", // Calculator（名称匹配）
      "com.apple.clock", // Clock
      "clock", // Clock（名称匹配）
      "com.apple.colorsyncutility", // ColorSync Utility
      "colorsync utility", // ColorSync Utility（名称匹配）
      "com.apple.console", // Console
      "console", // Console（名称匹配）
      "com.apple.diskutility", // Disk Utility
      "disk utility", // Disk Utility（名称匹配）
      "com.apple.findmy", // FindMy
      "findmy", // FindMy（名称匹配）
      "com.apple.home", // Home
      "home", // Home（名称匹配）
      "com.apple.magnifier", // Magnifier
      "magnifier", // Magnifier（名称匹配）
      "com.apple.maps", // Maps
      "maps", // Maps（名称匹配）
      "com.apple.migrateassistant", // Migration Assistant
      "migration assistant", // Migration Assistant（名称匹配）
      "com.apple.exposelauncher", // Mission Control
      "mission control", // Mission Control（名称匹配）
      "com.apple.printcenter", // Print Center
      "print center", // Print Center（名称匹配）
      "com.apple.screensharing", // Screen Sharing
      "screen sharing", // Screen Sharing（名称匹配）
      "com.apple.screenshot.launcher", // Screenshot
      "screenshot", // Screenshot（名称匹配）
      "com.apple.shortcuts", // Shortcuts
      "shortcuts", // Shortcuts（名称匹配）
      "com.apple.stocks", // Stocks
      "stocks", // Stocks（名称匹配）
      "com.apple.systemprofiler", // System Information
      "system information", // System Information（名称匹配）
      "com.apple.systempreferences", // System Settings
      "system settings", // System Settings（名称匹配）
      "com.apple.backup.launcher", // Time Machine
      "time machine", // Time Machine（名称匹配）
      "com.apple.helpviewer", // Tips
      "tips", // Tips（名称匹配）
      "com.apple.voiceoverutility", // VoiceOver Utility
      "voiceover utility", // VoiceOver Utility（名称匹配）
      "com.apple.weather", // Weather
      "weather", // Weather（名称匹配）
      "com.apple.screencontinuity", // iPhone Mirroring
      "iphone mirroring", // iPhone Mirroring（名称匹配）
      // ── 名称匹配 ──
      "cleanmymac", // CleanMyMac
      "alfred", // Alfred
      "raycast", // Raycast
      "rectangle", // Rectangle
      "magnet", // Magnet
    ])
  )
    return "system"

  // ═══════════════════════════════════════════════════════════════
  // OTHER — 其他（含 Apple 内置系统应用）
  // ═══════════════════════════════════════════════════════════════
  return "other"
}
