import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type JournalifyPlugin from "./main";
import {
	JournalLayoutMode,
	JournalProfile,
	JournalThemeId,
	TemperatureUnit,
	UiLanguagePreference,
} from "./types";
import { resolveUiLanguage, t } from "./i18n";
import { detectVaultDailyNotesConfig } from "./services/sourceResolver";
import { searchCityCoordinates } from "./services/weatherService";
import { DayOneImportModal } from "./components/dayOneModal";

export class JournalifySettingTab extends PluginSettingTab {
	plugin: JournalifyPlugin;

	constructor(app: App, plugin: JournalifyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const settings = this.plugin.settings;
		const resolvedLang = resolveUiLanguage(settings.uiLanguage);
		const strings = t(resolvedLang);

		containerEl.createEl("p", {
			cls: "journalify-settings-lead",
			text: strings.settingsLead,
		});

		new Setting(containerEl)
			.setName(strings.settingsLanguageName)
			.setDesc(strings.settingsLanguageDesc)
			.addDropdown((dd) =>
				dd
					.addOption("auto", strings.settingsLanguageAuto)
					.addOption("en", "English")
					.addOption("de", "Deutsch")
					.setValue(settings.uiLanguage)
					.onChange(async (val) => {
						settings.uiLanguage = (
							val === "de" || val === "en" ? val : "auto"
						) as UiLanguagePreference;
						await this.plugin.saveSettings();
						await this.plugin.refreshOpenViews();
						this.display();
					})
			);

		new Setting(containerEl).setName(strings.settingsProfilesHeading).setHeading();

		const activeProfile: JournalProfile =
			settings.profiles.find((p) => p.id === settings.activeProfileId) ||
			settings.profiles[0];

		const profileSelectorSetting = new Setting(containerEl).setName(strings.settingsProfileName);

		if (settings.profiles.length > 1) {
			profileSelectorSetting.addDropdown((dd) => {
				for (const p of settings.profiles) {
					dd.addOption(p.id, p.name);
				}
				dd.setValue(activeProfile.id).onChange(async (val) => {
					settings.activeProfileId = val;
					await this.plugin.saveSettings();
					this.plugin.index.rebuild();
					await this.plugin.refreshOpenViews();
					this.display();
				});
			});
		}

		profileSelectorSetting.addText((txt) =>
			txt.setValue(activeProfile.name).onChange(async (val) => {
				activeProfile.name = val.trim() || "Journal";
				await this.plugin.saveSettings();
				await this.plugin.refreshOpenViews();
			})
		);

		profileSelectorSetting.addButton((btn) =>
			btn.setButtonText(strings.settingsAddProfile).onClick(async () => {
				const newId = `profile-${Date.now()}`;
				settings.profiles.push({
					id: newId,
					name: `Journal ${settings.profiles.length + 1}`,
					folder: "",
					dateFormat: "YYYY-MM-DD",
					templatePath: "",
					includeSubfolders: true,
					autoSyncDailyNotesConfig: false,
				});
				settings.activeProfileId = newId;
				await this.plugin.saveSettings();
				this.plugin.index.rebuild();
				await this.plugin.refreshOpenViews();
				this.display();
			})
		);

		if (settings.profiles.length > 1) {
			profileSelectorSetting.addButton((btn) =>
				btn
					.setWarning()
					.setButtonText(strings.settingsDeleteProfile)
					.onClick(async () => {
						settings.profiles = settings.profiles.filter(
							(p) => p.id !== activeProfile.id
						);
						settings.activeProfileId = settings.profiles[0].id;
						await this.plugin.saveSettings();
						this.plugin.index.rebuild();
						await this.plugin.refreshOpenViews();
						this.display();
					})
			);
		}

		const detected = detectVaultDailyNotesConfig(this.app);
		const detectedHint = detected.source
			? ` (${detected.source}: "${detected.folder || "/"}" · ${detected.dateFormat})`
			: "";

		new Setting(containerEl)
			.setName(strings.settingsAutoSyncDailyNotes)
			.setDesc(`${strings.settingsAutoSyncDailyNotesDesc}${detectedHint}`)
			.addToggle((tg) =>
				tg.setValue(activeProfile.autoSyncDailyNotesConfig).onChange(async (val) => {
					activeProfile.autoSyncDailyNotesConfig = val;
					await this.plugin.saveSettings();
					this.plugin.index.rebuild();
					await this.plugin.refreshOpenViews();
					this.display();
				})
			);

		new Setting(containerEl)
			.setName(strings.settingsFolder)
			.setDesc(strings.settingsFolderDesc)
			.addText((txt) =>
				txt
					.setPlaceholder(detected.folder || "Daily Notes")
					.setValue(activeProfile.folder)
					.onChange(async (val) => {
						activeProfile.folder = val.trim();
						await this.plugin.saveSettings();
						this.plugin.index.rebuild();
						await this.plugin.refreshOpenViews();
					})
			);

		new Setting(containerEl)
			.setName(strings.settingsDateFormat)
			.setDesc(strings.settingsDateFormatDesc)
			.addText((txt) =>
				txt
					.setPlaceholder("YYYY-MM-DD")
					.setValue(activeProfile.dateFormat)
					.onChange(async (val) => {
						activeProfile.dateFormat = val.trim() || "YYYY-MM-DD";
						await this.plugin.saveSettings();
						this.plugin.index.rebuild();
						await this.plugin.refreshOpenViews();
					})
			);

		new Setting(containerEl)
			.setName(strings.settingsTemplatePath)
			.setDesc(strings.settingsTemplatePathDesc)
			.addText((txt) =>
				txt
					.setPlaceholder(detected.templatePath || "Templates/Daily.md")
					.setValue(activeProfile.templatePath)
					.onChange(async (val) => {
						activeProfile.templatePath = val.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(strings.settingsIncludeSubfolders)
			.addToggle((tg) =>
				tg.setValue(activeProfile.includeSubfolders).onChange(async (val) => {
					activeProfile.includeSubfolders = val;
					await this.plugin.saveSettings();
					this.plugin.index.rebuild();
					await this.plugin.refreshOpenViews();
				})
			);

		new Setting(containerEl).setName(strings.settingsAppearanceHeading).setHeading();

		new Setting(containerEl).setName(strings.settingsDefaultLayout).addDropdown((dd) => {
			const layouts: JournalLayoutMode[] = ["feed", "timeline", "book"];
			for (const l of layouts) {
				dd.addOption(l, strings.layoutNames[l]);
			}
			dd.setValue(settings.layoutMode).onChange(async (val) => {
				settings.layoutMode = val as JournalLayoutMode;
				await this.plugin.saveSettings();
				await this.plugin.refreshOpenViews();
			});
		});

		new Setting(containerEl)
			.setName(strings.settingsTheme)
			.setDesc(strings.settingsThemeDesc)
			.addDropdown((dd) => {
				const themes: JournalThemeId[] = [
					"native",
					"cozy",
					"minimal",
					"scrapbook",
					"editorial",
					"typewriter",
				];
				for (const th of themes) {
					dd.addOption(th, strings.themeNames[th]);
				}
				dd.setValue(settings.theme).onChange(async (val) => {
					settings.theme = val as JournalThemeId;
					await this.plugin.saveSettings();
					await this.plugin.refreshOpenViews();
				});
			});

		new Setting(containerEl)
			.setName(strings.settingsAggregateImages)
			.setDesc(strings.settingsAggregateImagesDesc)
			.addToggle((tg) =>
				tg.setValue(settings.aggregateInlineImages).onChange(async (val) => {
					settings.aggregateInlineImages = val;
					await this.plugin.saveSettings();
					await this.plugin.refreshOpenViews();
				})
			);

		new Setting(containerEl)
			.setName(strings.settingsHideEmpty)
			.setDesc(strings.settingsHideEmptyDesc)
			.addToggle((tg) =>
				tg.setValue(settings.hideEmptyNotes).onChange(async (val) => {
					settings.hideEmptyNotes = val;
					await this.plugin.saveSettings();
					await this.plugin.refreshOpenViews();
				})
			);

		new Setting(containerEl)
			.setName(strings.settingsCollapseLong)
			.setDesc(strings.settingsCollapseLongDesc)
			.addToggle((tg) =>
				tg.setValue(settings.collapseLongEntries).onChange(async (val) => {
					settings.collapseLongEntries = val;
					await this.plugin.saveSettings();
					await this.plugin.refreshOpenViews();
				})
			);

		new Setting(containerEl)
			.setName(strings.settingsCollapseAfterHr)
			.setDesc(strings.settingsCollapseAfterHrDesc)
			.addToggle((tg) =>
				tg.setValue(settings.collapseAfterHr).onChange(async (val) => {
					settings.collapseAfterHr = val;
					await this.plugin.saveSettings();
					await this.plugin.refreshOpenViews();
				})
			);

		new Setting(containerEl).setName(strings.settingsWeatherHeading).setHeading();

		new Setting(containerEl)
			.setName(strings.settingsWeatherEnabled)
			.setDesc(strings.settingsWeatherEnabledDesc)
			.addToggle((tg) =>
				tg.setValue(settings.weather.enabled).onChange(async (val) => {
					settings.weather.enabled = val;
					await this.plugin.saveSettings();
					this.display();
				})
			);

		if (settings.weather.enabled) {
			new Setting(containerEl)
				.setName(strings.settingsWeatherAutoCreate)
				.setDesc(strings.settingsWeatherAutoCreateDesc)
				.addToggle((tg) =>
					tg.setValue(settings.weather.autoFetchOnCreate).onChange(async (val) => {
						settings.weather.autoFetchOnCreate = val;
						await this.plugin.saveSettings();
					})
				);

			new Setting(containerEl).setName(strings.settingsWeatherUnit).addDropdown((dd) =>
				dd
					.addOption("celsius", "Celsius (°C)")
					.addOption("fahrenheit", "Fahrenheit (°F)")
					.setValue(settings.weather.unit)
					.onChange(async (val) => {
						settings.weather.unit = val as TemperatureUnit;
						await this.plugin.saveSettings();
					})
			);

			let cityQuery = settings.weather.locationName || "";
			const coordLabel =
				settings.weather.latitude !== null && settings.weather.longitude !== null
					? ` [${settings.weather.latitude.toFixed(2)}, ${settings.weather.longitude.toFixed(2)}]`
					: "";

			const citySetting = new Setting(containerEl)
				.setName(strings.settingsWeatherCity)
				.setDesc(`${strings.settingsWeatherCityDesc}${coordLabel}`);

			const candidatesBox = containerEl.createDiv({ cls: "journalify-geo-candidates" });

			citySetting.addText((txt) =>
				txt
					.setPlaceholder("Munich / Berlin / New York…")
					.setValue(cityQuery)
					.onChange((v) => {
						cityQuery = v;
					})
			);

			citySetting.addButton((btn) =>
				btn.setButtonText(strings.settingsWeatherSearchBtn).onClick(async () => {
					candidatesBox.empty();
					if (!cityQuery.trim()) return;
					try {
						const hits = await searchCityCoordinates(cityQuery, resolvedLang);
						if (hits.length === 0) {
							new Notice("No matching locations found.");
							return;
						}
						for (const hit of hits) {
							const label = [hit.name, hit.admin1, hit.country]
								.filter(Boolean)
								.join(", ");
							const chip = candidatesBox.createEl("button", {
								cls: "journalify-suggestion-chip",
								text: `📍 ${label}`,
							});
							chip.addEventListener("click", () => {
								void (async () => {
									settings.weather.locationName = label;
									settings.weather.latitude = hit.latitude;
									settings.weather.longitude = hit.longitude;
									await this.plugin.saveSettings();
									this.display();
								})();
							});
						}
					} catch (err) {
						new Notice(`Geocoding error: ${(err as Error).message}`);
					}
				})
			);
		}

		new Setting(containerEl)
			.setName(strings.settingsPropertiesHeading)
			.setDesc(strings.settingsPropertiesDesc)
			.setHeading();

		const propDefs: Array<{ key: keyof typeof settings.propertyMapping; label: string; def: string }> = [
			{ key: "moodKey", label: "Mood property", def: "mood" },
			{ key: "weatherKey", label: "Weather property", def: "weather" },
			{ key: "locationKey", label: "Location property", def: "location" },
			{ key: "peopleKey", label: "People property", def: "people" },
			{ key: "imageKey", label: "Cover or image property", def: "image" },
			{ key: "starredKey", label: "Favorite or starred property", def: "starred" },
			{ key: "dateKey", label: "Date fallback property", def: "date" },
		];

		for (const pd of propDefs) {
			new Setting(containerEl).setName(pd.label).addText((txt) =>
				txt
					.setPlaceholder(pd.def)
					.setValue(settings.propertyMapping[pd.key])
					.onChange(async (val) => {
						settings.propertyMapping[pd.key] = val.trim() || pd.def;
						await this.plugin.saveSettings();
						this.plugin.index.rebuild();
						await this.plugin.refreshOpenViews();
					})
			);
		}

		new Setting(containerEl).setName(strings.settingsDayOneHeading).setHeading();

		new Setting(containerEl)
			.setName(strings.settingsDayOneBtn)
			.setDesc(strings.settingsDayOneDesc)
			.addButton((btn) =>
				btn
					.setCta()
					.setButtonText(strings.settingsDayOneBtn)
					.onClick(() => {
						const source = this.plugin.index.getActiveSource();
						new DayOneImportModal(
							this.app,
							settings,
							source.folder,
							source.dateFormat,
							() => {
								this.plugin.index.rebuild();
								void this.plugin.refreshOpenViews();
							}
						).open();
					})
			);
	}
}
