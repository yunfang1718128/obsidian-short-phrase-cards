import { App, PluginSettingTab, Setting } from "obsidian";
import type ShortPhraseCardsPlugin from "./main";
import type { SplitMode } from "./parser";

export type CardStyle = "paper" | "classic" | "sticky";
export type CardColorMode = "hue" | "accent" | "none";
export type CardShadow = "none" | "soft" | "medium" | "strong";
export type CardAccentBar = "none" | "left" | "top";

export interface ShortPhraseCardsSettings {
  /** frontmatter 中的卡片化标记属性名 */
  markerKey: string;
  /** 拆分模式 */
  splitMode: SplitMode;
  /** 去掉 Markdown 标记 */
  stripMarkdown: boolean;
  /** 最短长度（字符数） */
  minLength: number;
  /** 最长长度（字符数），0 表示不限制 */
  maxLength: number;
  /** 去重 */
  dedupe: boolean;
  /** 卡片最小列宽（px） */
  cardWidth: number;
  /** 卡片字号（px） */
  fontSize: number;
  /** 打开被卡片化的笔记时自动进入卡片模式 */
  autoOpenCardView: boolean;
  /** 卡片风格预设 */
  cardStyle: CardStyle;
  /** 卡片配色模式 */
  cardColorMode: CardColorMode;
  /** 卡片底色着色强度（0-40，映射为百分比） */
  cardTint: number;
  /** 卡片圆角（px） */
  cardRadius: number;
  /** 卡片阴影强度 */
  cardShadow: CardShadow;
  /** 色条位置 */
  cardAccentBar: CardAccentBar;
  /** 卡片入场动画 */
  cardAnimation: boolean;
}

export const DEFAULT_SETTINGS: ShortPhraseCardsSettings = {
  markerKey: "cardwall",
  splitMode: "smart",
  stripMarkdown: true,
  minLength: 1,
  maxLength: 0,
  dedupe: false,
  cardWidth: 240,
  fontSize: 14,
  autoOpenCardView: true,
  cardStyle: "paper",
  cardColorMode: "hue",
  cardTint: 14,
  cardRadius: 14,
  cardShadow: "medium",
  cardAccentBar: "left",
  cardAnimation: true,
};

export class ShortPhraseCardsSettingTab extends PluginSettingTab {
  plugin: ShortPhraseCardsPlugin;

  constructor(app: App, plugin: ShortPhraseCardsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("卡片化标记属性")
      .setDesc("右键卡片化时写入笔记 frontmatter 的属性名。")
      .addText((text) =>
        text.setValue(this.plugin.settings.markerKey).onChange(async (value) => {
          this.plugin.settings.markerKey = value.trim() || "cardwall";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("打开时自动进入卡片模式")
      .setDesc("打开带有卡片化标记的笔记时，笔记区域自动切换为卡片墙。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoOpenCardView)
          .onChange(async (value) => {
            this.plugin.settings.autoOpenCardView = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("拆分模式")
      .setDesc("智能：忽略空行、标题和分隔线；每个非空行：不忽略标题。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("smart", "智能拆分")
          .addOption("line", "每个非空行")
          .setValue(this.plugin.settings.splitMode)
          .onChange(async (value) => {
            this.plugin.settings.splitMode = value as SplitMode;
            await this.plugin.saveSettings();
            this.plugin.refreshCardViews();
          })
      );

    new Setting(containerEl)
      .setName("去掉 Markdown 标记")
      .setDesc("去掉列表符号、加粗、链接等标记，卡片只显示纯文字。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.stripMarkdown)
          .onChange(async (value) => {
            this.plugin.settings.stripMarkdown = value;
            await this.plugin.saveSettings();
            this.plugin.refreshCardViews();
          })
      );

    new Setting(containerEl)
      .setName("最短长度")
      .setDesc("过滤掉短于该字符数的短句。")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.minLength)).onChange(async (value) => {
          const n = Number.parseInt(value, 10);
          this.plugin.settings.minLength = Number.isFinite(n) && n > 0 ? n : 1;
          await this.plugin.saveSettings();
          this.plugin.refreshCardViews();
        })
      );

    new Setting(containerEl)
      .setName("最长长度")
      .setDesc("过滤掉长于该字符数的短句，0 表示不限制。")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.maxLength)).onChange(async (value) => {
          const n = Number.parseInt(value, 10);
          this.plugin.settings.maxLength = Number.isFinite(n) && n > 0 ? n : 0;
          await this.plugin.saveSettings();
          this.plugin.refreshCardViews();
        })
      );

    new Setting(containerEl)
      .setName("去重")
      .setDesc("相同内容的短句只保留一张卡片。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.dedupe).onChange(async (value) => {
          this.plugin.settings.dedupe = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCardViews();
        })
      );

    new Setting(containerEl)
      .setName("卡片最小宽度")
      .setDesc("瀑布流的卡片列宽（像素）。")
      .addSlider((slider) =>
        slider
          .setLimits(140, 480, 10)
          .setValue(this.plugin.settings.cardWidth)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.cardWidth = value;
            await this.plugin.saveSettings();
            this.plugin.refreshCardViews();
          })
      );

    new Setting(containerEl)
      .setName("卡片字号")
      .setDesc("卡片文字大小（像素）。")
      .addSlider((slider) =>
        slider
          .setLimits(11, 24, 1)
          .setValue(this.plugin.settings.fontSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.fontSize = value;
            await this.plugin.saveSettings();
            this.plugin.refreshCardViews();
          })
      );

    new Setting(containerEl)
      .setName("卡片风格")
      .setDesc("纸卡极简：去边框、靠阴影；经典方框：保留描边；便利贴：更圆润柔和。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("paper", "纸卡极简")
          .addOption("classic", "经典方框")
          .addOption("sticky", "便利贴")
          .setValue(this.plugin.settings.cardStyle)
          .onChange(async (value) => {
            this.plugin.settings.cardStyle = value as CardStyle;
            await this.plugin.saveSettings();
            this.plugin.refreshCardViews();
          })
      );

    new Setting(containerEl)
      .setName("卡片配色")
      .setDesc("每卡循环色：每张卡片循环使用不同色相；单一强调色：全部使用主题强调色；主题灰阶：不额外着色。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("hue", "每卡循环色")
          .addOption("accent", "单一强调色")
          .addOption("none", "主题灰阶")
          .setValue(this.plugin.settings.cardColorMode)
          .onChange(async (value) => {
            this.plugin.settings.cardColorMode = value as CardColorMode;
            await this.plugin.saveSettings();
            this.plugin.refreshCardViews();
          })
      );

    new Setting(containerEl)
      .setName("着色强度")
      .setDesc("卡片底色的着色浓度，0 表示不着色。")
      .addSlider((slider) =>
        slider
          .setLimits(0, 40, 1)
          .setValue(this.plugin.settings.cardTint)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.cardTint = value;
            await this.plugin.saveSettings();
            this.plugin.refreshCardViews();
          })
      );

    new Setting(containerEl)
      .setName("卡片圆角")
      .setDesc("卡片圆角半径（像素）。")
      .addSlider((slider) =>
        slider
          .setLimits(0, 24, 1)
          .setValue(this.plugin.settings.cardRadius)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.cardRadius = value;
            await this.plugin.saveSettings();
            this.plugin.refreshCardViews();
          })
      );

    new Setting(containerEl)
      .setName("卡片阴影")
      .setDesc("卡片阴影强度。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("none", "无")
          .addOption("soft", "轻")
          .addOption("medium", "中")
          .addOption("strong", "强")
          .setValue(this.plugin.settings.cardShadow)
          .onChange(async (value) => {
            this.plugin.settings.cardShadow = value as CardShadow;
            await this.plugin.saveSettings();
            this.plugin.refreshCardViews();
          })
      );

    new Setting(containerEl)
      .setName("卡片色条")
      .setDesc("在卡片边缘显示一条强调色条。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("none", "无")
          .addOption("left", "左侧")
          .addOption("top", "顶部")
          .setValue(this.plugin.settings.cardAccentBar)
          .onChange(async (value) => {
            this.plugin.settings.cardAccentBar = value as CardAccentBar;
            await this.plugin.saveSettings();
            this.plugin.refreshCardViews();
          })
      );

    new Setting(containerEl)
      .setName("入场动画")
      .setDesc("卡片加载时轻微错落淡入。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.cardAnimation).onChange(async (value) => {
          this.plugin.settings.cardAnimation = value;
          await this.plugin.saveSettings();
          this.plugin.refreshCardViews();
        })
      );
  }
}
