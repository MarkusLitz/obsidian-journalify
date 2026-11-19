export type UiLanguage = "en" | "de";
export type UiLanguagePreference = "auto" | UiLanguage;
export type JournalLayoutMode = "feed" | "timeline" | "book";
export type JournalThemeId =
	| "native"
	| "cozy"
	| "minimal"
	| "scrapbook"
	| "editorial"
	| "typewriter";
export type SortOrder = "desc" | "asc";
export type TemperatureUnit = "celsius" | "fahrenheit";
export type MoodScore = 1 | 2 | 3 | 4 | 5;
export type MediaKind = "image" | "audio" | "video";

export interface JournalProfile {
	id: string;
	name: string;
	folder: string;
	dateFormat: string;
	templatePath: string;
	includeSubfolders: boolean;
	autoSyncDailyNotesConfig: boolean;
}

export interface PropertyMapping {
	moodKey: string;
	weatherKey: string;
	locationKey: string;
	peopleKey: string;
	imageKey: string;
	starredKey: string;
	dateKey: string;
}

export interface WeatherSettings {
	enabled: boolean;
	autoFetchOnCreate: boolean;
	locationName: string;
	latitude: number | null;
	longitude: number | null;
	unit: TemperatureUnit;
}

export interface JournalifySettings {
	uiLanguage: UiLanguagePreference;
	activeProfileId: string;
	profiles: JournalProfile[];
	layoutMode: JournalLayoutMode;
	theme: JournalThemeId;
	sortOrder: SortOrder;
	showInspectorInView: boolean;
	inspectorActiveTab: "calendar" | "media" | "onThisDay";
	aggregateInlineImages: boolean;
	hideEmptyNotes: boolean;
	collapseLongEntries: boolean;
	collapseMaxLines: number;
	collapseAfterHr: boolean;
	useDateFrontmatterFallback: boolean;
	liveSplitSync: boolean;
	propertyMapping: PropertyMapping;
	weather: WeatherSettings;
}

export interface NormalizedMood {
	raw: string;
	emoji: string;
	label: string;
	score: MoodScore;
}

export interface ExtractedMediaItem {
	kind: MediaKind;
	src: string;
	isExternal: boolean;
	alt: string;
	fromFrontmatter: boolean;
	rawHtmlSrc?: string;
}

export interface JournalEntryIndexItem {
	filePath: string;
	basename: string;
	dateKey: string; // YYYY-MM-DD
	monthDay: string; // MM-DD
	yearMonth: string; // YYYY-MM
	year: number;
	month: number; // 1..12
	day: number; // 1..31
	timestamp: number;
	timeLabel: string | null;
	size: number;
	mtime: number;
	mood: NormalizedMood | null;
	weather: string | null;
	locations: string[];
	people: string[];
	tags: string[];
	starred: boolean;
	frontmatterImages: string[];
	cachedEmbeds: string[];
	hasMedia: boolean;
	taskCount: number;
	completedTaskCount: number;
}

export interface JournalFilterState {
	query: string;
	moodScore: MoodScore | null;
	moodEmoji: string | null;
	tag: string | null;
	location: string | null;
	person: string | null;
	onlyWithMedia: boolean;
	onlyStarred: boolean;
}

export interface GeoLocationCandidate {
	name: string;
	admin1?: string;
	country?: string;
	latitude: number;
	longitude: number;
}

export interface WeatherResult {
	emoji: string;
	temperature: number;
	unitSymbol: string;
	description: string;
	formatted: string;
}

export interface DayOnePhotoMeta {
	identifier: string;
	md5?: string;
	type?: string;
	orderInEntry?: number;
	caption?: string;
}

export interface DayOneAudioMeta {
	identifier: string;
	md5?: string;
	type?: string;
}

export interface DayOneVideoMeta {
	identifier: string;
	md5?: string;
	type?: string;
}

export interface DayOneEntry {
	uuid: string;
	creationDate: string;
	modifiedDate?: string;
	timeZone?: string;
	text?: string;
	starred?: boolean;
	tags?: string[];
	weather?: {
		conditionsDescription?: string;
		temperatureCelsius?: number;
		weatherCode?: string;
	};
	location?: {
		placeName?: string;
		localityName?: string;
		administrativeArea?: string;
		country?: string;
		latitude?: number;
		longitude?: number;
	};
	photos?: DayOnePhotoMeta[];
	audios?: DayOneAudioMeta[];
	videos?: DayOneVideoMeta[];
}

export interface DayOneImportOptions {
	targetFolder: string;
	attachmentFolder: string;
	mergeSameDay: boolean;
	dateFormat: string;
	propertyMapping: PropertyMapping;
}

export interface DayOneImportReport {
	importedEntries: number;
	createdNotes: number;
	updatedNotes: number;
	skippedDuplicates: number;
	extractedAttachments: number;
	errors: string[];
}

export const DEFAULT_PROPERTY_MAPPING: PropertyMapping = {
	moodKey: "mood",
	weatherKey: "weather",
	locationKey: "location",
	peopleKey: "people",
	imageKey: "image",
	starredKey: "starred",
	dateKey: "date",
};

export const DEFAULT_PROFILE: JournalProfile = {
	id: "default",
	name: "Daily Journal",
	folder: "",
	dateFormat: "YYYY-MM-DD",
	templatePath: "",
	includeSubfolders: true,
	autoSyncDailyNotesConfig: true,
};

export const DEFAULT_SETTINGS: JournalifySettings = {
	uiLanguage: "auto",
	activeProfileId: "default",
	profiles: [{ ...DEFAULT_PROFILE }],
	layoutMode: "feed",
	theme: "native",
	sortOrder: "desc",
	showInspectorInView: true,
	inspectorActiveTab: "calendar",
	aggregateInlineImages: true,
	hideEmptyNotes: true,
	collapseLongEntries: true,
	collapseMaxLines: 18,
	collapseAfterHr: true,
	useDateFrontmatterFallback: true,
	liveSplitSync: false,
	propertyMapping: { ...DEFAULT_PROPERTY_MAPPING },
	weather: {
		enabled: true,
		autoFetchOnCreate: false,
		locationName: "",
		latitude: null,
		longitude: null,
		unit: "celsius",
	},
};

export function createEmptyFilterState(): JournalFilterState {
	return {
		query: "",
		moodScore: null,
		moodEmoji: null,
		tag: null,
		location: null,
		person: null,
		onlyWithMedia: false,
		onlyStarred: false,
	};
}
