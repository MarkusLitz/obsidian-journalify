import { Notice, setIcon } from "obsidian";
import { UiLanguage, WeatherSettings } from "../types";
import { t } from "../i18n";
import { MOOD_PRESETS, WEATHER_PRESETS } from "../parser/propertyMapper";
import { fetchWeatherForDate } from "../services/weatherService";

let activeCleanup: (() => void) | null = null;

export function closeActivePopover(): void {
	if (activeCleanup) {
		const fn = activeCleanup;
		activeCleanup = null;
		fn();
	}
}

function mountAnchoredPopover(anchorEl: HTMLElement): { popEl: HTMLDivElement; close: () => void } {
	closeActivePopover();

	const doc = anchorEl.ownerDocument;
	const win = doc.defaultView || window;
	const popEl = doc.body.createDiv({ cls: "journalify-popover" });
	const rect = anchorEl.getBoundingClientRect();

	const top = Math.max(12, Math.min(win.innerHeight - 320, rect.bottom + 6));
	const left = Math.max(12, Math.min(win.innerWidth - 300, rect.left));
	popEl.setCssProps({
		"--jf-pop-top": `${Math.round(top)}px`,
		"--jf-pop-left": `${Math.round(left)}px`,
	});

	const onOutsidePointer = (ev: MouseEvent) => {
		const target = ev.target as Node | null;
		if (target && (popEl.contains(target) || anchorEl.contains(target))) {
			return;
		}
		close();
	};

	const onKeyDown = (ev: KeyboardEvent) => {
		if (ev.key === "Escape") {
			ev.stopPropagation();
			close();
		}
	};

	const close = () => {
		win.removeEventListener("mousedown", onOutsidePointer, true);
		win.removeEventListener("keydown", onKeyDown, true);
		popEl.remove();
		if (activeCleanup === close) {
			activeCleanup = null;
		}
	};

	activeCleanup = close;
	win.setTimeout(() => {
		win.addEventListener("mousedown", onOutsidePointer, true);
		win.addEventListener("keydown", onKeyDown, true);
	}, 0);

	return { popEl, close };
}

export function openMoodPickerPopover(opts: {
	anchorEl: HTMLElement;
	currentRaw: string | null;
	lang: UiLanguage;
	onSelect: (nextValue: string | null) => Promise<void> | void;
}): void {
	const strings = t(opts.lang);
	const { popEl, close } = mountAnchoredPopover(opts.anchorEl);

	popEl.createDiv({ cls: "journalify-popover-title", text: strings.addMood });

	const grid = popEl.createDiv({ cls: "journalify-emoji-grid" });
	for (const preset of MOOD_PRESETS) {
		const label = opts.lang === "de" ? preset.labelDe : preset.labelEn;
		const btn = grid.createEl("button", {
			cls: "journalify-emoji-option",
			attr: { title: `${preset.emoji} ${label}` },
		});
		if (opts.currentRaw && opts.currentRaw.includes(preset.emoji)) {
			btn.addClass("is-selected");
		}
		btn.createSpan({ cls: "journalify-emoji-glyph", text: preset.emoji });
		btn.createSpan({ cls: "journalify-emoji-caption", text: label });
		btn.addEventListener("click", () => {
			close();
			void opts.onSelect(`${preset.emoji} ${label}`);
		});
	}

	const customRow = popEl.createDiv({ cls: "journalify-popover-input-row" });
	const input = customRow.createEl("input", {
		type: "text",
		cls: "journalify-popover-input",
		value: opts.currentRaw ?? "",
		placeholder: "😊 …",
	});
	const saveBtn = customRow.createEl("button", {
		cls: "journalify-btn journalify-btn-primary",
		text: strings.applyLabel,
	});

	const submitCustom = () => {
		const val = input.value.trim();
		close();
		void opts.onSelect(val || null);
	};

	saveBtn.addEventListener("click", submitCustom);
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			submitCustom();
		}
	});

	if (opts.currentRaw) {
		const clearBtn = popEl.createEl("button", {
			cls: "journalify-btn journalify-btn-clear",
			text: strings.removeLabel,
		});
		clearBtn.addEventListener("click", () => {
			close();
			void opts.onSelect(null);
		});
	}
}

export function openWeatherPickerPopover(opts: {
	anchorEl: HTMLElement;
	dateKey: string;
	currentWeather: string | null;
	weatherSettings: WeatherSettings;
	lang: UiLanguage;
	onSelect: (nextValue: string | null) => Promise<void> | void;
}): void {
	const strings = t(opts.lang);
	const { popEl, close } = mountAnchoredPopover(opts.anchorEl);

	popEl.createDiv({ cls: "journalify-popover-title", text: strings.addWeather });

	if (opts.weatherSettings.enabled) {
		const autoBtn = popEl.createEl("button", {
			cls: "journalify-btn journalify-btn-accent journalify-popover-fullbtn",
		});
		const iconSpan = autoBtn.createSpan({ cls: "journalify-btn-icon" });
		setIcon(iconSpan, "cloud-sun");
		const labelSpan = autoBtn.createSpan({ text: strings.fetchWeatherAuto });

		autoBtn.addEventListener("click", () => {
			void (async () => {
				if (
					opts.weatherSettings.latitude === null ||
					opts.weatherSettings.longitude === null
				) {
					new Notice(strings.weatherNoCoords);
					return;
				}
				autoBtn.disabled = true;
				labelSpan.setText(strings.fetchingWeather);
				try {
					const res = await fetchWeatherForDate(
						opts.weatherSettings.latitude,
						opts.weatherSettings.longitude,
						opts.dateKey,
						opts.weatherSettings.unit,
						opts.lang
					);
					if (res) {
						close();
						await opts.onSelect(res.formatted);
					} else {
						autoBtn.disabled = false;
						labelSpan.setText(strings.fetchWeatherAuto);
					}
				} catch (err) {
					new Notice(`Weather error: ${(err as Error).message}`);
					autoBtn.disabled = false;
					labelSpan.setText(strings.fetchWeatherAuto);
				}
			})();
		});
	}

	const inputRow = popEl.createDiv({ cls: "journalify-popover-input-row" });
	const input = inputRow.createEl("input", {
		type: "text",
		cls: "journalify-popover-input",
		value: opts.currentWeather ?? "",
		placeholder: opts.weatherSettings.unit === "fahrenheit" ? "☀️ 68°F" : "☀️ 18°C",
	});

	const presetRow = popEl.createDiv({ cls: "journalify-weather-strip" });
	for (const w of WEATHER_PRESETS) {
		const label = opts.lang === "de" ? w.labelDe : w.labelEn;
		const chip = presetRow.createEl("button", {
			cls: "journalify-weather-chip",
			text: w.emoji,
			attr: { title: label },
		});
		chip.addEventListener("click", () => {
			const existingTemp = /-?\d+\s*°[CF]/i.exec(input.value);
			input.value = existingTemp ? `${w.emoji} ${existingTemp[0]}` : `${w.emoji} ${label}`;
			input.focus();
		});
	}

	const saveBtn = inputRow.createEl("button", {
		cls: "journalify-btn journalify-btn-primary",
		text: strings.applyLabel,
	});

	const submit = () => {
		const v = input.value.trim();
		close();
		void opts.onSelect(v || null);
	};

	saveBtn.addEventListener("click", submit);
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			submit();
		}
	});

	if (opts.currentWeather) {
		const clearBtn = popEl.createEl("button", {
			cls: "journalify-btn journalify-btn-clear",
			text: strings.removeLabel,
		});
		clearBtn.addEventListener("click", () => {
			close();
			void opts.onSelect(null);
		});
	}
}

export function openListPropertyPopover(opts: {
	anchorEl: HTMLElement;
	title: string;
	placeholder: string;
	currentItems: string[];
	suggestions: string[];
	lang: UiLanguage;
	onSave: (items: string[]) => Promise<void> | void;
}): void {
	const strings = t(opts.lang);
	const { popEl, close } = mountAnchoredPopover(opts.anchorEl);

	popEl.createDiv({ cls: "journalify-popover-title", text: opts.title });

	const inputRow = popEl.createDiv({ cls: "journalify-popover-input-row" });
	const input = inputRow.createEl("input", {
		type: "text",
		cls: "journalify-popover-input",
		value: opts.currentItems.join(", "),
		placeholder: opts.placeholder,
	});
	const saveBtn = inputRow.createEl("button", {
		cls: "journalify-btn journalify-btn-primary",
		text: strings.applyLabel,
	});

	if (opts.suggestions.length > 0) {
		const chipsWrap = popEl.createDiv({ cls: "journalify-suggestion-chips" });
		for (const sug of opts.suggestions.slice(0, 12)) {
			const chip = chipsWrap.createEl("button", {
				cls: "journalify-suggestion-chip",
				text: sug,
			});
			chip.addEventListener("click", () => {
				const parts = input.value
					.split(",")
					.map((p) => p.trim())
					.filter(Boolean);
				const existsIdx = parts.findIndex((p) => p.toLowerCase() === sug.toLowerCase());
				if (existsIdx !== -1) {
					parts.splice(existsIdx, 1);
				} else {
					parts.push(sug);
				}
				input.value = parts.join(", ");
				input.focus();
			});
		}
	}

	const submit = () => {
		const next = input.value
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		close();
		void opts.onSave(next);
	};

	saveBtn.addEventListener("click", submit);
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			submit();
		}
	});
	const win = opts.anchorEl.ownerDocument.defaultView || window;
	win.setTimeout(() => input.focus(), 10);
}
