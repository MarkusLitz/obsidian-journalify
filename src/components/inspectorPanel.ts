import { App, TFile, setIcon } from "obsidian";
import { JournalEntryIndexItem, JournalifySettings, MoodScore } from "../types";
import { formatLongHeadingDate, resolveUiLanguage, t } from "../i18n";
import { getTodayDateKey, pad2 } from "../parser/dateUtils";
import { splitFrontmatterAndBody } from "../parser/frontmatterSplit";
import { extractAllMediaFromNote } from "../parser/mediaExtractor";
import { JournalIndex } from "../services/journalIndex";
import { LightboxModal, LightboxSlide, resolveMediaUrl } from "./lightboxModal";

export interface InspectorCallbacks {
	onJumpToEntry: (entry: JournalEntryIndexItem) => void;
	onCreateOrOpenDate?: (year: number, month: number, day: number) => void;
	onTabChange?: (tab: "calendar" | "media" | "onThisDay") => void;
}

export class InspectorPanelController {
	private app: App;
	private hostEl: HTMLElement;
	private getSettings: () => JournalifySettings;
	private index: JournalIndex;
	private callbacks: InspectorCallbacks;
	private viewYear: number;
	private viewMonth: number; // 1..12
	private renderGeneration = 0;

	constructor(
		app: App,
		hostEl: HTMLElement,
		getSettings: () => JournalifySettings,
		index: JournalIndex,
		callbacks: InspectorCallbacks
	) {
		this.app = app;
		this.hostEl = hostEl;
		this.getSettings = getSettings;
		this.index = index;
		this.callbacks = callbacks;

		const now = new Date();
		this.viewYear = now.getFullYear();
		this.viewMonth = now.getMonth() + 1;
	}

	setDisplayedMonth(year: number, month: number): void {
		this.viewYear = year;
		this.viewMonth = month;
		void this.render();
	}

	async render(): Promise<void> {
		const gen = ++this.renderGeneration;
		this.hostEl.empty();
		this.hostEl.addClass("journalify-inspector");

		const settings = this.getSettings();
		const lang = resolveUiLanguage(settings.uiLanguage);
		const strings = t(lang);
		const activeTab = settings.inspectorActiveTab || "calendar";

		const statsBar = this.hostEl.createDiv({ cls: "journalify-inspector-statsbar" });
		const streak = this.index.getCurrentStreak(new Date(), settings.hideEmptyNotes);
		const totalCount = this.index.getAllEntries("desc", !settings.hideEmptyNotes).length;

		const streakBadge = statsBar.createDiv({ cls: "journalify-stat-pill" });
		streakBadge.setText(`🔥 ${streak} ${strings.streakLabel}`);

		const totalBadge = statsBar.createDiv({ cls: "journalify-stat-pill" });
		totalBadge.setText(`📔 ${totalCount} ${strings.entriesCountLabel}`);

		const tabBar = this.hostEl.createDiv({ cls: "journalify-inspector-tabs" });
		const makeTab = (id: "calendar" | "media" | "onThisDay", label: string, iconName: string) => {
			const btn = tabBar.createEl("button", {
				cls: `journalify-inspector-tab ${activeTab === id ? "is-active" : ""}`,
			});
			const ic = btn.createSpan({ cls: "journalify-tab-icon" });
			setIcon(ic, iconName);
			btn.createSpan({ text: label });
			btn.addEventListener("click", () => {
				settings.inspectorActiveTab = id;
				this.callbacks.onTabChange?.(id);
				void this.render();
			});
		};

		makeTab("calendar", strings.inspectorCalendarTab, "calendar");
		makeTab("media", strings.inspectorMediaTab, "image");
		makeTab("onThisDay", strings.inspectorOnThisDayTab, "history");

		const bodyEl = this.hostEl.createDiv({ cls: "journalify-inspector-body" });

		if (activeTab === "calendar") {
			this.renderCalendarModule(bodyEl, settings);
			this.renderMoodTrendModule(bodyEl, settings);
			await this.renderOnThisDaySection(bodyEl, settings, true, gen);
		} else if (activeTab === "media") {
			await this.renderMediaWallModule(bodyEl, settings, gen);
		} else {
			await this.renderOnThisDaySection(bodyEl, settings, false, gen);
		}
	}

	private renderCalendarModule(parentEl: HTMLElement, settings: JournalifySettings): void {
		const lang = resolveUiLanguage(settings.uiLanguage);
		const strings = t(lang);
		const section = parentEl.createDiv({ cls: "journalify-inspector-card" });

		const nav = section.createDiv({ cls: "journalify-cal-header" });
		const prevBtn = nav.createEl("button", { cls: "journalify-icon-btn" });
		setIcon(prevBtn, "chevron-left");
		prevBtn.addEventListener("click", () => {
			this.viewMonth--;
			if (this.viewMonth < 1) {
				this.viewMonth = 12;
				this.viewYear--;
			}
			void this.render();
		});

		const monthTitle = nav.createDiv({
			cls: "journalify-cal-title",
			text: `${strings.monthsLong[this.viewMonth - 1]} ${this.viewYear}`,
		});
		monthTitle.addEventListener("click", () => {
			const now = new Date();
			this.viewYear = now.getFullYear();
			this.viewMonth = now.getMonth() + 1;
			void this.render();
		});

		const nextBtn = nav.createEl("button", { cls: "journalify-icon-btn" });
		setIcon(nextBtn, "chevron-right");
		nextBtn.addEventListener("click", () => {
			this.viewMonth++;
			if (this.viewMonth > 12) {
				this.viewMonth = 1;
				this.viewYear++;
			}
			void this.render();
		});

		const grid = section.createDiv({ cls: "journalify-cal-grid" });
		for (const wd of strings.weekdaysShort) {
			grid.createDiv({ cls: "journalify-cal-wd", text: wd });
		}

		const firstDay = new Date(this.viewYear, this.viewMonth - 1, 1);
		const startOffset = (firstDay.getDay() + 6) % 7;
		const daysInMonth = new Date(this.viewYear, this.viewMonth, 0).getDate();
		const todayKey = getTodayDateKey();

		for (let e = 0; e < startOffset; e++) {
			grid.createDiv({ cls: "journalify-cal-cell is-empty" });
		}

		for (let day = 1; day <= daysInMonth; day++) {
			const dateKey = `${this.viewYear}-${pad2(this.viewMonth)}-${pad2(day)}`;
			const dayEntries = this.index
				.getEntriesForDateKey(dateKey)
				.filter((it) => !settings.hideEmptyNotes || it.size > 0);
			const hasEntry = dayEntries.length > 0;
			const topMood = dayEntries.find((d) => d.mood !== null)?.mood ?? null;

			const cell = grid.createEl("button", {
				cls: [
					"journalify-cal-cell",
					hasEntry ? "has-entry" : "",
					dateKey === todayKey ? "is-today" : "",
					topMood ? `mood-score-${topMood.score}` : "",
				]
					.filter(Boolean)
					.join(" "),
			});

			cell.createSpan({ cls: "journalify-cal-day-num", text: String(day) });

			if (settings.theme === "scrapbook" && topMood) {
				cell.createSpan({ cls: "journalify-cal-mini-emoji", text: topMood.emoji });
			} else if (hasEntry) {
				cell.createSpan({
					cls: `journalify-cal-dot ${topMood ? `mood-score-${topMood.score}` : ""}`,
				});
			}

			cell.addEventListener("click", () => {
				if (hasEntry) {
					this.callbacks.onJumpToEntry(dayEntries[0]);
				} else {
					this.callbacks.onCreateOrOpenDate?.(this.viewYear, this.viewMonth, day);
				}
			});
		}
	}

	private renderMoodTrendModule(parentEl: HTMLElement, settings: JournalifySettings): void {
		const strings = t(settings.uiLanguage);
		const summary = this.index.getMonthlySummary(
			this.viewYear,
			this.viewMonth,
			settings.hideEmptyNotes
		);

		const card = parentEl.createDiv({ cls: "journalify-inspector-card" });
		card.createDiv({ cls: "journalify-inspector-heading", text: strings.moodTrendTitle });

		const daysInMonth = new Date(this.viewYear, this.viewMonth, 0).getDate();
		const svgNS = "http://www.w3.org/2000/svg";
		const width = 260;
		const height = 84;
		const padX = 12;
		const padY = 12;

		const svg = document.createElementNS(svgNS, "svg");
		svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
		svg.classList.add("journalify-mood-svg");

		for (const level of [1, 3, 5]) {
			const y = height - padY - ((level - 1) / 4) * (height - padY * 2);
			const line = document.createElementNS(svgNS, "line");
			line.setAttribute("x1", String(padX));
			line.setAttribute("x2", String(width - padX));
			line.setAttribute("y1", String(y));
			line.setAttribute("y2", String(y));
			line.classList.add("journalify-chart-gridline");
			svg.appendChild(line);
		}

		if (summary.dailyPoints.length > 0) {
			const coords = summary.dailyPoints.map((pt) => {
				const x =
					padX + ((pt.day - 1) / Math.max(1, daysInMonth - 1)) * (width - padX * 2);
				const y = height - padY - ((pt.avgScore - 1) / 4) * (height - padY * 2);
				return { x, y, pt };
			});

			if (coords.length >= 2) {
				let dPath = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
				for (let i = 0; i < coords.length - 1; i++) {
					const p0 = coords[i];
					const p1 = coords[i + 1];
					const cx = ((p0.x + p1.x) / 2).toFixed(1);
					dPath += ` C ${cx} ${p0.y.toFixed(1)}, ${cx} ${p1.y.toFixed(1)}, ${p1.x.toFixed(
						1
					)} ${p1.y.toFixed(1)}`;
				}

				const areaPath = document.createElementNS(svgNS, "path");
				const bottomY = (height - padY).toFixed(1);
				areaPath.setAttribute(
					"d",
					`${dPath} L ${coords[coords.length - 1].x.toFixed(1)} ${bottomY} L ${coords[0].x.toFixed(
						1
					)} ${bottomY} Z`
				);
				areaPath.classList.add("journalify-chart-area");
				svg.appendChild(areaPath);

				const strokePath = document.createElementNS(svgNS, "path");
				strokePath.setAttribute("d", dPath);
				strokePath.classList.add("journalify-chart-line");
				svg.appendChild(strokePath);
			}

			for (const c of coords) {
				const circle = document.createElementNS(svgNS, "circle");
				circle.setAttribute("cx", c.x.toFixed(1));
				circle.setAttribute("cy", c.y.toFixed(1));
				circle.setAttribute("r", "3.5");
				circle.classList.add("journalify-chart-dot");
				svg.appendChild(circle);
			}
		}

		card.appendChild(svg);

		const totalScored = Object.values(summary.moodCounts).reduce((a, b) => a + b, 0);
		if (totalScored > 0) {
			const bar = card.createDiv({ cls: "journalify-mood-balance-bar" });
			for (const score of [5, 4, 3, 2, 1] as MoodScore[]) {
				const count = summary.moodCounts[score];
				if (count === 0) continue;
				const seg = bar.createDiv({
					cls: `journalify-mood-seg mood-score-${score}`,
					attr: {
						title: `${strings.moodLabels[score]}: ${count}`,
					},
				});
				seg.setCssProps({ "--jf-seg-grow": String(count) });
			}
		}
	}

	private async renderMediaWallModule(
		parentEl: HTMLElement,
		settings: JournalifySettings,
		gen: number
	): Promise<void> {
		const lang = resolveUiLanguage(settings.uiLanguage);
		const strings = t(lang);
		const card = parentEl.createDiv({ cls: "journalify-inspector-card" });
		card.createDiv({ cls: "journalify-inspector-heading", text: strings.inspectorMediaTab });

		const entries = this.index.getAllEntries("desc", false);
		const allSlides: Array<{ slide: LightboxSlide; entry: JournalEntryIndexItem }> = [];

		for (const entry of entries) {
			if (gen !== this.renderGeneration) return;
			const abstract = this.app.vault.getAbstractFileByPath(entry.filePath);
			if (!(abstract instanceof TFile)) continue;
			if (!entry.hasMedia && entry.size < 25) continue;

			const raw = await this.app.vault.cachedRead(abstract);
			if (gen !== this.renderGeneration) return;

			const { body } = splitFrontmatterAndBody(raw);
			const media = extractAllMediaFromNote(body, entry.frontmatterImages).filter(
				(m) => m.kind === "image"
			);
			if (media.length === 0) continue;

			const heading = formatLongHeadingDate(entry.year, entry.month, entry.day, lang);
			for (const img of media) {
				const url = resolveMediaUrl(this.app, img.src, entry.filePath, img.isExternal);
				if (url) {
					allSlides.push({
						entry,
						slide: {
							url,
							caption: img.alt || "",
							dateHeading: heading,
							filePath: entry.filePath,
						},
					});
				}
			}
			if (allSlides.length >= 60) break;
		}

		if (gen !== this.renderGeneration) return;

		if (allSlides.length === 0) {
			card.createDiv({ cls: "journalify-inspector-empty", text: strings.mediaGalleryEmpty });
			return;
		}

		const grid = card.createDiv({ cls: "journalify-media-wall-grid" });
		const lightboxList = allSlides.map((x) => x.slide);

		allSlides.forEach((item, idx) => {
			const thumb = grid.createDiv({ cls: "journalify-media-thumb" });
			const img = thumb.createEl("img", {
				attr: {
					src: item.slide.url,
					alt: item.slide.dateHeading,
					loading: "lazy",
				},
			});
			if (item.slide.url.startsWith("http")) {
				img.setAttribute("referrerpolicy", "no-referrer");
			}
			thumb.addEventListener("click", () => {
				new LightboxModal(
					this.app,
					lightboxList,
					idx,
					lang,
					() => this.callbacks.onJumpToEntry(item.entry)
				).open();
			});
		});
	}

	private async renderOnThisDaySection(
		parentEl: HTMLElement,
		settings: JournalifySettings,
		compact: boolean,
		gen: number
	): Promise<void> {
		const strings = t(settings.uiLanguage);
		const now = new Date();
		const memories = this.index.getOnThisDayEntries(now, settings.hideEmptyNotes);

		if (compact && memories.length === 0) return;

		const card = parentEl.createDiv({ cls: "journalify-inspector-card journalify-otd-card" });
		card.createDiv({ cls: "journalify-inspector-heading", text: strings.onThisDayTitle });

		if (memories.length === 0) {
			card.createDiv({ cls: "journalify-inspector-empty", text: strings.onThisDayEmpty });
			return;
		}

		const limit = compact ? 2 : memories.length;
		for (const mem of memories.slice(0, limit)) {
			if (gen !== this.renderGeneration) return;
			const yearsDiff = now.getFullYear() - mem.year;
			const itemEl = card.createDiv({ cls: "journalify-otd-item" });

			const topLine = itemEl.createDiv({ cls: "journalify-otd-topline" });
			topLine.createSpan({
				cls: "journalify-otd-year-badge",
				text: `${mem.year} · ${strings.yearsAgo(yearsDiff)}`,
			});
			if (mem.mood) {
				topLine.createSpan({ text: mem.mood.emoji });
			}

			const abstract = this.app.vault.getAbstractFileByPath(mem.filePath);
			if (abstract instanceof TFile) {
				const raw = await this.app.vault.cachedRead(abstract);
				if (gen !== this.renderGeneration) return;
				const { body } = splitFrontmatterAndBody(raw);
				const snippet = body
					.replace(/!\[\[[^\]]+\]\]/g, "")
					.replace(/!\[[^\]]*\]\([^)]+\)/g, "")
					.replace(/<[^>]+>/g, "")
					.replace(/[#>*_`~-]/g, " ")
					.replace(/\s+/g, " ")
					.trim()
					.slice(0, 130);
				if (snippet) {
					itemEl.createDiv({
						cls: "journalify-otd-snippet",
						text: snippet.length >= 130 ? `${snippet}…` : snippet,
					});
				}
			}

			itemEl.addEventListener("click", () => this.callbacks.onJumpToEntry(mem));
		}
	}
}
