import { App, Component, MarkdownRenderer, TFile, setIcon } from "obsidian";
import {
	ExtractedMediaItem,
	JournalEntryIndexItem,
	JournalLayoutMode,
	JournalifySettings,
} from "../types";
import { formatLongHeadingDate, getShortWeekdayForDate, resolveUiLanguage, t } from "../i18n";
import { splitFrontmatterAndBody } from "../parser/frontmatterSplit";
import { extractAllMediaFromNote } from "../parser/mediaExtractor";
import { prepareCardBodyContent } from "../parser/contentFolding";
import { EntryMutator } from "../services/entryMutator";
import { JournalIndex } from "../services/journalIndex";
import { LightboxModal, LightboxSlide, resolveMediaUrl } from "./lightboxModal";
import {
	openListPropertyPopover,
	openMoodPickerPopover,
	openWeatherPickerPopover,
} from "./metadataPopovers";

export interface EntryCardCallbacks {
	onSelectTag: (tag: string) => void;
	onSelectPerson: (person: string) => void;
	onSelectLocation: (location: string) => void;
	onOpenNote: (filePath: string, inSplit: boolean) => void;
	onEntryActivated?: (filePath: string) => void;
	onEntryEdited?: (filePath: string) => void;
}

export interface RenderEntryCardParams {
	app: App;
	parentComponent: Component;
	containerEl: HTMLElement;
	entry: JournalEntryIndexItem;
	settings: JournalifySettings;
	layoutMode: JournalLayoutMode;
	index: JournalIndex;
	mutator: EntryMutator;
	callbacks: EntryCardCallbacks;
}

export async function renderJournalEntryCard(params: RenderEntryCardParams): Promise<HTMLElement> {
	const {
		app,
		parentComponent,
		containerEl,
		entry,
		settings,
		layoutMode,
		index,
		mutator,
		callbacks,
	} = params;

	const lang = resolveUiLanguage(settings.uiLanguage);
	const strings = t(lang);

	const wrapperEl =
		layoutMode === "timeline"
			? containerEl.createDiv({ cls: "journalify-timeline-row" })
			: containerEl;

	if (layoutMode === "timeline") {
		const axisCol = wrapperEl.createDiv({ cls: "journalify-timeline-axis" });
		const nodeBadge = axisCol.createDiv({
			cls: `journalify-timeline-node ${entry.mood ? `mood-score-${entry.mood.score}` : ""}`,
		});
		nodeBadge.setText(entry.mood?.emoji ?? "•");

		const axisMeta = axisCol.createDiv({ cls: "journalify-timeline-date-label" });
		const monthShort = strings.monthsShort[entry.month - 1] ?? "";
		const wdShort = getShortWeekdayForDate(entry.year, entry.month, entry.day, lang);
		axisMeta.createDiv({ cls: "journalify-timeline-day", text: `${entry.day}. ${monthShort}` });
		axisMeta.createDiv({
			cls: "journalify-timeline-sub",
			text: entry.timeLabel ? `${wdShort} · ${entry.timeLabel}` : wdShort,
		});
	}

	const cardEl = wrapperEl.createEl("article", {
		cls: "journalify-card",
		attr: {
			"data-file-path": entry.filePath,
			"data-date-key": entry.dateKey,
		},
	});
	if (entry.starred) cardEl.addClass("is-starred");
	if (entry.mood) cardEl.addClass(`has-mood-score-${entry.mood.score}`);

	cardEl.addEventListener("click", () => {
		callbacks.onEntryActivated?.(entry.filePath);
	});

	const abstract = app.vault.getAbstractFileByPath(entry.filePath);
	const noteFile = abstract instanceof TFile ? abstract : null;
	const rawContent = noteFile ? await app.vault.cachedRead(noteFile) : "";
	const { body: rawBody } = splitFrontmatterAndBody(rawContent);

	const allMedia = extractAllMediaFromNote(rawBody, entry.frontmatterImages);
	const imageItems = settings.aggregateInlineImages
		? allMedia.filter((m) => m.kind === "image")
		: allMedia.filter((m) => m.kind === "image" && m.fromFrontmatter);
	const audioVideoItems = allMedia.filter((m) => m.kind === "audio" || m.kind === "video");

	const prepared = prepareCardBodyContent(rawBody, {
		aggregateInlineImages: settings.aggregateInlineImages,
		collapseLongEntries: layoutMode !== "book" && settings.collapseLongEntries,
		collapseMaxLines: settings.collapseMaxLines,
		collapseAfterHr: layoutMode !== "book" && settings.collapseAfterHr,
		hasAnyMedia: imageItems.length > 0 || audioVideoItems.length > 0,
	});

	if (
		prepared.isCompletelyEmpty &&
		settings.hideEmptyNotes &&
		layoutMode !== "book" &&
		!entry.mood &&
		!entry.weather &&
		entry.locations.length === 0 &&
		entry.people.length === 0 &&
		entry.tags.length === 0 &&
		!entry.starred
	) {
		wrapperEl.remove();
		return wrapperEl;
	}

	const longDateHeading = formatLongHeadingDate(entry.year, entry.month, entry.day, lang);

	if (entry.starred && layoutMode === "book") {
		const ribbon = cardEl.createDiv({ cls: "journalify-book-ribbon" });
		setIcon(ribbon, "star");
	}

	const innerLayoutEl =
		settings.theme === "minimal" && layoutMode === "feed"
			? cardEl.createDiv({ cls: "journalify-minimal-columns" })
			: cardEl;

	if (settings.theme === "minimal" && layoutMode === "feed") {
		const dateCol = innerLayoutEl.createDiv({ cls: "journalify-minimal-date-col" });
		dateCol.createDiv({ cls: "journalify-minimal-day-num", text: String(entry.day) });
		const wd = getShortWeekdayForDate(entry.year, entry.month, entry.day, lang).toUpperCase();
		const mShort = (strings.monthsShort[entry.month - 1] ?? "").toUpperCase();
		dateCol.createDiv({ cls: "journalify-minimal-month-wd", text: `${mShort} · ${wd}` });
		if (entry.mood) {
			dateCol.createDiv({ cls: "journalify-minimal-mood", text: entry.mood.emoji });
		}
		if (entry.weather) {
			dateCol.createDiv({ cls: "journalify-minimal-weather", text: entry.weather });
		}
	}

	const mainCol =
		settings.theme === "minimal" && layoutMode === "feed"
			? innerLayoutEl.createDiv({ cls: "journalify-minimal-main-col" })
			: innerLayoutEl;

	if (settings.theme === "typewriter") {
		renderTypewriterStampHeader(mainCol, entry, noteFile, settings, index, mutator);
	}

	const headerEl = mainCol.createDiv({ cls: "journalify-card-header" });
	const titleWrap = headerEl.createDiv({ cls: "journalify-card-title-wrap" });

	if (settings.theme !== "minimal" || layoutMode !== "feed") {
		const h3 = titleWrap.createEl("h3", {
			cls: "journalify-card-date-heading",
			text: entry.timeLabel ? `${longDateHeading} · ${entry.timeLabel}` : longDateHeading,
		});
		h3.addEventListener("click", (ev) => {
			if (ev.metaKey || ev.ctrlKey) {
				ev.stopPropagation();
				callbacks.onOpenNote(entry.filePath, true);
			}
		});
	}

	const toolsEl = headerEl.createDiv({ cls: "journalify-card-tools" });

	if (noteFile) {
		const starBtn = toolsEl.createEl("button", {
			cls: `journalify-icon-btn ${entry.starred ? "is-active" : ""}`,
			attr: { "aria-label": entry.starred ? strings.unstarEntry : strings.starEntry },
		});
		setIcon(starBtn, "star");
		starBtn.addEventListener("click", (ev) => {
			ev.stopPropagation();
			void mutator.toggleStarred(noteFile, !entry.starred);
		});
	}

	const editBtn = toolsEl.createEl("button", {
		cls: "journalify-icon-btn",
		attr: { "aria-label": strings.editInline, title: strings.editInline },
	});
	setIcon(editBtn, "pencil");

	const splitBtn = toolsEl.createEl("button", {
		cls: "journalify-icon-btn",
		attr: { "aria-label": strings.openInSplit, title: strings.openInSplit },
	});
	setIcon(splitBtn, "columns-2");
	splitBtn.addEventListener("click", (ev) => {
		ev.stopPropagation();
		callbacks.onOpenNote(entry.filePath, true);
	});

	const openBtn = toolsEl.createEl("button", {
		cls: "journalify-icon-btn",
		attr: { "aria-label": strings.openInObsidian, title: strings.openInObsidian },
	});
	setIcon(openBtn, "arrow-up-right");
	openBtn.addEventListener("click", (ev) => {
		ev.stopPropagation();
		callbacks.onOpenNote(entry.filePath, false);
	});

	if (settings.theme !== "typewriter") {
		renderMetadataBadgesRow({
			containerEl: mainCol,
			entry,
			noteFile,
			settings,
			index,
			mutator,
			callbacks,
		});
	}

	const renderGalleryFirst =
		settings.theme === "editorial" ||
		settings.theme === "cozy" ||
		layoutMode === "book";

	const bodySectionHolder = mainCol.createDiv({ cls: "journalify-card-content-stack" });

	if (renderGalleryFirst && imageItems.length > 0) {
		renderPhotoGalleryGrid(
			app,
			bodySectionHolder,
			imageItems,
			entry,
			longDateHeading,
			settings,
			(fp) => callbacks.onOpenNote(fp, false)
		);
	}

	const proseHostEl = bodySectionHolder.createDiv({ cls: "journalify-card-prose-host" });
	let isExpanded = false;
	let isEditingInline = false;
	let exitEditFn: (() => Promise<void>) | null = null;

	const renderReadProse = async () => {
		proseHostEl.empty();
		const activeMarkdown = isExpanded ? prepared.expandedMarkdown : prepared.previewMarkdown;

		if (activeMarkdown.trim().length > 0) {
			const mdEl = proseHostEl.createDiv({
				cls: `journalify-markdown-rendered ${
					settings.theme === "editorial" ? "has-drop-cap" : ""
				}`,
			});
			await MarkdownRenderer.render(
				app,
				activeMarkdown,
				mdEl,
				entry.filePath,
				parentComponent
			);

			wireInteractiveRenderedMarkdown({
				app,
				mdEl,
				noteFile,
				sourcePath: entry.filePath,
				mutator,
				onSelectTag: callbacks.onSelectTag,
			});

			mdEl.addEventListener("dblclick", (ev) => {
				const target = ev.target as HTMLElement;
				if (target.closest("a, input, button, audio, video, img")) return;
				if (noteFile) {
					ev.stopPropagation();
					void enterInlineEditMode();
				}
			});
		}

		if (prepared.isFolded) {
			const foldBtn = proseHostEl.createEl("button", {
				cls: "journalify-fold-toggle",
				text: isExpanded ? strings.showLess : strings.showMore,
			});
			foldBtn.addEventListener("click", (ev) => {
				ev.stopPropagation();
				isExpanded = !isExpanded;
				void renderReadProse();
			});
		}
	};

	const enterInlineEditMode = async () => {
		if (!noteFile || isEditingInline) return;
		isEditingInline = true;
		editBtn.addClass("is-active");
		proseHostEl.empty();

		const latestRaw = await app.vault.cachedRead(noteFile);
		const { body: editableBody } = splitFrontmatterAndBody(latestRaw);

		const editorWrap = proseHostEl.createDiv({ cls: "journalify-inline-editor-wrap" });
		const ta = editorWrap.createEl("textarea", {
			cls: "journalify-inline-textarea journalify-autoheight-textarea",
		});
		ta.value = editableBody;

		const autoResize = () => {
			ta.setCssProps({ "--jf-ta-height": "auto" });
			ta.setCssProps({ "--jf-ta-height": `${Math.max(110, ta.scrollHeight + 6)}px` });
		};

		let saveTimer: number | null = null;
		let dirty = false;
		let didSaveAnyChange = false;
		const win = ta.ownerDocument.defaultView || window;

		const flushSave = async () => {
			if (saveTimer !== null) {
				win.clearTimeout(saveTimer);
				saveTimer = null;
			}
			if (!dirty) return;
			dirty = false;
			didSaveAnyChange = true;
			await mutator.updateBodyPreservingFrontmatter(noteFile, ta.value);
		};

		ta.addEventListener("input", () => {
			dirty = true;
			autoResize();
			if (saveTimer !== null) win.clearTimeout(saveTimer);
			saveTimer = win.setTimeout(() => {
				void flushSave();
			}, 450);
		});

		const exitInlineEditMode = async () => {
			if (!isEditingInline) return;
			await flushSave();
			isEditingInline = false;
			exitEditFn = null;
			editBtn.removeClass("is-active");

			if (didSaveAnyChange && callbacks.onEntryEdited) {
				callbacks.onEntryEdited(entry.filePath);
				return;
			}

			const refreshedRaw = await app.vault.cachedRead(noteFile);
			const { body: nextBody } = splitFrontmatterAndBody(refreshedRaw);
			const nextPrepared = prepareCardBodyContent(nextBody, {
				aggregateInlineImages: settings.aggregateInlineImages,
				collapseLongEntries: layoutMode !== "book" && settings.collapseLongEntries,
				collapseMaxLines: settings.collapseMaxLines,
				collapseAfterHr: layoutMode !== "book" && settings.collapseAfterHr,
				hasAnyMedia: imageItems.length > 0 || audioVideoItems.length > 0,
			});
			prepared.previewMarkdown = nextPrepared.previewMarkdown;
			prepared.expandedMarkdown = nextPrepared.expandedMarkdown;
			prepared.isFolded = nextPrepared.isFolded;
			await renderReadProse();
		};

		exitEditFn = exitInlineEditMode;

		ta.addEventListener("keydown", (ev) => {
			if (ev.key === "Escape" || ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter")) {
				ev.preventDefault();
				void exitInlineEditMode();
				return;
			}
			if (ev.key === "Enter" && !ev.shiftKey) {
				const pos = ta.selectionStart;
				const before = ta.value.slice(0, pos);
				const lineStart = before.lastIndexOf("\n") + 1;
				const currentLine = before.slice(lineStart);
				const taskMatch = /^(\s*[-*+]\s+)\[[ xX]\]\s+(.+)$/.exec(currentLine);
				if (taskMatch) {
					ev.preventDefault();
					const insert = `\n${taskMatch[1]}[ ] `;
					const after = ta.value.slice(ta.selectionEnd);
					ta.value = `${before}${insert}${after}`;
					ta.selectionStart = ta.selectionEnd = pos + insert.length;
					dirty = true;
					autoResize();
				}
			}
		});

		const bar = editorWrap.createDiv({ cls: "journalify-inline-editor-bar" });
		const doneBtn = bar.createEl("button", {
			cls: "journalify-btn journalify-btn-primary",
			text: strings.finishInlineEdit,
		});
		doneBtn.addEventListener("click", (ev) => {
			ev.stopPropagation();
			void exitInlineEditMode();
		});

		win.setTimeout(() => {
			autoResize();
			ta.focus();
		}, 0);
	};

	editBtn.addEventListener("click", (ev) => {
		ev.stopPropagation();
		if (isEditingInline && exitEditFn) {
			void exitEditFn();
		} else {
			void enterInlineEditMode();
		}
	});

	await renderReadProse();

	if (!renderGalleryFirst && imageItems.length > 0) {
		renderPhotoGalleryGrid(
			app,
			bodySectionHolder,
			imageItems,
			entry,
			longDateHeading,
			settings,
			(fp) => callbacks.onOpenNote(fp, false)
		);
	}

	if (audioVideoItems.length > 0) {
		const mediaStack = bodySectionHolder.createDiv({ cls: "journalify-av-stack" });
		for (const av of audioVideoItems) {
			const url = resolveMediaUrl(app, av.src, entry.filePath, av.isExternal);
			if (!url) continue;
			if (av.kind === "audio") {
				const audioRow = mediaStack.createDiv({ cls: "journalify-audio-row" });
				const iconSpan = audioRow.createSpan({ cls: "journalify-audio-icon" });
				setIcon(iconSpan, "mic");
				audioRow.createSpan({
					cls: "journalify-audio-label",
					text: av.alt || av.src.split("/").pop() || "Audio",
				});
				audioRow.createEl("audio", {
					cls: "journalify-audio-player",
					attr: { controls: "controls", preload: "metadata", src: url },
				});
			} else {
				mediaStack.createEl("video", {
					cls: "journalify-video-player",
					attr: { controls: "controls", preload: "metadata", src: url },
				});
			}
		}
	}

	if (entry.tags.length > 0) {
		const footerEl = mainCol.createDiv({ cls: "journalify-card-footer" });
		const tagRow = footerEl.createDiv({ cls: "journalify-tag-list" });
		for (const tag of entry.tags) {
			const pill = tagRow.createEl("button", {
				cls: "journalify-tag-pill",
				text: `#${tag}`,
			});
			pill.addEventListener("click", (ev) => {
				ev.stopPropagation();
				callbacks.onSelectTag(tag);
			});
		}
	}

	return wrapperEl;
}

function renderMetadataBadgesRow(opts: {
	containerEl: HTMLElement;
	entry: JournalEntryIndexItem;
	noteFile: TFile | null;
	settings: JournalifySettings;
	index: JournalIndex;
	mutator: EntryMutator;
	callbacks: EntryCardCallbacks;
}): void {
	const { containerEl, entry, noteFile, settings, index, mutator, callbacks } = opts;
	const lang = resolveUiLanguage(settings.uiLanguage);
	const strings = t(lang);

	const metaRow = containerEl.createDiv({ cls: "journalify-meta-row" });

	if (entry.mood) {
		const moodBadge = metaRow.createEl("button", {
			cls: `journalify-meta-pill journalify-mood-pill mood-score-${entry.mood.score}`,
		});
		moodBadge.createSpan({ cls: "journalify-mood-emoji", text: entry.mood.emoji });
		if (entry.mood.label) {
			moodBadge.createSpan({ cls: "journalify-mood-text", text: entry.mood.label });
		}
		if (noteFile) {
			moodBadge.addEventListener("click", (ev) => {
				ev.stopPropagation();
				openMoodPickerPopover({
					anchorEl: moodBadge,
					currentRaw: entry.mood?.raw ?? null,
					lang,
					onSelect: (val) => mutator.setMood(noteFile, val),
				});
			});
		}
	} else if (noteFile) {
		const addMoodBtn = metaRow.createEl("button", {
			cls: "journalify-ghost-chip journalify-hover-reveal",
			text: `+ 😊 ${strings.addMood}`,
		});
		addMoodBtn.addEventListener("click", (ev) => {
			ev.stopPropagation();
			openMoodPickerPopover({
				anchorEl: addMoodBtn,
				currentRaw: null,
				lang,
				onSelect: (val) => mutator.setMood(noteFile, val),
			});
		});
	}

	if (entry.weather) {
		const weatherBadge = metaRow.createEl("button", {
			cls: "journalify-meta-pill journalify-weather-pill",
			text: entry.weather,
		});
		if (noteFile) {
			weatherBadge.addEventListener("click", (ev) => {
				ev.stopPropagation();
				openWeatherPickerPopover({
					anchorEl: weatherBadge,
					dateKey: entry.dateKey,
					currentWeather: entry.weather,
					weatherSettings: settings.weather,
					lang,
					onSelect: (val) => mutator.setWeather(noteFile, val),
				});
			});
		}
	} else if (noteFile) {
		const addWeatherBtn = metaRow.createEl("button", {
			cls: "journalify-ghost-chip journalify-hover-reveal",
			text: `+ ☀️ ${strings.addWeather}`,
		});
		addWeatherBtn.addEventListener("click", (ev) => {
			ev.stopPropagation();
			openWeatherPickerPopover({
				anchorEl: addWeatherBtn,
				dateKey: entry.dateKey,
				currentWeather: null,
				weatherSettings: settings.weather,
				lang,
				onSelect: (val) => mutator.setWeather(noteFile, val),
			});
		});
	}

	if (entry.locations.length > 0) {
		for (const loc of entry.locations) {
			const locChip = metaRow.createEl("button", {
				cls: "journalify-meta-pill journalify-location-pill",
				text: `📍 ${loc}`,
			});
			locChip.addEventListener("click", (ev) => {
				ev.stopPropagation();
				if (ev.altKey || !noteFile) {
					callbacks.onSelectLocation(loc);
				} else {
					openListPropertyPopover({
						anchorEl: locChip,
						title: strings.addLocation,
						placeholder: strings.locationPlaceholder,
						currentItems: entry.locations,
						suggestions: index.getDistinctLocations(),
						lang,
						onSave: (items) => mutator.setLocations(noteFile, items),
					});
				}
			});
		}
	} else if (noteFile) {
		const addLocBtn = metaRow.createEl("button", {
			cls: "journalify-ghost-chip journalify-hover-reveal",
			text: `+ 📍 ${strings.addLocation}`,
		});
		addLocBtn.addEventListener("click", (ev) => {
			ev.stopPropagation();
			openListPropertyPopover({
				anchorEl: addLocBtn,
				title: strings.addLocation,
				placeholder: strings.locationPlaceholder,
				currentItems: [],
				suggestions: index.getDistinctLocations(),
				lang,
				onSave: (items) => mutator.setLocations(noteFile, items),
			});
		});
	}

	if (entry.people.length > 0) {
		const peopleLabel = entry.people.join(", ");
		const peopleChip = metaRow.createEl("button", {
			cls: "journalify-meta-pill journalify-people-pill",
			text: `👥 ${peopleLabel}`,
		});
		peopleChip.addEventListener("click", (ev) => {
			ev.stopPropagation();
			if (ev.altKey || !noteFile) {
				callbacks.onSelectPerson(entry.people[0]);
			} else {
				openListPropertyPopover({
					anchorEl: peopleChip,
					title: strings.addPeople,
					placeholder: strings.peoplePlaceholder,
					currentItems: entry.people,
					suggestions: index.getDistinctPeople(),
					lang,
					onSave: (items) => mutator.setPeople(noteFile, items),
				});
			}
		});
	} else if (noteFile) {
		const addPeopleBtn = metaRow.createEl("button", {
			cls: "journalify-ghost-chip journalify-hover-reveal",
			text: `+ 👥 ${strings.addPeople}`,
		});
		addPeopleBtn.addEventListener("click", (ev) => {
			ev.stopPropagation();
			openListPropertyPopover({
				anchorEl: addPeopleBtn,
				title: strings.addPeople,
				placeholder: strings.peoplePlaceholder,
				currentItems: [],
				suggestions: index.getDistinctPeople(),
				lang,
				onSave: (items) => mutator.setPeople(noteFile, items),
			});
		});
	}
}

function renderTypewriterStampHeader(
	containerEl: HTMLElement,
	entry: JournalEntryIndexItem,
	noteFile: TFile | null,
	settings: JournalifySettings,
	index: JournalIndex,
	mutator: EntryMutator
): void {
	const lang = resolveUiLanguage(settings.uiLanguage);
	const strings = t(lang);
	const wd = getShortWeekdayForDate(entry.year, entry.month, entry.day, lang).toUpperCase();

	const stampGrid = containerEl.createDiv({ cls: "journalify-typewriter-stamp" });

	const makeCell = (label: string, val: string, onClick?: (el: HTMLElement) => void) => {
		const cell = stampGrid.createDiv({
			cls: `journalify-stamp-cell ${onClick ? "is-clickable" : ""}`,
		});
		cell.createDiv({ cls: "journalify-stamp-label", text: label });
		cell.createDiv({ cls: "journalify-stamp-value", text: val });
		if (onClick) {
			cell.addEventListener("click", (ev) => {
				ev.stopPropagation();
				onClick(cell);
			});
		}
	};

	makeCell(lang === "de" ? "DATUM" : "DATE", `${entry.dateKey} (${wd})`);
	makeCell(
		lang === "de" ? "WETTER" : "WEATHER",
		entry.weather ?? "—",
		noteFile
			? (el) =>
					openWeatherPickerPopover({
						anchorEl: el,
						dateKey: entry.dateKey,
						currentWeather: entry.weather,
						weatherSettings: settings.weather,
						lang,
						onSelect: (v) => mutator.setWeather(noteFile, v),
					})
			: undefined
	);
	makeCell(
		lang === "de" ? "STIMMUNG" : "MOOD",
		entry.mood ? `${entry.mood.emoji} ${entry.mood.label}`.trim() : "—",
		noteFile
			? (el) =>
					openMoodPickerPopover({
						anchorEl: el,
						currentRaw: entry.mood?.raw ?? null,
						lang,
						onSelect: (v) => mutator.setMood(noteFile, v),
					})
			: undefined
	);
	makeCell(
		lang === "de" ? "ORT" : "LOCATION",
		entry.locations.length > 0 ? entry.locations.join(", ") : "—",
		noteFile
			? (el) =>
					openListPropertyPopover({
						anchorEl: el,
						title: strings.addLocation,
						placeholder: strings.locationPlaceholder,
						currentItems: entry.locations,
						suggestions: index.getDistinctLocations(),
						lang,
						onSave: (items) => mutator.setLocations(noteFile, items),
					})
			: undefined
	);
	makeCell(
		lang === "de" ? "PERSONEN" : "PEOPLE",
		entry.people.length > 0 ? entry.people.join(", ") : "—",
		noteFile
			? (el) =>
					openListPropertyPopover({
						anchorEl: el,
						title: strings.addPeople,
						placeholder: strings.peoplePlaceholder,
						currentItems: entry.people,
						suggestions: index.getDistinctPeople(),
						lang,
						onSave: (items) => mutator.setPeople(noteFile, items),
					})
			: undefined
	);
}

function renderPhotoGalleryGrid(
	app: App,
	containerEl: HTMLElement,
	images: ExtractedMediaItem[],
	entry: JournalEntryIndexItem,
	dateHeading: string,
	settings: JournalifySettings,
	onJumpToNote: (filePath: string) => void
): void {
	const lang = resolveUiLanguage(settings.uiLanguage);
	const resolvedSlides: LightboxSlide[] = [];
	for (const img of images) {
		const url = resolveMediaUrl(app, img.src, entry.filePath, img.isExternal);
		if (url) {
			resolvedSlides.push({
				url,
				caption: img.alt || (!img.isExternal ? img.src.split("/").pop() || "" : ""),
				dateHeading,
				filePath: entry.filePath,
			});
		}
	}
	if (resolvedSlides.length === 0) return;

	const countClass =
		resolvedSlides.length === 1
			? "count-1"
			: resolvedSlides.length === 2
			? "count-2"
			: resolvedSlides.length === 3
			? "count-3"
			: "count-4plus";

	const galleryEl = containerEl.createDiv({
		cls: `journalify-gallery ${countClass}`,
	});

	const visibleCount = Math.min(4, resolvedSlides.length);
	const strings = t(lang);

	for (let i = 0; i < visibleCount; i++) {
		const slide = resolvedSlides[i];
		const tile = galleryEl.createDiv({ cls: "journalify-gallery-tile" });
		const imgEl = tile.createEl("img", {
			cls: "journalify-gallery-img",
			attr: {
				src: slide.url,
				alt: slide.caption,
				loading: "lazy",
			},
		});

		if (slide.url.startsWith("http")) {
			imgEl.setAttribute("referrerpolicy", "no-referrer");
		}

		if (settings.theme === "scrapbook" || settings.theme === "typewriter") {
			if (slide.caption) {
				tile.createDiv({ cls: "journalify-tile-caption", text: slide.caption });
			}
		}

		if (i === 3 && resolvedSlides.length > 4) {
			tile.createDiv({
				cls: "journalify-gallery-more-badge",
				text: strings.morePhotos(resolvedSlides.length - 4),
			});
		}

		tile.addEventListener("click", (ev) => {
			ev.stopPropagation();
			new LightboxModal(app, resolvedSlides, i, lang, onJumpToNote).open();
		});
	}
}

function wireInteractiveRenderedMarkdown(opts: {
	app: App;
	mdEl: HTMLElement;
	noteFile: TFile | null;
	sourcePath: string;
	mutator: EntryMutator;
	onSelectTag: (tag: string) => void;
}): void {
	const { app, mdEl, noteFile, sourcePath, mutator, onSelectTag } = opts;

	const checkboxes = Array.from(
		mdEl.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox")
	);
	checkboxes.forEach((cb, idx) => {
		cb.removeAttribute("disabled");
		cb.addEventListener("click", (ev) => {
			ev.stopPropagation();
			if (!noteFile) return;
			const targetState = cb.checked;
			const li = cb.closest(".task-list-item");
			if (li) li.toggleClass("is-checked", targetState);
			void mutator.toggleTaskCheckbox(noteFile, idx, targetState);
		});
	});

	mdEl.querySelectorAll<HTMLAnchorElement>("a.internal-link").forEach((link) => {
		const href = link.getAttribute("data-href") || link.getAttribute("href") || "";
		if (!href) return;

		link.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			const newLeaf = ev.metaKey || ev.ctrlKey;
			void app.workspace.openLinkText(href, sourcePath, newLeaf);
		});

		link.addEventListener("mouseover", (ev) => {
			app.workspace.trigger("hover-link", {
				event: ev,
				source: "preview",
				hoverParent: mdEl,
				targetEl: link,
				linktext: href,
				sourcePath,
			});
		});
	});

	mdEl.querySelectorAll<HTMLAnchorElement>("a.tag").forEach((tagLink) => {
		tagLink.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			const rawTag = (tagLink.getAttribute("href") || tagLink.textContent || "")
				.replace(/^#+/, "")
				.trim();
			if (rawTag) onSelectTag(rawTag);
		});
	});
}
