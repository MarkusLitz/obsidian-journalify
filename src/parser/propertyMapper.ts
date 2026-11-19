import { MoodScore, NormalizedMood, PropertyMapping } from "../types";

export interface MoodPresetOption {
	emoji: string;
	score: MoodScore;
	labelEn: string;
	labelDe: string;
}

export const MOOD_PRESETS: MoodPresetOption[] = [
	{ emoji: "🤩", score: 5, labelEn: "Radiant", labelDe: "Begeistert" },
	{ emoji: "😊", score: 4, labelEn: "Happy", labelDe: "Glücklich" },
	{ emoji: "😌", score: 3, labelEn: "Calm", labelDe: "Ausgeglichen" },
	{ emoji: "😐", score: 3, labelEn: "Neutral", labelDe: "Neutral" },
	{ emoji: "😴", score: 2, labelEn: "Tired", labelDe: "Müde" },
	{ emoji: "😕", score: 2, labelEn: "Low", labelDe: "Gedämpft" },
	{ emoji: "😢", score: 1, labelEn: "Sad", labelDe: "Traurig" },
	{ emoji: "😤", score: 1, labelEn: "Stressed", labelDe: "Gestresst" },
];

export const WEATHER_PRESETS: Array<{ emoji: string; labelEn: string; labelDe: string }> = [
	{ emoji: "☀️", labelEn: "Sunny", labelDe: "Sonnig" },
	{ emoji: "⛅", labelEn: "Partly cloudy", labelDe: "Heiter bis wolkig" },
	{ emoji: "☁️", labelEn: "Cloudy", labelDe: "Bewölkt" },
	{ emoji: "🌧️", labelEn: "Rainy", labelDe: "Regnerisch" },
	{ emoji: "⛈️", labelEn: "Stormy", labelDe: "Gewitter" },
	{ emoji: "❄️", labelEn: "Snowy", labelDe: "Schnee" },
	{ emoji: "🌫️", labelEn: "Foggy", labelDe: "Neblig" },
];

const EMOJI_SCORE_MAP: Record<string, MoodScore> = {
	"🤩": 5,
	"🥳": 5,
	"😍": 5,
	"🥰": 5,
	"😄": 5,
	"😁": 5,
	"✨": 5,
	"🔥": 5,
	"❤️": 5,
	"😊": 4,
	"🙂": 4,
	"😀": 4,
	"😎": 4,
	"💪": 4,
	"☀️": 4,
	"😌": 3,
	"😐": 3,
	"🤔": 3,
	"🧘": 3,
	"🍵": 3,
	"😴": 2,
	"🥱": 2,
	"😕": 2,
	"🙁": 2,
	"😔": 2,
	"🌧️": 2,
	"😢": 1,
	"😭": 1,
	"😡": 1,
	"😤": 1,
	"😫": 1,
	"🤒": 1,
	"💔": 1,
};

const WORD_SCORE_RULES: Array<{ pattern: RegExp; score: MoodScore; emoji: string }> = [
	{
		pattern: /\b(radiant|amazing|awesome|fantastic|great|ecstatic|excited|begeistert|fantastisch|großartig|grossartig|super|wunderbar|energiegeladen|inspiriert)\b/i,
		score: 5,
		emoji: "🤩",
	},
	{
		pattern: /\b(happy|good|joyful|grateful|productive|glücklich|gluecklich|gut|froh|zufrieden|dankbar|produktiv|motiviert)\b/i,
		score: 4,
		emoji: "😊",
	},
	{
		pattern: /\b(calm|relaxed|peaceful|okay|ok|neutral|fine|balanced|ruhig|entspannt|ausgeglichen|normal|gelassen)\b/i,
		score: 3,
		emoji: "😌",
	},
	{
		pattern: /\b(tired|exhausted|low|meh|melancholic|bored|müde|muede|erschöpft|erschoepft|gedämpft|gedaempft|antriebslos)\b/i,
		score: 2,
		emoji: "😴",
	},
	{
		pattern: /\b(sad|angry|stressed|anxious|bad|awful|rough|sick|traurig|gestresst|wütend|wuetend|schlecht|krank|überfordert|ueberfordert)\b/i,
		score: 1,
		emoji: "😢",
	},
];

const SCORE_DEFAULT_EMOJI: Record<MoodScore, string> = {
	5: "🤩",
	4: "😊",
	3: "😌",
	2: "😕",
	1: "😢",
};

export function normalizeMoodValue(rawVal: unknown): NormalizedMood | null {
	if (rawVal === null || rawVal === undefined) return null;

	if (typeof rawVal === "number" && !isNaN(rawVal)) {
		let score: MoodScore;
		if (rawVal <= 5) {
			score = Math.max(1, Math.min(5, Math.round(rawVal))) as MoodScore;
		} else {
			score = Math.max(1, Math.min(5, Math.round(rawVal / 2))) as MoodScore;
		}
		const emoji = SCORE_DEFAULT_EMOJI[score];
		return {
			raw: String(rawVal),
			emoji,
			label: `${rawVal}`,
			score,
		};
	}

	const str = String(rawVal).trim();
	if (!str) return null;

	const ratioMatch = /^(\d+(?:\.\d+)?)\s*(?:\/\s*(5|10))?$/.exec(str);
	if (ratioMatch) {
		const num = parseFloat(ratioMatch[1]);
		const denom = ratioMatch[2] ? Number(ratioMatch[2]) : num > 5 ? 10 : 5;
		const normalized = denom === 10 ? num / 2 : num;
		const score = Math.max(1, Math.min(5, Math.round(normalized))) as MoodScore;
		return {
			raw: str,
			emoji: SCORE_DEFAULT_EMOJI[score],
			label: str,
			score,
		};
	}

	let detectedEmoji: string | null = null;
	let detectedScore: MoodScore | null = null;
	for (const [emo, sc] of Object.entries(EMOJI_SCORE_MAP)) {
		if (str.includes(emo)) {
			detectedEmoji = emo;
			detectedScore = sc;
			break;
		}
	}

	if (!detectedEmoji) {
		const genericEmoji = /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/u.exec(str);
		if (genericEmoji) {
			detectedEmoji = genericEmoji[1];
		}
	}

	for (const rule of WORD_SCORE_RULES) {
		if (rule.pattern.test(str)) {
			if (detectedScore === null) detectedScore = rule.score;
			if (!detectedEmoji) detectedEmoji = rule.emoji;
			break;
		}
	}

	const finalScore: MoodScore = detectedScore ?? 4;
	const finalEmoji = detectedEmoji ?? SCORE_DEFAULT_EMOJI[finalScore];
	const strippedLabel = str.replace(finalEmoji, "").trim();

	return {
		raw: str,
		emoji: finalEmoji,
		label: strippedLabel,
		score: finalScore,
	};
}

function getCaseInsensitiveProp(
	frontmatter: Record<string, unknown> | undefined | null,
	keys: string[]
): unknown {
	if (!frontmatter) return undefined;
	for (const k of keys) {
		if (!k) continue;
		if (k in frontmatter && frontmatter[k] !== undefined && frontmatter[k] !== null) {
			return frontmatter[k];
		}
	}
	const lowerLookup = new Map<string, unknown>();
	for (const [fk, fv] of Object.entries(frontmatter)) {
		lowerLookup.set(fk.toLowerCase(), fv);
	}
	for (const k of keys) {
		if (!k) continue;
		const found = lowerLookup.get(k.toLowerCase());
		if (found !== undefined && found !== null) return found;
	}
	return undefined;
}

export function cleanWikiLinkText(val: string): string {
	return val
		.replace(/^\[\[([^\]|]+)\|([^\]]+)\]\]$/, "$2")
		.replace(/^\[\[([^\]]+)\]\]$/, "$1")
		.trim();
}

export function normalizeStringList(raw: unknown): string[] {
	if (raw === null || raw === undefined) return [];
	if (Array.isArray(raw)) {
		return raw
			.map((item) => cleanWikiLinkText(String(item)))
			.filter((s) => s.length > 0);
	}
	const str = String(raw).trim();
	if (!str) return [];
	return str
		.split(/[,;]+/)
		.map((part) => cleanWikiLinkText(part))
		.filter((s) => s.length > 0);
}

export interface MappedEntryProperties {
	mood: NormalizedMood | null;
	weather: string | null;
	locations: string[];
	people: string[];
	frontmatterImages: string[];
	starred: boolean;
	rawDate: unknown;
}

export function extractMappedProperties(
	frontmatter: Record<string, unknown> | undefined | null,
	mapping: PropertyMapping
): MappedEntryProperties {
	if (!frontmatter) {
		return {
			mood: null,
			weather: null,
			locations: [],
			people: [],
			frontmatterImages: [],
			starred: false,
			rawDate: undefined,
		};
	}

	const rawMood = getCaseInsensitiveProp(frontmatter, [mapping.moodKey, "mood", "stimmung", "feeling"]);
	const rawWeather = getCaseInsensitiveProp(frontmatter, [mapping.weatherKey, "weather", "wetter"]);
	const rawLocation = getCaseInsensitiveProp(frontmatter, [mapping.locationKey, "location", "place", "ort"]);
	const rawPeople = getCaseInsensitiveProp(frontmatter, [mapping.peopleKey, "people", "with", "personen"]);
	const rawImage = getCaseInsensitiveProp(frontmatter, [
		mapping.imageKey,
		"image",
		"images",
		"cover",
		"banner",
		"photo",
	]);
	const rawStarred = getCaseInsensitiveProp(frontmatter, [
		mapping.starredKey,
		"starred",
		"favorite",
		"favourite",
		"favorit",
	]);
	const rawDate = getCaseInsensitiveProp(frontmatter, [mapping.dateKey, "date", "created"]);

	const weatherStr =
		rawWeather !== undefined && rawWeather !== null && String(rawWeather).trim() !== ""
			? String(rawWeather).trim()
			: null;

	const frontmatterImages = normalizeStringList(rawImage).map((img) =>
		img.replace(/^!\[\[([^\]]+)\]\]$/, "$1").split("|")[0].trim()
	);

	const starred =
		rawStarred === true ||
		String(rawStarred).toLowerCase() === "true" ||
		rawStarred === 1 ||
		String(rawStarred) === "⭐";

	return {
		mood: normalizeMoodValue(rawMood),
		weather: weatherStr,
		locations: normalizeStringList(rawLocation),
		people: normalizeStringList(rawPeople),
		frontmatterImages,
		starred,
		rawDate,
	};
}
