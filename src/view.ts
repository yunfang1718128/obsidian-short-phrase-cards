import { ItemView, TFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import type ShortPhraseCardsPlugin from "./main";
import { parsePhrases } from "./parser";

export const VIEW_TYPE_SHORT_PHRASE_CARDS = "short-phrase-cards-view";

/** 精选调色板：每张卡片循环取色（HSL） */
const CARD_PALETTE = [
  { h: 212, s: 62, l: 56 }, // 蓝
  { h: 174, s: 55, l: 44 }, // 青
  { h: 262, s: 55, l: 62 }, // 紫
  { h: 330, s: 60, l: 60 }, // 粉
  { h: 24, s: 72, l: 54 }, // 橙
  { h: 43, s: 68, l: 50 }, // 琥珀
  { h: 150, s: 46, l: 44 }, // 绿
];

/** 动画延迟的索引上限，避免卡片过多时等待过久 */
const MAX_ANIM_INDEX = 40;

export interface ShortPhraseCardsViewState {
  file?: string;
}

export class ShortPhraseCardsView extends ItemView {
  plugin: ShortPhraseCardsPlugin;
  filePath: string | null = null;

  private wallEl: HTMLElement | null = null;
  /** 注意：不能叫 titleEl，View 基类已有同名属性，会被覆盖成 null 导致打开视图报错 */
  private barTitleEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ShortPhraseCardsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_SHORT_PHRASE_CARDS;
  }

  getDisplayText(): string {
    return this.filePath ? `卡片 · ${this.filePath.split("/").pop()}` : "短句卡片";
  }

  getIcon(): string {
    return "layout-grid";
  }

  getState(): Record<string, unknown> {
    return { file: this.filePath };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const s = state as ShortPhraseCardsViewState | null;
    if (s && typeof s.file === "string") {
      this.filePath = s.file;
    }
    await super.setState(state, result);
    await this.render();
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("spc-view");

    const toolbar = root.createDiv({ cls: "spc-toolbar" });
    this.barTitleEl = toolbar.createDiv({ cls: "spc-title" });

    const editBtn = toolbar.createEl("button", { text: "编辑" });
    editBtn.addClass("spc-btn");
    editBtn.onclick = () => this.plugin.switchToEdit(this);

    const refreshBtn = toolbar.createEl("button", { text: "刷新" });
    refreshBtn.addClass("spc-btn");
    refreshBtn.onclick = () => void this.render();

    this.wallEl = root.createDiv({ cls: "spc-wall" });
    this.applyStyleVars();
    await this.render();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  applyStyleVars(): void {
    if (!this.wallEl) return;
    const s = this.plugin.settings;
    const wall = this.wallEl;
    wall.style.setProperty("--spc-card-width", `${s.cardWidth}px`);
    wall.style.setProperty("--spc-font-size", `${s.fontSize}px`);
    wall.style.setProperty("--spc-radius", `${s.cardRadius}px`);
    wall.style.setProperty("--spc-tint", `${s.cardColorMode === "none" ? 0 : s.cardTint}%`);

    wall.toggleClass("spc-style-paper", s.cardStyle === "paper");
    wall.toggleClass("spc-style-classic", s.cardStyle === "classic");
    wall.toggleClass("spc-style-sticky", s.cardStyle === "sticky");

    wall.toggleClass("spc-bar-none", s.cardAccentBar === "none");
    wall.toggleClass("spc-bar-left", s.cardAccentBar === "left");
    wall.toggleClass("spc-bar-top", s.cardAccentBar === "top");

    wall.toggleClass("spc-shadow-none", s.cardShadow === "none");
    wall.toggleClass("spc-shadow-soft", s.cardShadow === "soft");
    wall.toggleClass("spc-shadow-medium", s.cardShadow === "medium");
    wall.toggleClass("spc-shadow-strong", s.cardShadow === "strong");

    wall.toggleClass("spc-anim", s.cardAnimation);
  }

  async render(): Promise<void> {
    if (!this.wallEl) return;
    this.wallEl.empty();
    this.applyStyleVars();

    try {
      await this.renderWall();
    } catch (err) {
      console.error("[short-phrase-cards] 渲染卡片失败", err);
      this.wallEl.createDiv({
        cls: "spc-empty",
        text: `渲染失败：${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private async renderWall(): Promise<void> {
    if (!this.wallEl) return;
    const path = this.filePath;
    if (!path) {
      this.setBarTitle("短句卡片");
      this.wallEl.createDiv({ cls: "spc-empty", text: "没有指定文件。" });
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      this.setBarTitle(path);
      this.wallEl.createDiv({ cls: "spc-empty", text: `文件不存在：${path}` });
      return;
    }

    this.setBarTitle(file.basename);

    const content = await this.app.vault.cachedRead(file);
    const phrases = parsePhrases(content, {
      splitMode: this.plugin.settings.splitMode,
      stripMarkdown: this.plugin.settings.stripMarkdown,
      minLength: this.plugin.settings.minLength,
      maxLength: this.plugin.settings.maxLength,
      dedupe: this.plugin.settings.dedupe,
    });

    if (phrases.length === 0) {
      this.wallEl.createDiv({ cls: "spc-empty", text: "没有可显示的短句。" });
      return;
    }

    const fragment = document.createDocumentFragment();
    const colorMode = this.plugin.settings.cardColorMode;
    phrases.forEach((phrase, index) => {
      const card = document.createElement("div");
      card.className = "spc-card";
      card.textContent = phrase;
      card.style.setProperty("--spc-i", String(Math.min(index, MAX_ANIM_INDEX)));
      if (colorMode === "hue") {
        const c = CARD_PALETTE[index % CARD_PALETTE.length];
        card.style.setProperty("--spc-accent", `hsl(${c.h} ${c.s}% ${c.l}%)`);
      } else if (colorMode === "accent") {
        card.style.setProperty("--spc-accent", "var(--interactive-accent)");
      }
      fragment.appendChild(card);
    });
    this.wallEl.appendChild(fragment);
  }

  private setBarTitle(text: string): void {
    if (this.barTitleEl) this.barTitleEl.setText(text);
  }
}
