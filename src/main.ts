import { Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import {
  DEFAULT_SETTINGS,
  ShortPhraseCardsSettingTab,
  ShortPhraseCardsSettings,
} from "./settings";
import {
  ShortPhraseCardsView,
  VIEW_TYPE_SHORT_PHRASE_CARDS,
} from "./view";

export default class ShortPhraseCardsPlugin extends Plugin {
  settings: ShortPhraseCardsSettings;

  /** 本次会话内被“编辑”按钮临时豁免自动切换的文件 */
  private suppressAutoOpen = new Set<string>();

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_SHORT_PHRASE_CARDS,
      (leaf) => new ShortPhraseCardsView(leaf, this)
    );

    this.addRibbonIcon("layout-grid", "打开短句卡片", () => {
      const file = this.app.workspace.getActiveFile();
      if (file) void this.openCardView(file);
      else new Notice("请先打开一个笔记。");
    });

    this.addCommand({
      id: "open-card-view",
      name: "打开当前笔记的卡片墙",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.openCardView(file);
        return true;
      },
    });

    this.addCommand({
      id: "toggle-cardify",
      name: "切换当前笔记的卡片化标记",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.toggleCardify(file);
        return true;
      },
    });

    // 文件管理器右键
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        const marked = this.isCardified(file);
        menu.addItem((item) =>
          item
            .setTitle(marked ? "取消卡片化" : "卡片化")
            .setIcon("layout-grid")
            .onClick(() => void this.toggleCardify(file))
        );
      })
    );

    // 打开被卡片化的笔记时自动切换为卡片模式
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (!file || !this.settings.autoOpenCardView) return;
        if (this.suppressAutoOpen.has(file.path)) return;
        if (!this.isCardified(file)) return;
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (!leaf) return;
        if (leaf.view.getViewType() === VIEW_TYPE_SHORT_PHRASE_CARDS) return;
        void this.openCardView(file, leaf);
      })
    );

    // 文件内容变化时刷新对应的卡片视图
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) this.refreshViewsFor(file.path);
      })
    );

    this.addSettingTab(new ShortPhraseCardsSettingTab(this.app, this));
  }

  isCardified(file: TFile): boolean {
    const key = this.settings.markerKey;
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return false;
    const value = frontmatter[key];
    return value === true || value === "true" || value === "yes" || value === 1;
  }

  async toggleCardify(file: TFile): Promise<void> {
    const key = this.settings.markerKey;
    const marked = this.isCardified(file);

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (marked) {
        delete frontmatter[key];
      } else {
        frontmatter[key] = true;
      }
    });

    if (marked) {
      new Notice("已取消卡片化");
      return;
    }

    new Notice("已卡片化");
    this.suppressAutoOpen.delete(file.path);
    await this.openCardView(file);
  }

  async openCardView(file: TFile, leaf?: WorkspaceLeaf): Promise<void> {
    const target =
      leaf ??
      this.app.workspace.getMostRecentLeaf() ??
      this.app.workspace.getLeaf(true);
    if (!target) return;
    await target.setViewState({
      type: VIEW_TYPE_SHORT_PHRASE_CARDS,
      active: true,
      state: { file: file.path },
    });
  }

  switchToEdit(view: ShortPhraseCardsView): void {
    const path = view.filePath;
    if (!path) return;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    this.suppressAutoOpen.add(path);
    void view.leaf.setViewState({
      type: "markdown",
      state: { file: path },
    });
  }

  refreshViewsFor(path: string): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SHORT_PHRASE_CARDS)) {
      const view = leaf.view;
      if (view instanceof ShortPhraseCardsView && view.filePath === path) {
        void view.render();
      }
    }
  }

  refreshCardViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SHORT_PHRASE_CARDS)) {
      const view = leaf.view;
      if (view instanceof ShortPhraseCardsView) void view.render();
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
