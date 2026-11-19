import {
	App,
	Notice,
	PluginSettingTab,
	SettingDefinitionItem,
	SettingGroup,
	TFile,
} from "obsidian";
import type JournalifyPlugin from "./main";
import {
	JournalProfile,
	PropertyMapping,
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
		this.icon = "book-open";
	}

	private getActiveProfile(): JournalProfile {
		const settings = this.plugin.settings;
		return (
			settings.profiles.find((p) => p.id === settings.activeProfileId) ||
			settings.profiles[0]
		);
	}

	getControlValue(key: string): unknown {
		const settings = this.plugin.settings;
		const profile = this.getActiveProfile();

		switch (key) {
			case "uiLanguage":
				return settings.uiLanguage;
			case "profile.autoSync":
				return profile.autoSyncDailyNotesConfig;
			case "profile.folder":
				return profile.folder;
			case "profile.dateFormat":
				return profile.dateFormat;
			case "profile.templatePath":
				return profile.templatePath;
			case "profile.includeSubfolders":
				return profile.includeSubfolders;
			case "layoutMode":
				return settings.layoutMode;
			case "theme":
				return settings.theme;
			case "aggregateInlineImages":
				return settings.aggregateInlineImages;
			case "hideEmptyNotes":
				return settings.hideEmptyNotes;
			case "collapseLongEntries":
				return settings.collapseLongEntries;
			case "collapseAfterHr":
				return settings.collapseAfterHr;
			case "weather.enabled":
				return settings.weather.enabled;
			case "weather.autoFetchOnCreate":
				return settings.weather.autoFetchOnCreate;
			case "weather.unit":
				return settings.weather.unit;
			default:
				if (key.startsWith("prop.")) {
					const propKey = key.slice(5) as keyof PropertyMapping;
					return settings.propertyMapping[propKey];
				}
				return undefined;
		}
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings;
		const profile = this.getActiveProfile();
		let needsRebuild = false;
		let needsRefreshViews = true;
		let needsTabUpdate = false;

		switch (key) {
			case "uiLanguage": {
				const pref: UiLanguagePreference =
					value === "de" || value === "en" ? value : "auto";
				settings.uiLanguage = pref;
				needsTabUpdate = true;
				break;
			}
			case "profile.autoSync":
				profile.autoSyncDailyNotesConfig = Boolean(value);
				needsRebuild = true;
				needsTabUpdate = true;
				break;
			case "profile.folder":
				profile.folder = typeof value === "string" ? value.trim() : "";
				needsRebuild = true;
				break;
			case "profile.dateFormat":
				profile.dateFormat =
					typeof value === "string" && value.trim() ? value.trim() : "YYYY-MM-DD";
				needsRebuild = true;
				break;
			case "profile.templatePath":
				profile.templatePath = typeof value === "string" ? value.trim() : "";
				needsRefreshViews = false;
				break;
			case "profile.includeSubfolders":
				profile.includeSubfolders = Boolean(value);
				needsRebuild = true;
				break;
			case "layoutMode":
				if (value === "feed" || value === "timeline" || value === "book") {
					settings.layoutMode = value;
				}
				break;
			case "theme":
				if (
					value === "native" ||
					value === "cozy" ||
					value === "minimal" ||
					value === "scrapbook" ||
					value === "editorial" ||
					value === "typewriter"
				) {
					settings.theme = value;
				}
				break;
			case "aggregateInlineImages":
				settings.aggregateInlineImages = Boolean(value);
				break;
			case "hideEmptyNotes":
				settings.hideEmptyNotes = Boolean(value);
				break;
			case "collapseLongEntries":
				settings.collapseLongEntries = Boolean(value);
				break;
			case "collapseAfterHr":
				settings.collapseAfterHr = Boolean(value);
				break;
			case "weather.enabled":
				settings.weather.enabled = Boolean(value);
				needsRefreshViews = false;
				needsTabUpdate = true;
				break;
			case "weather.autoFetchOnCreate":
				settings.weather.autoFetchOnCreate = Boolean(value);
				needsRefreshViews = false;
				break;
			case "weather.unit":
				settings.weather.unit = value === "fahrenheit" ? "fahrenheit" : "celsius";
				needsRefreshViews = false;
				break;
			default:
				if (key.startsWith("prop.")) {
					const propKey = key.slice(5) as keyof PropertyMapping;
					const defaults: PropertyMapping = {
						moodKey: "mood",
						weatherKey: "weather",
						locationKey: "location",
						peopleKey: "people",
						imageKey: "image",
						starredKey: "starred",
						dateKey: "date",
					};
					const strVal = typeof value === "string" ? value.trim() : "";
					settings.propertyMapping[propKey] = strVal || defaults[propKey];
					needsRebuild = true;
				}
				break;
		}

		await this.plugin.saveSettings();
		if (needsRebuild) {
			this.plugin.index.rebuild();
		}
		if (needsRefreshViews) {
			await this.plugin.refreshOpenViews();
		}
		if (needsTabUpdate) {
			this.update();
		}
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const settings = this.plugin.settings;
		const resolvedLang = resolveUiLanguage(settings.uiLanguage);
		const strings = t(resolvedLang);
		const activeProfile = this.getActiveProfile();
		const detected = detectVaultDailyNotesConfig(this.app);
		const detectedHint = detected.source
			? ` (${detected.source}: "${detected.folder || "/"}" · ${detected.dateFormat})`
			: "";

		const layoutOptions: Record<string, string> = {
			feed: strings.layoutNames.feed,
			timeline: strings.layoutNames.timeline,
			book: strings.layoutNames.book,
		};

		const themeOptions: Record<string, string> = {
			native: strings.themeNames.native,
			cozy: strings.themeNames.cozy,
			minimal: strings.themeNames.minimal,
			scrapbook: strings.themeNames.scrapbook,
			editorial: strings.themeNames.editorial,
			typewriter: strings.themeNames.typewriter,
		};

		const coordLabel =
			settings.weather.latitude !== null && settings.weather.longitude !== null
				? ` [${settings.weather.latitude.toFixed(2)}, ${settings.weather.longitude.toFixed(2)}]`
				: "";

		return [
			{
				name: strings.settingsLanguageName,
				desc: strings.settingsLanguageDesc,
				control: {
					type: "dropdown",
					key: "uiLanguage",
					options: {
						auto: strings.settingsLanguageAuto,
						en: "English",
						de: "Deutsch",
					},
				},
			},
			{
				type: "group",
				heading: strings.settingsProfilesHeading,
				items: [
					{
						name: strings.settingsProfileName,
						render: (setting) => {
							if (settings.profiles.length > 1) {
								setting.addDropdown((dd) => {
									for (const p of settings.profiles) {
										dd.addOption(p.id, p.name);
									}
									dd.setValue(activeProfile.id).onChange((val) => {
										void (async () => {
											settings.activeProfileId = val;
											await this.plugin.saveSettings();
											this.plugin.index.rebuild();
											await this.plugin.refreshOpenViews();
											this.update();
										})();
									});
								});
							}

							setting.addText((txt) =>
								txt.setValue(activeProfile.name).onChange((val) => {
									void (async () => {
										activeProfile.name = val.trim() || "Journal";
										await this.plugin.saveSettings();
										await this.plugin.refreshOpenViews();
									})();
								})
							);

							setting.addButton((btn) =>
								btn.setButtonText(strings.settingsAddProfile).onClick(() => {
									void (async () => {
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
										this.update();
									})();
								})
							);

							if (settings.profiles.length > 1) {
								setting.addButton((btn) =>
									btn
										.setDestructive()
										.setButtonText(strings.settingsDeleteProfile)
										.onClick(() => {
											void (async () => {
												settings.profiles = settings.profiles.filter(
													(p) => p.id !== activeProfile.id
												);
												settings.activeProfileId = settings.profiles[0].id;
												await this.plugin.saveSettings();
												this.plugin.index.rebuild();
												await this.plugin.refreshOpenViews();
												this.update();
											})();
										})
								);
							}
						},
					},
					{
						name: strings.settingsAutoSyncDailyNotes,
						desc: `${strings.settingsAutoSyncDailyNotesDesc}${detectedHint}`,
						control: {
							type: "toggle",
							key: "profile.autoSync",
						},
					},
					{
						name: strings.settingsFolder,
						desc: strings.settingsFolderDesc,
						control: {
							type: "folder",
							key: "profile.folder",
							placeholder: detected.folder || "Daily Notes",
							includeRoot: true,
						},
					},
					{
						name: strings.settingsDateFormat,
						desc: strings.settingsDateFormatDesc,
						control: {
							type: "text",
							key: "profile.dateFormat",
							placeholder: "YYYY-MM-DD",
						},
					},
					{
						name: strings.settingsTemplatePath,
						desc: strings.settingsTemplatePathDesc,
						control: {
							type: "file",
							key: "profile.templatePath",
							placeholder: detected.templatePath || "Templates/Daily.md",
							filter: (file: TFile) => file.extension === "md",
						},
					},
					{
						name: strings.settingsIncludeSubfolders,
						control: {
							type: "toggle",
							key: "profile.includeSubfolders",
						},
					},
				],
			},
			{
				type: "group",
				heading: strings.settingsAppearanceHeading,
				items: [
					{
						name: strings.settingsDefaultLayout,
						control: {
							type: "dropdown",
							key: "layoutMode",
							options: layoutOptions,
						},
					},
					{
						name: strings.settingsTheme,
						desc: strings.settingsThemeDesc,
						control: {
							type: "dropdown",
							key: "theme",
							options: themeOptions,
						},
					},
					{
						name: strings.settingsAggregateImages,
						desc: strings.settingsAggregateImagesDesc,
						control: {
							type: "toggle",
							key: "aggregateInlineImages",
						},
					},
					{
						name: strings.settingsHideEmpty,
						desc: strings.settingsHideEmptyDesc,
						control: {
							type: "toggle",
							key: "hideEmptyNotes",
						},
					},
					{
						name: strings.settingsCollapseLong,
						desc: strings.settingsCollapseLongDesc,
						control: {
							type: "toggle",
							key: "collapseLongEntries",
						},
					},
					{
						name: strings.settingsCollapseAfterHr,
						desc: strings.settingsCollapseAfterHrDesc,
						control: {
							type: "toggle",
							key: "collapseAfterHr",
						},
					},
				],
			},
			{
				type: "group",
				heading: strings.settingsWeatherHeading,
				items: [
					{
						name: strings.settingsWeatherEnabled,
						desc: strings.settingsWeatherEnabledDesc,
						control: {
							type: "toggle",
							key: "weather.enabled",
						},
					},
					{
						name: strings.settingsWeatherAutoCreate,
						desc: strings.settingsWeatherAutoCreateDesc,
						visible: () => this.plugin.settings.weather.enabled,
						control: {
							type: "toggle",
							key: "weather.autoFetchOnCreate",
						},
					},
					{
						name: strings.settingsWeatherUnit,
						visible: () => this.plugin.settings.weather.enabled,
						control: {
							type: "dropdown",
							key: "weather.unit",
							options: {
								celsius: "Celsius (°C)",
								fahrenheit: "Fahrenheit (°F)",
							},
						},
					},
					{
						name: strings.settingsWeatherCity,
						desc: `${strings.settingsWeatherCityDesc}${coordLabel}`,
						visible: () => this.plugin.settings.weather.enabled,
						render: (setting, group: SettingGroup) => {
							let cityQuery = settings.weather.locationName || "";
							const candidatesBox = group.listEl.createDiv({
								cls: "journalify-geo-candidates",
							});

							setting.addText((txt) =>
								txt
									.setPlaceholder("Munich / Berlin / New York…")
									.setValue(cityQuery)
									.onChange((v) => {
										cityQuery = v;
									})
							);

							setting.addButton((btn) =>
								btn.setButtonText(strings.settingsWeatherSearchBtn).onClick(() => {
									void (async () => {
										candidatesBox.empty();
										if (!cityQuery.trim()) return;
										try {
											const hits = await searchCityCoordinates(
												cityQuery,
												resolvedLang
											);
											if (hits.length === 0) {
												new Notice("No matching locations found.");
												return;
											}
											for (const hit of hits) {
												const label = [
													hit.name,
													hit.admin1,
													hit.country,
												]
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
														this.update();
													})();
												});
											}
										} catch (err) {
											new Notice(
												`Geocoding error: ${(err as Error).message}`
											);
										}
									})();
								})
							);

							return () => {
								candidatesBox.remove();
							};
						},
					},
				],
			},
			{
				type: "group",
				heading: strings.settingsPropertiesHeading,
				items: [
					{
						name: "Mood property",
						control: { type: "text", key: "prop.moodKey", placeholder: "mood" },
					},
					{
						name: "Weather property",
						control: { type: "text", key: "prop.weatherKey", placeholder: "weather" },
					},
					{
						name: "Location property",
						control: {
							type: "text",
							key: "prop.locationKey",
							placeholder: "location",
						},
					},
					{
						name: "People property",
						control: { type: "text", key: "prop.peopleKey", placeholder: "people" },
					},
					{
						name: "Cover or image property",
						control: { type: "text", key: "prop.imageKey", placeholder: "image" },
					},
					{
						name: "Favorite or starred property",
						control: { type: "text", key: "prop.starredKey", placeholder: "starred" },
					},
					{
						name: "Date fallback property",
						control: { type: "text", key: "prop.dateKey", placeholder: "date" },
					},
				],
			},
			{
				type: "group",
				heading: strings.settingsDayOneHeading,
				items: [
					{
						name: strings.settingsDayOneBtn,
						desc: strings.settingsDayOneDesc,
						render: (setting) => {
							setting.addButton((btn) =>
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
						},
					},
				],
			},
		];
	}
}
