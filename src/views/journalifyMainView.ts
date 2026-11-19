import { Component, ItemView, MarkdownView, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type JournalifyPlugin from "../main";
import {
	JournalEntryIndexItem,
	JournalFilterState,
	JournalLayoutMode,
	MoodScore,
	createEmptyFilterState,
} from "../types";
import { resolveUiLanguage, t } from "../i18n";
import { MOOD_PRESETS } from "../parser/propertyMapper";
import { getTodayDateKey } from "../parser/dateUtils";
import { getOrCreateDailyNoteForDate } from "../services/sourceResolver";
import { renderQuickStartTodayCard } from "../components/quickStartCard";
import { renderJournalEntryCard } from "../components/entryCard";
import { InspectorPanelController } from "../components/inspectorPanel";
import { closeActivePopover } from "../components/metadataPopovers";

export const VIEW_TYPE_JOURNALIFY = "journalify-feed-view";
const FEED_BATCH_SIZE = 18;

export class JournalifyMainView extends ItemView {
	plugin: JournalifyPlugin;
	private filter: JournalFilterState = createEmptyFilterState();
	private filterDrawerOpen = false;
	private mobileInspectorOpen = false;
	private isNarrowViewport = false;
	private renderedCount = FEED_BATCH_SIZE;
	private currentFilteredEntries: JournalEntryIndexItem[] = [];
	private bookSpreadIndex = 0;

	private rootEl: HTMLElement | null = null;
	private streamHostEl: HTMLElement | null = null;
	private inspectorHostEl: HTMLElement | null = null;
	private inspectorController: InspectorPanelController | null = null;
	private streamRenderComponent: Component | null = null;
	private renderGeneration = 0;
	private scrollObserver: IntersectionObserver | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private unsubscribeIndex: (() => void) | null = null;
	private refreshDebounceTimer: number | null = null;
	private syncedSplitLeaf: WorkspaceLeaf | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: JournalifyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_JOURNALIFY;
	}

	getDisplayText(): string {
		return t(this.plugin.settings.uiLanguage).pluginTitle;
	}

	getIcon(): string {
		return "book-open";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("journalify-view-container");

		this.unsubscribeIndex?.();
		this.unsubscribeIndex = this.plugin.index.onChange(() => {
			this.scheduleSoftRefresh();
		});

		this.resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const width = entry.contentRect.width;
				const nextNarrow = width > 0 && width < 860;
				if (nextNarrow !== this.isNarrowViewport) {
					this.isNarrowViewport = nextNarrow;
					this.updateResponsiveClasses();
					if (this.plugin.settings.layoutMode === "book") {
						void this.renderStreamArea();
					}
				}
			}
		});
		this.resizeObserver.observe(container);

		const win = container.ownerDocument.defaultView || window;
		this.registerDomEvent(win, "keydown", (ev: KeyboardEvent) => {
			if (this.plugin.settings.layoutMode !== "book") return;
			const activeEl = container.ownerDocument.activeElement;
			const activeTag = activeEl?.tagName.toLowerCase();
			if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") return;
			if (activeEl && !this.containerEl.contains(activeEl) && activeEl !== container.ownerDocument.body) {
				return;
			}
			const olderDelta = this.plugin.settings.sortOrder === "desc" ? 1 : -1;
			if (ev.key === "ArrowLeft") {
				this.stepBookSpread(olderDelta);
			} else if (ev.key === "ArrowRight") {
				this.stepBookSpread(-olderDelta);
			}
		});

		await this.renderFullShell();
	}

	async onClose(): Promise<void> {
		closeActivePopover();
		this.renderGeneration++;
		this.resetStreamRenderComponent(false);
		this.unsubscribeIndex?.();
		this.unsubscribeIndex = null;
		this.scrollObserver?.disconnect();
		this.scrollObserver = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		if (this.refreshDebounceTimer !== null) {
			window.clearTimeout(this.refreshDebounceTimer);
			this.refreshDebounceTimer = null;
		}
	}

	private resetStreamRenderComponent(createFresh: boolean): Component | null {
		if (this.streamRenderComponent) {
			this.removeChild(this.streamRenderComponent);
			this.streamRenderComponent = null;
		}
		if (createFresh) {
			this.streamRenderComponent = this.addChild(new Component());
		}
		return this.streamRenderComponent;
	}

	private scheduleSoftRefresh(): void {
		if (this.refreshDebounceTimer !== null) {
			window.clearTimeout(this.refreshDebounceTimer);
		}
		this.refreshDebounceTimer = window.setTimeout(() => {
			const activeEl = this.contentEl.ownerDocument.activeElement;
			if (
				this.streamHostEl &&
				activeEl instanceof HTMLTextAreaElement &&
				this.streamHostEl.contains(activeEl)
			) {
				return;
			}
			void this.refreshEntriesAndInspector();
		}, 120);
	}

	private updateResponsiveClasses(): void {
		if (!this.rootEl) return;
		this.rootEl.dataset.theme = this.plugin.settings.theme;
		this.rootEl.dataset.layout = this.plugin.settings.layoutMode;
		this.rootEl.toggleClass("is-narrow", this.isNarrowViewport);
		const showPanel = this.isNarrowViewport
			? this.mobileInspectorOpen
			: this.plugin.settings.showInspectorInView;
		this.rootEl.toggleClass("has-inspector-open", showPanel);
	}

	async renderFullShell(): Promise<void> {
		this.contentEl.empty();
		const settings = this.plugin.settings;
		const lang = resolveUiLanguage(settings.uiLanguage);
		const strings = t(lang);

		this.rootEl = this.contentEl.createDiv({ cls: "journalify-root" });
		this.isNarrowViewport =
			this.contentEl.clientWidth > 0 && this.contentEl.clientWidth < 860;
		this.updateResponsiveClasses();

		const topbar = this.rootEl.createDiv({ cls: "journalify-topbar" });

		const brandGroup = topbar.createDiv({ cls: "journalify-topbar-left" });
		const brandIcon = brandGroup.createSpan({ cls: "journalify-brand-icon" });
		setIcon(brandIcon, "book-open");

		if (settings.profiles.length > 1) {
			const profSelect = brandGroup.createEl("select", {
				cls: "journalify-profile-select",
			});
			for (const prof of settings.profiles) {
				const opt = profSelect.createEl("option", { value: prof.id, text: prof.name });
				if (prof.id === settings.activeProfileId) opt.selected = true;
			}
			profSelect.addEventListener("change", () => {
				void (async () => {
					settings.activeProfileId = profSelect.value;
					await this.plugin.saveSettings();
					this.plugin.index.rebuild();
					await this.renderFullShell();
				})();
			});
		} else {
			brandGroup.createSpan({
				cls: "journalify-brand-title",
				text: settings.profiles[0]?.name || strings.pluginTitle,
			});
		}

		const layoutSeg = topbar.createDiv({ cls: "journalify-layout-segmented" });
		const makeLayoutBtn = (mode: JournalLayoutMode, label: string, iconName: string) => {
			const btn = layoutSeg.createEl("button", {
				cls: `journalify-seg-btn ${settings.layoutMode === mode ? "is-active" : ""}`,
				attr: { title: label },
			});
			const ic = btn.createSpan({ cls: "journalify-seg-icon" });
			setIcon(ic, iconName);
			btn.createSpan({ cls: "journalify-seg-label", text: label });
			btn.addEventListener("click", () => {
				if (settings.layoutMode === mode) return;
				void (async () => {
					settings.layoutMode = mode;
					this.bookSpreadIndex = 0;
					await this.plugin.saveSettings();
					await this.renderFullShell();
				})();
			});
		};
		makeLayoutBtn("feed", strings.layoutFeed, "layout-list");
		makeLayoutBtn("timeline", strings.layoutTimeline, "git-commit-vertical");
		makeLayoutBtn("book", strings.layoutBook, "book-open-check");

		const rightControls = topbar.createDiv({ cls: "journalify-topbar-right" });

		const searchWrap = rightControls.createDiv({ cls: "journalify-search-wrap" });
		const searchIcon = searchWrap.createSpan({ cls: "journalify-search-icon" });
		setIcon(searchIcon, "search");
		const searchInput = searchWrap.createEl("input", {
			type: "search",
			cls: "journalify-search-input",
			value: this.filter.query,
			placeholder: strings.searchPlaceholder,
		});

		let searchTimer: number | null = null;
		searchInput.addEventListener("input", () => {
			this.filter.query = searchInput.value;
			if (searchTimer !== null) window.clearTimeout(searchTimer);
			searchTimer = window.setTimeout(() => {
				this.renderedCount = FEED_BATCH_SIZE;
				this.bookSpreadIndex = 0;
				void this.renderStreamArea();
			}, 180);
		});

		const filterBtn = rightControls.createEl("button", {
			cls: `journalify-btn journalify-btn-subtle ${
				this.hasActiveFilters() || this.filterDrawerOpen ? "is-active" : ""
			}`,
		});
		const fIcon = filterBtn.createSpan({ cls: "journalify-btn-icon" });
		setIcon(fIcon, "sliders-horizontal");
		filterBtn.createSpan({ cls: "journalify-hide-xs", text: strings.filterButton });
		filterBtn.addEventListener("click", () => {
			this.filterDrawerOpen = !this.filterDrawerOpen;
			void this.renderFullShell();
		});

		const splitToggleBtn = rightControls.createEl("button", {
			cls: `journalify-icon-btn ${settings.liveSplitSync ? "is-active" : ""}`,
			attr: { title: strings.splitSyncTooltip, "aria-label": strings.splitSyncTooltip },
		});
		setIcon(splitToggleBtn, "columns-2");
		splitToggleBtn.addEventListener("click", () => {
			void (async () => {
				settings.liveSplitSync = !settings.liveSplitSync;
				splitToggleBtn.toggleClass("is-active", settings.liveSplitSync);
				await this.plugin.saveSettings();
				if (settings.liveSplitSync && this.currentFilteredEntries[0]) {
					await this.openNoteInWorkspace(this.currentFilteredEntries[0].filePath, true);
				}
			})();
		});

		const inspectorBtn = rightControls.createEl("button", {
			cls: `journalify-icon-btn ${
				(this.isNarrowViewport ? this.mobileInspectorOpen : settings.showInspectorInView)
					? "is-active"
					: ""
			}`,
			attr: {
				title: strings.toggleInspectorTooltip,
				"aria-label": strings.toggleInspectorTooltip,
			},
		});
		setIcon(inspectorBtn, "panel-right");
		inspectorBtn.addEventListener("click", () => {
			void (async () => {
				if (this.isNarrowViewport) {
					this.mobileInspectorOpen = !this.mobileInspectorOpen;
					inspectorBtn.toggleClass("is-active", this.mobileInspectorOpen);
					this.updateResponsiveClasses();
				} else {
					settings.showInspectorInView = !settings.showInspectorInView;
					inspectorBtn.toggleClass("is-active", settings.showInspectorInView);
					await this.plugin.saveSettings();
					this.updateResponsiveClasses();
				}
			})();
		});

		if (this.filterDrawerOpen || this.hasActiveFilters()) {
			this.renderFilterBar(this.rootEl);
		}

		const workspaceBody = this.rootEl.createDiv({ cls: "journalify-workspace-body" });
		this.streamHostEl = workspaceBody.createDiv({ cls: "journalify-stream-host" });
		this.inspectorHostEl = workspaceBody.createDiv({ cls: "journalify-inspector-host" });

		this.inspectorController = new InspectorPanelController(
			this.app,
			this.inspectorHostEl,
			() => this.plugin.settings,
			this.plugin.index,
			{
				onJumpToEntry: (entry) => {
					if (this.isNarrowViewport) {
						this.mobileInspectorOpen = false;
						this.updateResponsiveClasses();
					}
					void this.jumpToEntry(entry.filePath);
				},
				onCreateOrOpenDate: (y, m, d) => {
					void (async () => {
						const targetDate = new Date(y, m - 1, d, 12, 0, 0);
						const source = this.plugin.index.getActiveSource();
						const { file } = await getOrCreateDailyNoteForDate(
							this.app,
							source,
							targetDate,
							lang
						);
						await this.openNoteInWorkspace(file.path, true);
					})();
				},
				onTabChange: () => {
					void this.plugin.saveSettings();
				},
			}
		);

		await this.refreshEntriesAndInspector();
	}

	private hasActiveFilters(): boolean {
		const f = this.filter;
		return Boolean(
			f.moodScore !== null ||
				f.moodEmoji !== null ||
				f.tag !== null ||
				f.location !== null ||
				f.person !== null ||
				f.onlyWithMedia ||
				f.onlyStarred
		);
	}

	private renderFilterBar(parentEl: HTMLElement): void {
		const lang = resolveUiLanguage(this.plugin.settings.uiLanguage);
		const strings = t(lang);
		const bar = parentEl.createDiv({ cls: "journalify-filter-bar" });

		const moodSel = bar.createEl("select", { cls: "journalify-filter-select" });
		moodSel.createEl("option", { value: "", text: strings.allMoods });
		for (const mp of MOOD_PRESETS) {
			const label = lang === "de" ? mp.labelDe : mp.labelEn;
			const opt = moodSel.createEl("option", {
				value: mp.emoji,
				text: `${mp.emoji} ${label}`,
			});
			if (this.filter.moodEmoji === mp.emoji) opt.selected = true;
		}
		moodSel.addEventListener("change", () => {
			this.filter.moodEmoji = moodSel.value || null;
			this.renderedCount = FEED_BATCH_SIZE;
			this.bookSpreadIndex = 0;
			void this.renderStreamArea();
		});

		const tags = this.plugin.index.getDistinctTags();
		if (tags.length > 0 || this.filter.tag) {
			const tagSel = bar.createEl("select", { cls: "journalify-filter-select" });
			tagSel.createEl("option", { value: "", text: strings.allTags });
			for (const tg of tags) {
				const opt = tagSel.createEl("option", { value: tg, text: `#${tg}` });
				if (this.filter.tag === tg) opt.selected = true;
			}
			tagSel.addEventListener("change", () => {
				this.filter.tag = tagSel.value || null;
				this.renderedCount = FEED_BATCH_SIZE;
				this.bookSpreadIndex = 0;
				void this.renderStreamArea();
			});
		}

		const locs = this.plugin.index.getDistinctLocations();
		if (locs.length > 0 || this.filter.location) {
			const locSel = bar.createEl("select", { cls: "journalify-filter-select" });
			locSel.createEl("option", { value: "", text: strings.allLocations });
			for (const l of locs) {
				const opt = locSel.createEl("option", { value: l, text: `📍 ${l}` });
				if (this.filter.location === l) opt.selected = true;
			}
			locSel.addEventListener("change", () => {
				this.filter.location = locSel.value || null;
				this.renderedCount = FEED_BATCH_SIZE;
				this.bookSpreadIndex = 0;
				void this.renderStreamArea();
			});
		}

		const people = this.plugin.index.getDistinctPeople();
		if (people.length > 0 || this.filter.person) {
			const pSel = bar.createEl("select", { cls: "journalify-filter-select" });
			pSel.createEl("option", { value: "", text: strings.allPeople });
			for (const p of people) {
				const opt = pSel.createEl("option", { value: p, text: `👥 ${p}` });
				if (this.filter.person === p) opt.selected = true;
			}
			pSel.addEventListener("change", () => {
				this.filter.person = pSel.value || null;
				this.renderedCount = FEED_BATCH_SIZE;
				this.bookSpreadIndex = 0;
				void this.renderStreamArea();
			});
		}

		const mediaChip = bar.createEl("button", {
			cls: `journalify-filter-chip ${this.filter.onlyWithMedia ? "is-active" : ""}`,
			text: `📷 ${strings.onlyMedia}`,
		});
		mediaChip.addEventListener("click", () => {
			this.filter.onlyWithMedia = !this.filter.onlyWithMedia;
			mediaChip.toggleClass("is-active", this.filter.onlyWithMedia);
			this.renderedCount = FEED_BATCH_SIZE;
			this.bookSpreadIndex = 0;
			void this.renderStreamArea();
		});

		const starChip = bar.createEl("button", {
			cls: `journalify-filter-chip ${this.filter.onlyStarred ? "is-active" : ""}`,
			text: `⭐ ${strings.onlyStarred}`,
		});
		starChip.addEventListener("click", () => {
			this.filter.onlyStarred = !this.filter.onlyStarred;
			starChip.toggleClass("is-active", this.filter.onlyStarred);
			this.renderedCount = FEED_BATCH_SIZE;
			this.bookSpreadIndex = 0;
			void this.renderStreamArea();
		});

		const sortChip = bar.createEl("button", {
			cls: "journalify-filter-chip",
			text:
				this.plugin.settings.sortOrder === "desc"
					? `↓ ${strings.sortNewest}`
					: `↑ ${strings.sortOldest}`,
		});
		sortChip.addEventListener("click", () => {
			void (async () => {
				this.plugin.settings.sortOrder =
					this.plugin.settings.sortOrder === "desc" ? "asc" : "desc";
				this.bookSpreadIndex = 0;
				await this.plugin.saveSettings();
				await this.renderFullShell();
			})();
		});

		if (this.hasActiveFilters() || this.filter.query) {
			const resetBtn = bar.createEl("button", {
				cls: "journalify-btn journalify-btn-clear",
				text: strings.clearFilters,
			});
			resetBtn.addEventListener("click", () => {
				this.filter = createEmptyFilterState();
				void this.renderFullShell();
			});
		}
	}

	async refreshEntriesAndInspector(): Promise<void> {
		await this.renderStreamArea();
		await this.inspectorController?.render();
	}

	private async renderStreamArea(): Promise<void> {
		if (!this.streamHostEl) return;
		const gen = ++this.renderGeneration;

		this.scrollObserver?.disconnect();
		this.streamHostEl.empty();
		const renderComp = this.resetStreamRenderComponent(true)!;

		const settings = this.plugin.settings;
		const strings = t(settings.uiLanguage);

		const queried = await this.plugin.index.queryEntries(
			this.filter,
			settings.sortOrder,
			settings.hideEmptyNotes
		);
		if (gen !== this.renderGeneration) return;
		this.currentFilteredEntries = queried;

		if (settings.layoutMode === "book") {
			await this.renderBookSpreadMode(this.streamHostEl, renderComp, gen);
			return;
		}

		const feedInner = this.streamHostEl.createDiv({
			cls: `journalify-feed-inner layout-${settings.layoutMode}`,
		});

		const todayKey = getTodayDateKey();
		const hasTodayNonEmpty = this.plugin.index
			.getEntriesForDateKey(todayKey)
			.some((e) => e.size > 0);

		if (!hasTodayNonEmpty && !this.hasActiveFilters() && !this.filter.query.trim()) {
			renderQuickStartTodayCard({
				app: this.app,
				containerEl: feedInner,
				settings,
				source: this.plugin.index.getActiveSource(),
				mutator: this.plugin.mutator,
				onCreated: (file) => {
					this.plugin.index.updateFile(file);
				},
			});
		}

		if (this.currentFilteredEntries.length === 0) {
			const emptyBox = feedInner.createDiv({ cls: "journalify-empty-state" });
			emptyBox.createEl("h3", {
				text:
					this.hasActiveFilters() || this.filter.query
						? strings.noFilterMatches
						: strings.emptyFeedTitle,
			});
			if (!this.hasActiveFilters() && !this.filter.query) {
				emptyBox.createEl("p", { text: strings.emptyFeedSubtitle });
			}
			return;
		}

		const cardsContainer = feedInner.createDiv({ cls: "journalify-cards-list" });
		let renderedSoFar = 0;

		const appendNextBatch = async (targetLimit: number) => {
			const slice = this.currentFilteredEntries.slice(renderedSoFar, targetLimit);
			renderedSoFar += slice.length;
			for (const entry of slice) {
				if (gen !== this.renderGeneration) return;
				await renderJournalEntryCard({
					app: this.app,
					parentComponent: renderComp,
					containerEl: cardsContainer,
					entry,
					settings,
					layoutMode: settings.layoutMode,
					index: this.plugin.index,
					mutator: this.plugin.mutator,
					callbacks: {
						onSelectTag: (tag) => {
							this.filter.tag = this.filter.tag === tag ? null : tag;
							void this.renderFullShell();
						},
						onSelectLocation: (loc) => {
							this.filter.location = this.filter.location === loc ? null : loc;
							void this.renderFullShell();
						},
						onSelectPerson: (person) => {
							this.filter.person = this.filter.person === person ? null : person;
							void this.renderFullShell();
						},
						onOpenNote: (fp, split) => {
							void this.openNoteInWorkspace(fp, split);
						},
						onEntryActivated: (fp) => {
							if (this.plugin.settings.liveSplitSync) {
								void this.openNoteInWorkspace(fp, true, true);
							}
						},
						onEntryEdited: () => {
							this.scheduleSoftRefresh();
						},
					},
				});
			}
		};

		await appendNextBatch(Math.min(this.renderedCount, this.currentFilteredEntries.length));
		if (gen !== this.renderGeneration) return;

		if (renderedSoFar < this.currentFilteredEntries.length) {
			const sentinel = feedInner.createDiv({ cls: "journalify-scroll-sentinel" });
			this.scrollObserver = new IntersectionObserver(
				(entries) => {
					if (gen !== this.renderGeneration) return;
					if (entries.some((e) => e.isIntersecting)) {
						this.renderedCount += FEED_BATCH_SIZE;
						void appendNextBatch(
							Math.min(this.renderedCount, this.currentFilteredEntries.length)
						).then(() => {
							if (gen === this.renderGeneration && renderedSoFar >= this.currentFilteredEntries.length) {
								sentinel.remove();
								this.scrollObserver?.disconnect();
							}
						});
					}
				},
				{ root: this.streamHostEl, rootMargin: "320px" }
			);
			this.scrollObserver.observe(sentinel);
		}
	}

	private async renderBookSpreadMode(
		hostEl: HTMLElement,
		renderComp: Component,
		gen: number
	): Promise<void> {
		const settings = this.plugin.settings;
		const strings = t(settings.uiLanguage);

		if (this.currentFilteredEntries.length === 0) {
			const wrap = hostEl.createDiv({ cls: "journalify-feed-inner" });
			renderQuickStartTodayCard({
				app: this.app,
				containerEl: wrap,
				settings,
				source: this.plugin.index.getActiveSource(),
				mutator: this.plugin.mutator,
				onCreated: (file) => this.plugin.index.updateFile(file),
			});
			return;
		}

		const pagesPerSpread = this.isNarrowViewport ? 1 : 2;
		const maxSpreadIdx = Math.max(
			0,
			Math.ceil(this.currentFilteredEntries.length / pagesPerSpread) - 1
		);
		this.bookSpreadIndex = Math.max(0, Math.min(maxSpreadIdx, this.bookSpreadIndex));

		const stage = hostEl.createDiv({ cls: "journalify-book-stage" });
		const spreadEl = stage.createDiv({
			cls: `journalify-book-spread ${pagesPerSpread === 1 ? "is-single-page" : "is-two-page"}`,
		});

		const startIdx = this.bookSpreadIndex * pagesPerSpread;
		const slice = this.currentFilteredEntries.slice(startIdx, startIdx + pagesPerSpread);
		const orderedPages =
			pagesPerSpread === 2 && slice.length === 2 && settings.sortOrder === "desc"
				? [slice[1], slice[0]]
				: slice;

		for (const entry of orderedPages) {
			if (gen !== this.renderGeneration) return;
			const pageEl = spreadEl.createDiv({ cls: "journalify-book-page" });
			await renderJournalEntryCard({
				app: this.app,
				parentComponent: renderComp,
				containerEl: pageEl,
				entry,
				settings,
				layoutMode: "book",
				index: this.plugin.index,
				mutator: this.plugin.mutator,
				callbacks: {
					onSelectTag: (tag) => {
						this.filter.tag = tag;
						void this.renderFullShell();
					},
					onSelectLocation: (loc) => {
						this.filter.location = loc;
						void this.renderFullShell();
					},
					onSelectPerson: (p) => {
						this.filter.person = p;
						void this.renderFullShell();
					},
					onOpenNote: (fp, split) => void this.openNoteInWorkspace(fp, split),
					onEntryActivated: (fp) => {
						if (this.plugin.settings.liveSplitSync) {
							void this.openNoteInWorkspace(fp, true, true);
						}
					},
					onEntryEdited: () => {
						this.scheduleSoftRefresh();
					},
				},
			});
		}

		if (gen !== this.renderGeneration) return;

		if (pagesPerSpread === 2 && orderedPages.length === 1) {
			const blankPage = spreadEl.createDiv({ cls: "journalify-book-page is-blank-companion" });
			renderQuickStartTodayCard({
				app: this.app,
				containerEl: blankPage,
				settings,
				source: this.plugin.index.getActiveSource(),
				mutator: this.plugin.mutator,
				onCreated: (f) => this.plugin.index.updateFile(f),
			});
		}

		const scrubber = stage.createDiv({ cls: "journalify-book-scrubber" });
		const isDesc = settings.sortOrder === "desc";
		const olderDelta = isDesc ? 1 : -1;
		const newerDelta = -olderDelta;

		const olderBtn = scrubber.createEl("button", {
			cls: "journalify-btn journalify-btn-subtle",
			text: `‹ ${strings.bookPrevSpread}`,
		});
		olderBtn.disabled = isDesc
			? this.bookSpreadIndex >= maxSpreadIdx
			: this.bookSpreadIndex <= 0;
		olderBtn.addEventListener("click", () => this.stepBookSpread(olderDelta));

		const dateRangeText =
			orderedPages.length === 2
				? `${orderedPages[0].dateKey}  —  ${orderedPages[1].dateKey}`
				: orderedPages[0].dateKey;
		scrubber.createDiv({ cls: "journalify-book-range-pill", text: dateRangeText });

		const newerBtn = scrubber.createEl("button", {
			cls: "journalify-btn journalify-btn-subtle",
			text: `${strings.bookNextSpread} ›`,
		});
		newerBtn.disabled = isDesc
			? this.bookSpreadIndex <= 0
			: this.bookSpreadIndex >= maxSpreadIdx;
		newerBtn.addEventListener("click", () => this.stepBookSpread(newerDelta));

		const latestTargetIdx = isDesc ? 0 : maxSpreadIdx;
		if (this.bookSpreadIndex !== latestTargetIdx) {
			const latestBtn = scrubber.createEl("button", {
				cls: "journalify-btn journalify-btn-subtle",
				text: strings.bookJumpToday,
			});
			latestBtn.addEventListener("click", () => {
				this.bookSpreadIndex = latestTargetIdx;
				void this.renderStreamArea();
			});
		}
	}

	private stepBookSpread(delta: number): void {
		const pagesPerSpread = this.isNarrowViewport ? 1 : 2;
		const maxSpreadIdx = Math.max(
			0,
			Math.ceil(this.currentFilteredEntries.length / pagesPerSpread) - 1
		);
		const next = Math.max(0, Math.min(maxSpreadIdx, this.bookSpreadIndex + delta));
		if (next !== this.bookSpreadIndex) {
			this.bookSpreadIndex = next;
			void this.renderStreamArea();
		}
	}

	async jumpToEntry(filePath: string): Promise<void> {
		let idx = this.currentFilteredEntries.findIndex((e) => e.filePath === filePath);
		if (idx === -1) {
			this.filter = createEmptyFilterState();
			await this.renderFullShell();
			idx = this.currentFilteredEntries.findIndex((e) => e.filePath === filePath);
		}
		if (idx === -1) return;

		if (this.plugin.settings.layoutMode === "book") {
			const pagesPerSpread = this.isNarrowViewport ? 1 : 2;
			this.bookSpreadIndex = Math.floor(idx / pagesPerSpread);
			await this.renderStreamArea();
			return;
		}

		if (idx >= this.renderedCount) {
			this.renderedCount = idx + 8;
			await this.renderStreamArea();
		}

		const cardEl = this.streamHostEl?.querySelector<HTMLElement>(
			`[data-file-path="${CSS.escape(filePath)}"]`
		);
		if (cardEl) {
			cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
			cardEl.addClass("is-highlighted-pulse");
			window.setTimeout(() => cardEl.removeClass("is-highlighted-pulse"), 1800);
		}
	}

	async openNoteInWorkspace(
		filePath: string,
		inSplit: boolean,
		preserveFocus = false
	): Promise<void> {
		const abstract = this.app.vault.getAbstractFileByPath(filePath);
		if (!(abstract instanceof TFile)) return;

		if (inSplit) {
			let targetLeaf = this.syncedSplitLeaf;
			const activeLeaves = this.app.workspace.getLeavesOfType("markdown");
			if (!targetLeaf || !activeLeaves.includes(targetLeaf)) {
				targetLeaf =
					activeLeaves.find((l) => l !== this.leaf) ??
					this.app.workspace.getLeaf("split", "vertical");
				this.syncedSplitLeaf = targetLeaf;
			}
			const currentView = targetLeaf.view;
			if (currentView instanceof MarkdownView && currentView.file?.path === filePath) {
				if (!preserveFocus) this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
				return;
			}
			await targetLeaf.openFile(abstract, { active: !preserveFocus });
		} else {
			const leaf = this.app.workspace.getLeaf("tab");
			await leaf.openFile(abstract, { active: true });
		}
	}

	filterByMoodScore(score: MoodScore | null): void {
		this.filter.moodScore = score;
		void this.renderFullShell();
	}
}
