export const APP_NAME = "OutfitAI";
export const APP_TAGLINE = "你的 AI 私人穿搭顾问";

export const PAGE_COPY = {
  home: {
    headline: "今天想怎么穿？",
    subtitle: "告诉我场合和感觉，我从你的衣橱里搭一套。",
    placeholder: "比如：明天约会，想温柔一点…",
    emptyHint: "试试下方的快捷提问，或直接说说你的安排。",
    loading: "正在为你搭配…",
    sendAria: "发送",
  },
  closet: {
    title: "我的衣橱",
    subtitle: "把常穿的衣服放进来，我会帮你搭得更像你。",
    count: (n: number) => `已收录 ${n} 件`,
    progress: (remaining: number) =>
      `再添加 ${remaining} 件，我就能开始帮你搭配了`,
    ready: "衣橱已就绪，去首页获取推荐吧 →",
    addButton: "添加一件",
    addFab: "添加",
    emptyTitle: "衣橱还是空的",
    emptyDesc: "先放几件常穿的衣服，搭配会更有你的味道。",
    filteredTitle: "这个分类还没有衣服",
    filteredDesc: "换个分类看看，或者再添一件新的。",
  },
  profile: {
    title: "我的",
    subtitle: "让我们继续优化你的个人风格。",
    savedLink: "收藏的穿搭",
    preferences: "穿搭偏好",
    settings: "账号设置",
    signOut: "退出登录",
    demoHint: (count: number) =>
      count < 3
        ? `还差 ${3 - count} 件衣服，添加后就能体验 AI 搭配`
        : null,
  },
  saved: {
    title: "收藏的穿搭",
    count: (n: number) => `${n} 套收藏`,
    emptyTitle: "还没有收藏",
    emptyDesc: "在首页看到喜欢的搭配，点「收藏」就会出现在这里。",
    emptyAction: "去搭配一套",
  },
  addClothing: {
    title: "添加衣服",
    subtitle:
      "拍张照，AI 会先帮你识别类型、颜色和风格，你也可以手动修改。",
    save: "放进衣橱",
    saving: "保存中…",
    uploadHint: "点击上传照片",
    aiRecognize: "AI 识别衣服",
    aiAnalyzing: "AI 正在识别，通常需要 5-15 秒...",
    aiSuccess: "已根据图片自动填写，你可以继续修改。",
    aiFailed: "AI 暂时没识别出来，你可以手动填写。",
    aiTimeout: "Qwen 识别超时，请稍后重试，或先手动填写。",
    imageProcessFailed: "图片处理失败，请换一张清晰的 JPG/PNG 图片。",
    imageTooLarge:
      "图片太大，请换一张更小/更清晰的图片，或先手动填写。",
    notClothing:
      "这张图片看起来不是衣物、鞋包或配饰，暂时不能加入衣橱。",
    reupload: "重新上传",
    clothingValidationFailed:
      "无法确认图片是否为衣物，请稍后重试或换一张更清晰的照片。",
  },
  outfit: {
    occasion: "适合",
    summary: "这套怎么穿",
    reasoning: "为什么适合你",
    alternatives: "还可以试试",
    regenerate: "换一套",
  },
  feedback: {
    like: "喜欢",
    liked: "已喜欢",
    dislike: "不太合适",
    disliked: "已标记",
    save: "收藏",
    saved: "已收藏",
  },
  errors: {
    generic: "出了点问题，稍后再试一次吧",
    loadFailed: "加载失败，请刷新页面",
    retry: "重试",
  },
} as const;

export const NAV_ITEMS = [
  { href: "/closet", label: "衣橱", icon: "closet" as const },
  { href: "/", label: "首页", icon: "home" as const },
  { href: "/profile", label: "我的", icon: "profile" as const },
] as const;

export const NAV_HEIGHT = "3.75rem";

export const QUICK_QUESTIONS = [
  "今天上班穿什么？",
  "约会想温柔一点",
  "周末去咖啡店",
  "显瘦一点的搭配",
  "不想太正式",
] as const;

export const CLOSET_FILTER_CATEGORIES = [
  "全部",
  "上衣",
  "裤子",
  "外套",
  "鞋子",
  "配饰",
] as const;

export {
  CLOSET_CATEGORIES,
  CLOSET_OCCASION_TAGS,
  CLOSET_SEASON_TAGS,
  CLOSET_STYLE_TAGS,
  DEFAULT_CATEGORIES,
  DEFAULT_OCCASION_TAGS,
  DEFAULT_SEASON_TAGS,
  DEFAULT_STYLE_TAGS,
} from "@/lib/constants/clothing-options";

export const CLOSET_STORAGE_BUCKET = "closet";

export const MIN_CLOSET_FOR_AI = 3;
