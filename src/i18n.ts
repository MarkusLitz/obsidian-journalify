import { getLanguage } from "obsidian";
import {
	JournalLayoutMode,
	JournalThemeId,
	MoodScore,
	UiLanguage,
	UiLanguagePreference,
} from "./types";

export interface TranslationStrings {
	pluginTitle: string;
	openFeedCommand: string;
	openInspectorCommand: string;
	importDayOneCommand: string;
	createTodayCommand: string;
	searchPlaceholder: string;
	filterButton: string;
	clearFilters: string;
	onlyMedia: string;
	onlyStarred: string;
	allMoods: string;
	allTags: string;
	allLocations: string;
	allPeople: string;
	sortNewest: string;
	sortOldest: string;
	layoutFeed: string;
	layoutTimeline: string;
	layoutBook: string;
	splitSyncTooltip: string;
	toggleInspectorTooltip: string;
	todayCardTitle: string;
	todayCardPlaceholder: string;
	todayCreateButton: string;
	todayDropPhotoHint: string;
	addMood: string;
	addWeather: string;
	addLocation: string;
	addPeople: string;
	fetchWeatherAuto: string;
	fetchingWeather: string;
	weatherNoCoords: string;
	starEntry: string;
	unstarEntry: string;
	editInline: string;
	finishInlineEdit: string;
	openInObsidian: string;
	openInSplit: string;
	showMore: string;
	showLess: string;
	emptyFeedTitle: string;
	emptyFeedSubtitle: string;
	noFilterMatches: string;
	inspectorCalendarTab: string;
	inspectorMediaTab: string;
	inspectorOnThisDayTab: string;
	moodTrendTitle: string;
	moodBalanceTitle: string;
	streakLabel: string;
	entriesCountLabel: string;
	mediaGalleryEmpty: string;
	onThisDayTitle: string;
	onThisDayEmpty: string;
	yearsAgo: (years: number) => string;
	morePhotos: (count: number) => string;
	bookPrevSpread: string;
	bookNextSpread: string;
	bookJumpToday: string;
	lightboxClose: string;
	lightboxOpenNote: string;
	locationPlaceholder: string;
	peoplePlaceholder: string;
	applyLabel: string;
	removeLabel: string;
	moodLabels: Record<MoodScore, string>;
	themeNames: Record<JournalThemeId, string>;
	layoutNames: Record<JournalLayoutMode, string>;
	weekdaysShort: [string, string, string, string, string, string, string]; // Mon..Sun
	monthsLong: [
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
	];
	monthsShort: [
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
	];
	// Settings
	settingsLead: string;
	settingsLanguageName: string;
	settingsLanguageDesc: string;
	settingsLanguageAuto: string;
	settingsProfilesHeading: string;
	settingsAddProfile: string;
	settingsDeleteProfile: string;
	settingsProfileName: string;
	settingsAutoSyncDailyNotes: string;
	settingsAutoSyncDailyNotesDesc: string;
	settingsFolder: string;
	settingsFolderDesc: string;
	settingsDateFormat: string;
	settingsDateFormatDesc: string;
	settingsTemplatePath: string;
	settingsTemplatePathDesc: string;
	settingsIncludeSubfolders: string;
	settingsAppearanceHeading: string;
	settingsDefaultLayout: string;
	settingsTheme: string;
	settingsThemeDesc: string;
	settingsAggregateImages: string;
	settingsAggregateImagesDesc: string;
	settingsHideEmpty: string;
	settingsHideEmptyDesc: string;
	settingsCollapseLong: string;
	settingsCollapseLongDesc: string;
	settingsCollapseAfterHr: string;
	settingsCollapseAfterHrDesc: string;
	settingsPropertiesHeading: string;
	settingsPropertiesDesc: string;
	settingsWeatherHeading: string;
	settingsWeatherEnabled: string;
	settingsWeatherEnabledDesc: string;
	settingsWeatherAutoCreate: string;
	settingsWeatherAutoCreateDesc: string;
	settingsWeatherCity: string;
	settingsWeatherCityDesc: string;
	settingsWeatherSearchBtn: string;
	settingsWeatherUnit: string;
	settingsDayOneHeading: string;
	settingsDayOneDesc: string;
	settingsDayOneBtn: string;
	// Day One Modal
	dayOneModalTitle: string;
	dayOneSelectFile: string;
	dayOneMergeSameDay: string;
	dayOneMergeSameDayDesc: string;
	dayOneTargetFolder: string;
	dayOneAttachmentFolder: string;
	dayOneStartImport: string;
	dayOneImporting: string;
	dayOneSuccessSummary: (entries: number, notes: number, media: number, skipped: number) => string;
}

const EN: TranslationStrings = {
	pluginTitle: "Journalify",
	openFeedCommand: "Open diary and feed view",
	openInspectorCommand: "Open calendar and insights in right sidebar",
	importDayOneCommand: "Import from Day One (.zip or .json)",
	createTodayCommand: "Create or open today's journal entry",
	searchPlaceholder: "Search journal entries…",
	filterButton: "Filter",
	clearFilters: "Reset",
	onlyMedia: "With photos or media",
	onlyStarred: "Favorites",
	allMoods: "All moods",
	allTags: "All tags",
	allLocations: "All places",
	allPeople: "All people",
	sortNewest: "Newest first",
	sortOldest: "Oldest first",
	layoutFeed: "Feed",
	layoutTimeline: "Timeline",
	layoutBook: "Book view",
	splitSyncTooltip: "Sync active entry in split Markdown editor",
	toggleInspectorTooltip: "Toggle calendar and insights panel",
	todayCardTitle: "Today",
	todayCardPlaceholder: "Write a thought, add a task (- [ ]), or capture today's moment…",
	todayCreateButton: "Save to today's note",
	todayDropPhotoHint: "Attach photo",
	addMood: "Mood",
	addWeather: "Weather",
	addLocation: "Place",
	addPeople: "People",
	fetchWeatherAuto: "Auto-fetch weather",
	fetchingWeather: "Fetching…",
	weatherNoCoords: "Set your city in Journalify settings first for automatic weather.",
	starEntry: "Mark as favorite",
	unstarEntry: "Remove from favorites",
	editInline: "Edit entry inline",
	finishInlineEdit: "Done",
	openInObsidian: "Open note in editor",
	openInSplit: "Open side by side",
	showMore: "Read more",
	showLess: "Show less",
	emptyFeedTitle: "No journal entries found yet",
	emptyFeedSubtitle:
		"Start writing in today's card above or check your journal folder and date format in settings.",
	noFilterMatches: "No entries match the active search or filters.",
	inspectorCalendarTab: "Calendar",
	inspectorMediaTab: "Media",
	inspectorOnThisDayTab: "On this day",
	moodTrendTitle: "Mood and activity trend",
	moodBalanceTitle: "Mood distribution",
	streakLabel: "day streak",
	entriesCountLabel: "entries",
	mediaGalleryEmpty: "No photos in this period yet.",
	onThisDayTitle: "On this day",
	onThisDayEmpty: "No memories recorded on this calendar date in past years yet.",
	yearsAgo: (y) => (y === 1 ? "1 year ago" : `${y} years ago`),
	morePhotos: (n) => `+${n} photos`,
	bookPrevSpread: "Previous entries",
	bookNextSpread: "Newer entries",
	bookJumpToday: "Latest",
	lightboxClose: "Close",
	lightboxOpenNote: "Jump to entry",
	locationPlaceholder: "e.g. Home, Park, Munich…",
	peoplePlaceholder: "Comma-separated, e.g. Anna, Max…",
	applyLabel: "Save",
	removeLabel: "Clear",
	moodLabels: {
		5: "Radiant",
		4: "Good",
		3: "Calm",
		2: "Low",
		1: "Rough",
	},
	themeNames: {
		native: "Obsidian native (default)",
		cozy: "Warm cozy (natural and soft)",
		minimal: "Clean minimal",
		scrapbook: "Creative retro scrapbook",
		editorial: "Classic editorial magazine",
		typewriter: "Typewriter and field logbook",
	},
	layoutNames: {
		feed: "Card feed",
		timeline: "Vertical timeline",
		book: "Two-page book view",
	},
	weekdaysShort: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
	monthsLong: [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	],
	monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
	settingsLead:
		"Turn your plain Markdown daily notes into an interactive diary feed, timeline, or two-page book view — 100% local, zero proprietary lock-in.",
	settingsLanguageName: "Interface language",
	settingsLanguageDesc: "Language used for UI controls, calendar labels, and commands.",
	settingsLanguageAuto: "Automatic (match Obsidian language)",
	settingsProfilesHeading: "Journal sources and profiles",
	settingsAddProfile: "Add journal profile",
	settingsDeleteProfile: "Delete profile",
	settingsProfileName: "Profile name",
	settingsAutoSyncDailyNotes: "Auto-detect from Daily Notes or Periodic Notes",
	settingsAutoSyncDailyNotesDesc:
		"Automatically inherit folder, date format, and template path from Obsidian's Daily Notes or Periodic Notes plugin.",
	settingsFolder: "Daily notes folder",
	settingsFolderDesc:
		"Vault folder containing your journal notes (e.g. Daily Notes or Logbook). Leave empty for vault root.",
	settingsDateFormat: "Filename or path date format",
	settingsDateFormatDesc:
		"Moment date pattern such as YYYY-MM-DD, YYYY-MM-DD_dddd, or nested YYYY/MM/YYYY-MM-DD.",
	settingsTemplatePath: "Template file path",
	settingsTemplatePathDesc: "Optional Markdown template used when creating a new daily note.",
	settingsIncludeSubfolders: "Include subfolders recursively",
	settingsAppearanceHeading: "Appearance, layouts, and reading flow",
	settingsDefaultLayout: "Default view layout",
	settingsTheme: "Visual theme edition",
	settingsThemeDesc:
		"All themes support both light and dark mode. 'Obsidian native' inherits your active community theme.",
	settingsAggregateImages: "Bundle inline images into card photo gallery",
	settingsAggregateImagesDesc:
		"Collects inline Markdown images into a responsive card gallery with lightbox zoom and hides duplicate inline embeds in the preview.",
	settingsHideEmpty: "Hide empty 0-byte daily notes",
	settingsHideEmptyDesc: "Automatically skip blank daily note files in the feed.",
	settingsCollapseLong: "Fold long entries in feed preview",
	settingsCollapseLongDesc: "Collapses entries exceeding the preview line limit behind a 'Read more' button.",
	settingsCollapseAfterHr: "Fold content below horizontal rule (---)",
	settingsCollapseAfterHrDesc: "Useful if you keep scratchpad or technical notes below a --- divider.",
	settingsPropertiesHeading: "Frontmatter property mapping",
	settingsPropertiesDesc: "Customize YAML frontmatter property names to match your existing vault conventions.",
	settingsWeatherHeading: "Automatic weather (Open-Meteo, no API key required)",
	settingsWeatherEnabled: "Enable Open-Meteo weather lookup",
	settingsWeatherEnabledDesc: "Allows 1-click weather lookup (including historical dates) via Open-Meteo.",
	settingsWeatherAutoCreate: "Auto-fetch weather when creating today's entry",
	settingsWeatherAutoCreateDesc: "Automatically writes today's weather into frontmatter when a new note is created.",
	settingsWeatherCity: "Default location or city",
	settingsWeatherCityDesc: "Search your city to store latitude and longitude locally for weather lookups.",
	settingsWeatherSearchBtn: "Search city",
	settingsWeatherUnit: "Temperature unit",
	settingsDayOneHeading: "Day One migration and import",
	settingsDayOneDesc:
		"Import Day One .zip or Journal.json archives including photos, audio, video, weather, tags, and places.",
	settingsDayOneBtn: "Open Day One importer…",
	dayOneModalTitle: "Import from Day One",
	dayOneSelectFile: "Choose Day One .zip or .json export file",
	dayOneMergeSameDay: "Merge multiple entries on the same calendar day",
	dayOneMergeSameDayDesc:
		"Recommended: combines multiple same-day entries under ## HH:mm headings into one daily note with UUID duplicate protection.",
	dayOneTargetFolder: "Target journal folder",
	dayOneAttachmentFolder: "Target attachments folder",
	dayOneStartImport: "Import archive",
	dayOneImporting: "Importing entries and media…",
	dayOneSuccessSummary: (entries, notes, media, skipped) =>
		`Imported ${entries} entries into ${notes} notes (${media} media files extracted, ${skipped} duplicates skipped).`,
};

const DE: TranslationStrings = {
	pluginTitle: "Journalify",
	openFeedCommand: "Tagebuch- und Feed-Ansicht öffnen",
	openInspectorCommand: "Kalender und Analysen in rechter Seitenleiste öffnen",
	importDayOneCommand: "Aus Day One importieren (.zip oder .json)",
	createTodayCommand: "Heutigen Tagebucheintrag erstellen oder öffnen",
	searchPlaceholder: "Tagebuch durchsuchen…",
	filterButton: "Filter",
	clearFilters: "Zurücksetzen",
	onlyMedia: "Nur mit Fotos/Medien",
	onlyStarred: "Favoriten",
	allMoods: "Alle Stimmungen",
	allTags: "Alle Tags",
	allLocations: "Alle Orte",
	allPeople: "Alle Personen",
	sortNewest: "Neueste zuerst",
	sortOldest: "Älteste zuerst",
	layoutFeed: "Feed",
	layoutTimeline: "Chronik",
	layoutBook: "Buch-Ansicht",
	splitSyncTooltip: "Aktiven Eintrag synchron im Split-Editor öffnen",
	toggleInspectorTooltip: "Kalender- und Analyse-Panel ein-/ausblenden",
	todayCardTitle: "Heute",
	todayCardPlaceholder: "Gedanken festhalten, Aufgabe (- [ ]) notieren oder den Moment speichern…",
	todayCreateButton: "In heutiger Notiz speichern",
	todayDropPhotoHint: "Foto anhängen",
	addMood: "Stimmung",
	addWeather: "Wetter",
	addLocation: "Ort",
	addPeople: "Personen",
	fetchWeatherAuto: "Wetter automatisch laden",
	fetchingWeather: "Lade…",
	weatherNoCoords: "Bitte hinterlege zuerst deinen Ort in den Journalify-Einstellungen.",
	starEntry: "Als Favorit markieren",
	unstarEntry: "Aus Favoriten entfernen",
	editInline: "Direkt bearbeiten",
	finishInlineEdit: "Fertig",
	openInObsidian: "Im Editor öffnen",
	openInSplit: "Nebeneinander öffnen",
	showMore: "Mehr anzeigen",
	showLess: "Weniger anzeigen",
	emptyFeedTitle: "Noch keine Tagebucheinträge gefunden",
	emptyFeedSubtitle: "Schreibe direkt oben in die Heute-Karte oder prüfe Ordner und Datumsformat in den Einstellungen.",
	noFilterMatches: "Keine Einträge entsprechen der aktuellen Suche oder Filterauswahl.",
	inspectorCalendarTab: "Kalender",
	inspectorMediaTab: "Medien",
	inspectorOnThisDayTab: "An diesem Tag",
	moodTrendTitle: "Stimmungs- und Aktivitäts-Verlauf",
	moodBalanceTitle: "Stimmungs-Verteilung",
	streakLabel: "Tage in Folge",
	entriesCountLabel: "Einträge",
	mediaGalleryEmpty: "Noch keine Fotos in diesem Zeitraum.",
	onThisDayTitle: "An diesem Tag",
	onThisDayEmpty: "An diesem Kalendertag gibt es noch keine Einträge aus vergangenen Jahren.",
	yearsAgo: (y) => (y === 1 ? "Vor 1 Jahr" : `Vor ${y} Jahren`),
	morePhotos: (n) => `+${n} Fotos`,
	bookPrevSpread: "Ältere Einträge",
	bookNextSpread: "Neuere Einträge",
	bookJumpToday: "Aktuell",
	lightboxClose: "Schließen",
	lightboxOpenNote: "Zum Eintrag springen",
	locationPlaceholder: "z. B. Zuhause, Stadtpark, München…",
	peoplePlaceholder: "Kommagetrennt, z. B. Anna, Max…",
	applyLabel: "Speichern",
	removeLabel: "Entfernen",
	moodLabels: {
		5: "Großartig",
		4: "Gut",
		3: "Ausgeglichen",
		2: "Gedämpft",
		1: "Schwierig",
	},
	themeNames: {
		native: "Obsidian Native (Standard)",
		cozy: "Sanft und Natürlich (Warm Cozy)",
		minimal: "Minimalistisch und Klar",
		scrapbook: "Kreatives Retro-Scrapbook",
		editorial: "Klassisches Magazin (Editorial)",
		typewriter: "Typewriter und Logbook",
	},
	layoutNames: {
		feed: "Karten-Feed",
		timeline: "Vertikale Chronik",
		book: "Zweiseitige Buch-Ansicht",
	},
	weekdaysShort: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
	monthsLong: [
		"Januar",
		"Februar",
		"März",
		"April",
		"Mai",
		"Juni",
		"Juli",
		"August",
		"September",
		"Oktober",
		"November",
		"Dezember",
	],
	monthsShort: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
	settingsLead:
		"Verwandelt reguläre Markdown-Tagesnotizen in einen interaktiven Tagebuch-Feed, eine Chronik oder eine Buch-Ansicht – 100 % lokal ohne eigenes Dateiformat.",
	settingsLanguageName: "Sprache / Language",
	settingsLanguageDesc: "Sprache für Oberfläche, Kalender und Befehle.",
	settingsLanguageAuto: "Automatisch (Obsidian-Sprache übernehmen)",
	settingsProfilesHeading: "Tagebuch-Quellen und Profile",
	settingsAddProfile: "Profil hinzufügen",
	settingsDeleteProfile: "Profil löschen",
	settingsProfileName: "Profilname",
	settingsAutoSyncDailyNotes: "Automatisch aus Daily Notes oder Periodic Notes übernehmen",
	settingsAutoSyncDailyNotesDesc:
		"Übernimmt Ordner, Datumsformat und Vorlage automatisch aus Obsidians Daily-Notes- oder Periodic-Notes-Plugin.",
	settingsFolder: "Ordner für tägliche Notizen",
	settingsFolderDesc:
		"Ordner mit deinen Tagebucheinträgen (z. B. Daily Notes oder Logbook). Leer lassen für Vault-Wurzel.",
	settingsDateFormat: "Dateinamens- oder Pfad-Format",
	settingsDateFormatDesc:
		"Moment-Muster wie YYYY-MM-DD, YYYY-MM-DD_dddd oder verschachtelt YYYY/MM/YYYY-MM-DD.",
	settingsTemplatePath: "Vorlagen-Pfad (Template)",
	settingsTemplatePathDesc: "Optionale Markdown-Vorlage für neu angelegte Tagesnotizen.",
	settingsIncludeSubfolders: "Unterordner rekursiv einbeziehen",
	settingsAppearanceHeading: "Darstellung, Layouts und Lesefluss",
	settingsDefaultLayout: "Standard-Layout",
	settingsTheme: "Visuelles Theme / Stil",
	settingsThemeDesc:
		"Alle Stile unterstützen Light & Dark Mode. 'Obsidian Native' übernimmt dein aktives Obsidian-Theme.",
	settingsAggregateImages: "Inline-Bilder automatisch zur Karten-Galerie bündeln",
	settingsAggregateImagesDesc:
		"Zieht Bilder aus dem Text in eine Galerie mit Lightbox-Zoom und blendet doppelte Inline-Bilder in der Vorschau aus.",
	settingsHideEmpty: "Leere 0-Byte-Notizen ausblenden",
	settingsHideEmptyDesc: "Überspringt komplett leere Tagesnotizen automatisch im Feed.",
	settingsCollapseLong: "Lange Einträge im Feed einklappen",
	settingsCollapseLongDesc: "Klappt lange Texte ab dem Zeilenlimit mit einem 'Mehr anzeigen'-Button ein.",
	settingsCollapseAfterHr: "Inhalte unterhalb von Trennlinien (---) einklappen",
	settingsCollapseAfterHrDesc: "Praktisch für angehängte Arbeits- oder Technik-Notizen unterhalb einer --- Linie.",
	settingsPropertiesHeading: "Frontmatter-Feldnamen (Property-Mapping)",
	settingsPropertiesDesc: "Passe die YAML-Eigenschaftsnamen flexibel an bestehende Konventionen deines Vaults an.",
	settingsWeatherHeading: "Automatisches Wetter (Open-Meteo, ohne API-Key)",
	settingsWeatherEnabled: "Open-Meteo Wetter-Abruf aktivieren",
	settingsWeatherEnabledDesc: "Ermöglicht den 1-Klick-Wetterabruf (auch rückwirkend für vergangene Tage).",
	settingsWeatherAutoCreate: "Wetter beim Erstellen des heutigen Eintrags automatisch eintragen",
	settingsWeatherAutoCreateDesc: "Schreibt das aktuelle Wetter beim Anlegen der heutigen Notiz direkt ins Frontmatter.",
	settingsWeatherCity: "Standardort oder Stadt",
	settingsWeatherCityDesc: "Suche deine Stadt, um Breiten- und Längengrad lokal für den Wetterabruf zu speichern.",
	settingsWeatherSearchBtn: "Stadt suchen",
	settingsWeatherUnit: "Temperatureinheit",
	settingsDayOneHeading: "Day-One-Import und Migration",
	settingsDayOneDesc:
		"Importiert Day-One .zip- oder Journal.json-Exporte inklusive Fotos, Audios, Videos, Wetter, Orten und Tags.",
	settingsDayOneBtn: "Day-One-Importer öffnen…",
	dayOneModalTitle: "Aus Day One importieren",
	dayOneSelectFile: "Day-One .zip- oder .json-Datei auswählen",
	dayOneMergeSameDay: "Mehrere Einträge desselben Kalendertags zusammenführen",
	dayOneMergeSameDayDesc:
		"Empfohlen: Bündelt mehrere Tages-Einträge unter ## HH:mm Abschnitten in einer Daily Note (mit UUID-Duplikatschutz).",
	dayOneTargetFolder: "Zielordner für Tagebuchnotizen",
	dayOneAttachmentFolder: "Zielordner für Medien / Attachments",
	dayOneStartImport: "Import starten",
	dayOneImporting: "Importiere Einträge und Medien…",
	dayOneSuccessSummary: (entries, notes, media, skipped) =>
		`${entries} Einträge in ${notes} Notizen importiert (${media} Mediendateien entpackt, ${skipped} Duplikate übersprungen).`,
};

export function resolveUiLanguage(pref: UiLanguagePreference): UiLanguage {
	if (pref === "de") return "de";
	if (pref === "en") return "en";
	try {
		const obsidianLang = typeof getLanguage === "function" ? getLanguage() : "";
		if (obsidianLang && obsidianLang.toLowerCase().startsWith("de")) {
			return "de";
		}
	} catch {
		// Fall back to English
	}
	return "en";
}

export function t(pref: UiLanguagePreference): TranslationStrings {
	return resolveUiLanguage(pref) === "de" ? DE : EN;
}

const WEEKDAYS_LONG_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_LONG_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export function formatLongHeadingDate(
	year: number,
	month: number,
	day: number,
	pref: UiLanguagePreference
): string {
	const lang = resolveUiLanguage(pref);
	const dt = new Date(year, month - 1, day, 12, 0, 0);
	const wdIndex = dt.getDay();
	const strings = t(lang);
	const monthName = strings.monthsLong[month - 1] ?? "";
	if (lang === "de") {
		return `${WEEKDAYS_LONG_DE[wdIndex]}, ${day}. ${monthName} ${year}`;
	}
	return `${WEEKDAYS_LONG_EN[wdIndex]}, ${monthName} ${day}, ${year}`;
}

export function getShortWeekdayForDate(
	year: number,
	month: number,
	day: number,
	pref: UiLanguagePreference
): string {
	const dt = new Date(year, month - 1, day, 12, 0, 0);
	const monZero = (dt.getDay() + 6) % 7;
	return t(pref).weekdaysShort[monZero];
}
