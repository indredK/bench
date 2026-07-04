/**
 * Feature / 功能层: stay within this feature; 只处理当前功能.
 */
import type { AppInfo } from "@/lib/tauri/types"

export type AppCategoryKey =
  | "ai"
  | "browser"
  | "communication"
  | "ide"
  | "launcher"
  | "utility"
  | "development"
  | "system"
  | "other"

export interface AppCategory {
  key: AppCategoryKey
  labelKey: string
}

export const APP_CATEGORIES: AppCategory[] = [
  { key: "ai", labelKey: "appManager.category.ai" },
  { key: "browser", labelKey: "appManager.category.browser" },
  { key: "communication", labelKey: "appManager.category.communication" },
  { key: "ide", labelKey: "appManager.category.ide" },
  { key: "launcher", labelKey: "appManager.category.launcher" },
  { key: "utility", labelKey: "appManager.category.utility" },
  { key: "development", labelKey: "appManager.category.development" },
  { key: "system", labelKey: "appManager.category.system" },
  { key: "other", labelKey: "appManager.category.other" },
]

export function classifyApp(app: AppInfo): AppCategoryKey {
  const bid = app.bundleId.toLowerCase()
  const name = app.name.toLowerCase()

  if (app.isSystemApp) {
    return "system"
  }

  if (
    bid.includes("com.openai.") ||
    bid.includes("com.anthropic.") ||
    bid.includes("com.openclaw") ||
    bid.includes("ai.openclaw") ||
    bid.includes("com.zhipuai.") ||
    bid.includes("com.electron.ollama") ||
    bid.includes("com.lobsterai.") ||
    bid.includes("com.workbuddy.") ||
    bid.includes("com.echobird.") ||
    bid.includes("com.baidu.qianfan.") ||
    bid.includes("com.easydataset.") ||
    bid.includes("im.manus.") ||
    bid.includes("com.mnn.") ||
    bid.includes("ai.unsloth.") ||
    bid.includes("ai.elementlabs.") ||
    bid.includes("com.chunginlee.") ||
    bid.includes("com.cuemate.") ||
    name.includes("chatgpt") ||
    name.includes("claude") ||
    name.includes("doubao") ||
    name.includes("kimi") ||
    name.includes("copilot") ||
    name.includes("文心") ||
    name.includes("通义") ||
    name.includes("gemini") ||
    name.includes("deepseek") ||
    name.includes("openclaw") ||
    name.includes("ollama") ||
    name.includes("lobster") ||
    name.includes("workbuddy") ||
    name.includes("echobird") ||
    name.includes("dumate") ||
    name.includes("easy dataset") ||
    name.includes("manus") ||
    name.includes("mnn") ||
    name.includes("unsloth") ||
    name.includes("lm studio") ||
    name.includes("comfy") ||
    name.includes("interview")
  ) {
    return "ai"
  }

  if (
    bid.includes("com.apple.safari") ||
    bid.includes("com.google.chrome") ||
    bid.includes("org.mozilla.") ||
    bid.includes("com.microsoft.edgemac") ||
    bid.includes("com.operasoftware.") ||
    bid.includes("com.brave.") ||
    bid.includes("company.thebrowser.") ||
    bid.includes("com.quark.") ||
    name.includes("浏览器") ||
    name.includes("browser") ||
    name.includes("夸克")
  ) {
    return "browser"
  }

  if (
    bid.includes("com.tencent.xinwechat") ||
    bid.includes("com.tencent.qq") ||
    bid.includes("com.alibaba.dingtalk") ||
    bid.includes("com.bytedance.lark") ||
    bid.includes("com.tinyspeck.slack") ||
    bid.includes("com.microsoft.teams") ||
    bid.includes("us.zoom.") ||
    bid.includes("com.skype.") ||
    bid.includes("com.viber.") ||
    bid.includes("com.discordapp.") ||
    bid.includes("com.hnc.discord") ||
    bid.includes("org.linphone") ||
    bid.includes("com.apple.facetime") ||
    bid.includes("com.apple.mobilephone") ||
    bid.includes("ru.keepcoder.telegram") ||
    bid.includes("com.larksuite.") ||
    bid.includes("com.electron.lark") ||
    bid.includes("com.tencent.meeting") ||
    name.includes("微信") ||
    name.includes("钉钉") ||
    name.includes("飞书") ||
    name.includes("sip") ||
    name.includes("telegram") ||
    name.includes("腾讯会议") ||
    name.includes("larksuite")
  ) {
    return "communication"
  }

  if (
    bid.includes("com.microsoft.vscode") ||
    bid.includes("com.apple.dt.") ||
    bid.includes("com.jetbrains.") ||
    bid.includes("com.sublimetext.") ||
    bid.includes("com.cursor.") ||
    bid.includes("com.cursor-agent.") ||
    bid.includes("com.trae.") ||
    bid.includes("cn.trae.") ||
    bid.includes("dev.kiro.") ||
    bid.includes("com.tencent.codebuddy") ||
    bid.includes("com.openai.codex") ||
    bid.includes("ai.opencode.") ||
    bid.includes("com.exafunction.windsurf") ||
    bid.includes("dev.zed.") ||
    bid.includes("com.qoder.") ||
    bid.includes("com.google.antigravity") ||
    bid.includes("com.google.android-studio") ||
    bid.includes("org.godotengine.") ||
    bid.includes("io.dcloud.") ||
    bid.includes("com.tencent.webplusdevtools") ||
    name.includes("gcc") ||
    name.includes("clang") ||
    name.includes("llvm") ||
    name.includes("rustc") ||
    name.includes("compiler") ||
    name.includes("trae") ||
    name.includes("xcode") ||
    name.includes("cursor") ||
    name.includes("kiro") ||
    name.includes("zed") ||
    name.includes("windsurf") ||
    name.includes("codebuddy") ||
    name.includes("codex") ||
    name.includes("opencode") ||
    name.includes("qoder") ||
    name.includes("antigravity") ||
    name.includes("android studio") ||
    name.includes("godot") ||
    name.includes("hbuilder")
  ) {
    return "ide"
  }

  if (
    bid.includes("com.alfredapp.") ||
    bid.includes("com.raycast.") ||
    bid.includes("com.obdev.launchbar") ||
    name.includes("alfred") ||
    name.includes("raycast")
  ) {
    return "launcher"
  }

  if (
    bid.includes("com.github.") ||
    bid.includes("com.sourcetree.") ||
    bid.includes("com.docker.") ||
    bid.includes("com.postmanlabs.") ||
    bid.includes("com.figma.") ||
    bid.includes("cn.apifox.") ||
    bid.includes("com.danpristupov.fork") ||
    bid.includes("dev.kdrag0n.") ||
    bid.includes("dev.commandline.") ||
    bid.includes("com.portmanager.") ||
    bid.includes("com.lbjlaq.") ||
    bid.includes("com.ccswitch.") ||
    bid.includes("eu.davidbures.cork") ||
    bid.includes("developer.apple.") ||
    name.includes("terminal") ||
    name.includes("iterm") ||
    name.includes("warp") ||
    name.includes("apifox") ||
    name.includes("orbstack")
  ) {
    return "development"
  }

  if (
    bid.includes("com.charliemonroe.") ||
    bid.includes("com.liguangming.") ||
    bid.includes("com.paulpacifico.") ||
    bid.includes("eu.exelban.") ||
    bid.includes("com.stonerl.") ||
    bid.includes("com.youqu.todesk") ||
    bid.includes("com.lemon.") ||
    bid.includes("com.kingsoft.") ||
    bid.includes("com.netease.") ||
    bid.includes("com.alibaba.wuying") ||
    bid.includes("com.muyulab.") ||
    bid.includes("com.yingdao.") ||
    bid.includes("com.pot-app.") ||
    bid.includes("notion.id") ||
    bid.includes("md.obsidian") ||
    bid.includes("com.listen1.") ||
    bid.includes("com.naarak.") ||
    bid.includes("net.xmind.") ||
    bid.includes("com.apple.keynote") ||
    bid.includes("com.microsoft.excel") ||
    bid.includes("com.microsoft.word") ||
    bid.includes("com.microsoft.powerpoint") ||
    bid.includes("com.microsoft.outlook") ||
    bid.includes("com.microsoft.onenote") ||
    bid.includes("com.microsoft.onedrive") ||
    bid.includes("com.microsoft.wdav") ||
    bid.includes("com.baidu.netdisk") ||
    bid.includes("com.bilibili.bcutcreator") ||
    bid.includes("cn.better365.") ||
    bid.includes("io.nekohasekai.") ||
    bid.includes("com.samsung.") ||
    name.includes("finder") ||
    name.includes("disk") ||
    name.includes("clean") ||
    name.includes("monitor") ||
    name.includes("unarchiver") ||
    name.includes("keka") ||
    name.includes("activity") ||
    name.includes("downie") ||
    name.includes("shadowrocket") ||
    name.includes("shutter encoder") ||
    name.includes("thaw") ||
    name.includes("todesk") ||
    name.includes("剪映") ||
    name.includes("wps") ||
    name.includes("netease") ||
    name.includes("百度网盘") ||
    name.includes("无影") ||
    name.includes("幕语") ||
    name.includes("影刀") ||
    name.includes("notion") ||
    name.includes("obsidian") ||
    name.includes("listen1") ||
    name.includes("icollections") ||
    name.includes("xmind") ||
    name.includes("keynote") ||
    name.includes("必剪") ||
    name.includes("fastzip") ||
    name.includes("sing-box") ||
    name.includes("samsung magician") ||
    name.includes("stats") ||
    name.includes("pot")
  ) {
    return "utility"
  }

  return "other"
}
