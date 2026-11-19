import { App, Notice, TFile, setIcon } from "obsidian";
import { JournalifySettings } from "../types";
import { formatLongHeadingDate, resolveUiLanguage, t } from "../i18n";
import { getTodayDateKey } from "../parser/dateUtils";
import { EffectiveJournalSource, getOrCreateDailyNoteForDate } from "../services/sourceResolver";
import { EntryMutator } from "../services/entryMutator";
import { fetchWeatherForDate } from "../services/weatherService";
import { openMoodPickerPopover, openWeatherPickerPopover } from "./metadataPopovers";

export interface QuickStartCardOptions {
	app: App;
	containerEl: HTMLElement;
	settings: JournalifySettings;
	source: EffectiveJournalSource;
	mutator: EntryMutator;
	onCreated: (file: TFile) => void;
}

export function renderQuickStartTodayCard(opts: QuickStartCardOptions): void {
	const { app, containerEl, settings, source, mutator, onCreated } = opts;
	const lang = resolveUiLanguage(settings.uiLanguage);
	const strings = t(lang);
	const initialNow = new Date();

	const card = containerEl.createDiv({ cls: "journalify-card journalify-quickstart-card" });

	const header = card.createDiv({ cls: "journalify-card-header" });
	const titleGroup = header.createDiv({ cls: "journalify-quickstart-title-group" });
	titleGroup.createSpan({ cls: "journalify-quickstart-pill", text: strings.todayCardTitle });
	titleGroup.createEl("h3", {
		cls: "journalify-card-date-heading",
		text: formatLongHeadingDate(
			initialNow.getFullYear(),
			initialNow.getMonth() + 1,
			initialNow.getDate(),
			lang
		),
	});

	const quickActions = header.createDiv({ cls: "journalify-card-meta-actions is-always-visible" });

	const ensureTodayNoteWithAutoWeather = async (initialText = ""): Promise<TFile> => {
		const now = new Date();
		const todayKey = getTodayDateKey(now);
		const { file, created } = await getOrCreateDailyNoteForDate(
			app,
			source,
			now,
			lang,
			initialText
		);
		if (
			created &&
			settings.weather.enabled &&
			settings.weather.autoFetchOnCreate &&
			settings.weather.latitude !== null &&
			settings.weather.longitude !== null
		) {
			try {
				const w = await fetchWeatherForDate(
					settings.weather.latitude,
					settings.weather.longitude,
					todayKey,
					settings.weather.unit,
					lang
				);
				if (w) await mutator.setWeather(file, w.formatted);
			} catch {
				// Ignore transient offline weather lookup failure
			}
		}
		return file;
	};

	const moodBtn = quickActions.createEl("button", {
		cls: "journalify-ghost-chip",
		text: `+ 😊 ${strings.addMood}`,
	});
	moodBtn.addEventListener("click", () => {
		openMoodPickerPopover({
			anchorEl: moodBtn,
			currentRaw: null,
			lang,
			onSelect: async (val) => {
				if (!val) return;
				const file = await ensureTodayNoteWithAutoWeather();
				await mutator.setMood(file, val);
				onCreated(file);
			},
		});
	});

	const weatherBtn = quickActions.createEl("button", {
		cls: "journalify-ghost-chip",
		text: `+ ☀️ ${strings.addWeather}`,
	});
	weatherBtn.addEventListener("click", () => {
		const liveTodayKey = getTodayDateKey(new Date());
		openWeatherPickerPopover({
			anchorEl: weatherBtn,
			dateKey: liveTodayKey,
			currentWeather: null,
			weatherSettings: settings.weather,
			lang,
			onSelect: async (val) => {
				if (!val) return;
				const { file } = await getOrCreateDailyNoteForDate(app, source, new Date(), lang);
				await mutator.setWeather(file, val);
				onCreated(file);
			},
		});
	});

	const composerWrap = card.createDiv({ cls: "journalify-quickstart-composer" });
	const textarea = composerWrap.createEl("textarea", {
		cls: "journalify-inline-textarea journalify-quickstart-textarea",
		attr: {
			rows: "3",
			placeholder: strings.todayCardPlaceholder,
		},
	});

	const footer = composerWrap.createDiv({ cls: "journalify-quickstart-footer" });

	const fileInput = footer.createEl("input", {
		type: "file",
		cls: "journalify-hidden-file-input",
		attr: { accept: "image/*,audio/*,video/*", multiple: "multiple" },
	});

	const photoBtn = footer.createEl("button", {
		cls: "journalify-btn journalify-btn-subtle",
	});
	const photoIcon = photoBtn.createSpan({ cls: "journalify-btn-icon" });
	setIcon(photoIcon, "image-plus");
	photoBtn.createSpan({ text: strings.todayDropPhotoHint });
	photoBtn.addEventListener("click", () => fileInput.click());

	fileInput.addEventListener("change", () => {
		void (async () => {
			if (!fileInput.files || fileInput.files.length === 0) return;
			try {
				const noteFile = await ensureTodayNoteWithAutoWeather(textarea.value.trim());
				textarea.value = "";
				for (let i = 0; i < fileInput.files.length; i++) {
					const f = fileInput.files[i];
					const buf = await f.arrayBuffer();
					await mutator.attachMediaFileToNote(noteFile, f.name, buf);
				}
				onCreated(noteFile);
			} catch (err) {
				new Notice(`Attachment error: ${(err as Error).message}`);
			} finally {
				fileInput.value = "";
			}
		})();
	});

	const saveBtn = footer.createEl("button", {
		cls: "journalify-btn journalify-btn-primary",
		text: strings.todayCreateButton,
	});

	const submitText = async () => {
		const text = textarea.value.trim();
		if (!text) return;
		saveBtn.disabled = true;
		try {
			const file = await ensureTodayNoteWithAutoWeather(text);
			textarea.value = "";
			onCreated(file);
		} finally {
			saveBtn.disabled = false;
		}
	};

	saveBtn.addEventListener("click", () => {
		void submitText();
	});
	textarea.addEventListener("keydown", (ev) => {
		if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
			ev.preventDefault();
			void submitText();
		}
	});
}
