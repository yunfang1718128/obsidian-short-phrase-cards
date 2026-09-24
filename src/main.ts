import { MarkdownView, Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
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

  /** 被“编辑”按钮临时豁免自动切换的文件（切走/重开即恢复） */
  private suppressAutoOpen = new Set<string>();

  /** 已添加到各 markdown 视图标题栏的“卡片视图”图标 */
  private actionEls = new Map<MarkdownView, HTMLElement>();

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
        if (!(file instanceof TFile) || file.extension !== "md") return;
        // 延后到 Obsidian 打开流程之后再切换，避免与内置打开逻辑竞态
        window.setTimeout(() => {
          this.pruneSuppressions(this.app.workspace.getActiveFile()?.path ?? null);
          void this.autoOpenIfCardified(file);
          this.syncHeaderActions();
        }, 0);
      })
    );

    // 切回某个已打开的笔记标签页时也需要切换（此场景 file-open 不会触发）
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") {
          this.syncHeaderActions();
          return;
        }
        window.setTimeout(() => {
          this.pruneSuppressions(file.path);
          void this.autoOpenIfCardified(file);
          this.syncHeaderActions();
        }, 0);
      })
    );

    // 布局变化时同步标题栏图标
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.syncHeaderActions())
    );

    // 布局就绪后兜底：把启动时被还原成普通笔记的卡片笔记全部转为卡片，并刷新现有卡片视图
    this.app.workspace.onLayoutReady(() => {
      this.refreshCardViews();
      this.convertRestoredCardifiedLeaves();
      this.syncHeaderActions();
    });

    // 文件内容变化时刷新对应的卡片视图
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) this.refreshViewsFor(file.path);
      })
    );

    this.addSettingTab(new ShortPhraseCardsSettingTab(this.app, this));

    this.register(() => {
      for (const el of this.actionEls.values()) el.remove();
      this.actionEls.clear();
    });
  }

  isCardified(file: TFile): boolean {
    const key = this.settings.markerKey;
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return false;
    const value = frontmatter[key];
    return value === true || value === "true" || value === "yes" || value === 1;
  }

  /** 若当前激活的笔记需要卡片化，则把该 markdown 视图切换为卡片视图 */
  async autoOpenIfCardified(file: TFile): Promise<void> {
    if (!this.settings.autoOpenCardView) return;
    if (this.suppressAutoOpen.has(file.path)) return;
    if (!this.isCardified(file)) return;
    if (this.findCardLeaf(file.path)) return;
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!md || md.file?.path !== file.path) return;
    await this.openCardView(file, md.leaf);
  }

  /** 让每篇“已卡片化且当前是源码/阅读视图”的笔记标题栏出现一个返回卡片墙的图标 */
  private syncHeaderActions(): void {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      const file = view.file;
      const want = !!file && this.isCardified(file);
      const existing = this.actionEls.get(view);
      if (want && !existing) {
        const el = view.addAction("layout-grid", "卡片视图", () => {
          const f = view.file;
          if (!f) return;
          this.suppressAutoOpen.delete(f.path);
          void this.openCardView(f, view.leaf);
        });
        this.actionEls.set(view, el);
      } else if (!want && existing) {
        existing.remove();
        this.actionEls.delete(view);
      }
    }
  }

  /** 清理“临时豁免”：只保留当前激活文件的豁免，切走即恢复自动卡片 */
  private pruneSuppressions(activePath: string | null): void {
    for (const path of this.suppressAutoOpen) {
      if (path !== activePath) this.suppressAutoOpen.delete(path);
    }
  }

  /** 启动兜底：把布局中已还原、带卡片标记的普通笔记全部转为卡片视图 */
  private convertRestoredCardifiedLeaves(): void {
    const pending: TFile[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file && this.isCardified(view.file)) {
        pending.push(view.file);
      }
    });
    for (const file of pending) {
      void this.openCardView(file, this.findMarkdownLeaf(file.path) ?? undefined);
    }
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
      const cardLeaf = this.findCardLeaf(file.path);
      if (cardLeaf) {
        await cardLeaf.setViewState({
          type: "markdown",
          state: { file: file.path },
        });
      }
      return;
    }

    new Notice("已卡片化");
    this.suppressAutoOpen.delete(file.path);
    await this.openCardView(file);
  }

  async openCardView(file: TFile, leaf?: WorkspaceLeaf): Promise<void> {
    this.suppressAutoOpen.delete(file.path);
    const target =
      leaf ??
      this.findLeafShowing(file.path) ??
      this.app.workspace.getLeaf(true);
    if (!target) return;
    await target.setViewState({
      type: VIEW_TYPE_SHORT_PHRASE_CARDS,
      active: true,
      state: { file: file.path },
    });
  }

  private findCardLeaf(path: string): WorkspaceLeaf | null {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SHORT_PHRASE_CARDS)) {
      if ((leaf.view as ShortPhraseCardsView).filePath === path) return leaf;
    }
    return null;
  }

  private findMarkdownLeaf(path: string): WorkspaceLeaf | null {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if ((leaf.view as MarkdownView).file?.path === path) return leaf;
    }
    return null;
  }

  private findLeafShowing(path: string): WorkspaceLeaf | null {
    return this.findCardLeaf(path) ?? this.findMarkdownLeaf(path);
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
