export interface ParsedJournalDate {
	year: number;
	month: number; // 1..12
	day: number; // 1..31
	hour: number;
	minute: number;
	second: number;
	hasTime: boolean;
	dateKey: string; // YYYY-MM-DD
	monthDay: string; // MM-DD
	yearMonth: string; // YYYY-MM
	timestamp: number;
	timeLabel: string | null;
}

const MONTHS_EN_LONG = [
	"january",
	"february",
	"march",
	"april",
	"may",
	"june",
	"july",
	"august",
	"september",
	"october",
	"november",
	"december",
];
const MONTHS_EN_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTHS_DE_SHORT = ["jan", "feb", "mär", "mrz", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "dez"];

const WEEKDAYS_EN_FORMAT = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_DE_FORMAT = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const WEEKDAYS_EN_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_DE_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS_EN_CAPITAL = [
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
];
const MONTHS_DE_CAPITAL = [
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
];

export function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
	if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
		return false;
	}
	const dt = new Date(year, month - 1, day, 12, 0, 0);
	return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

export function buildParsedDate(
	year: number,
	month: number,
	day: number,
	hour = 12,
	minute = 0,
	second = 0,
	hasTime = false
): ParsedJournalDate | null {
	if (!isValidCalendarDate(year, month, day)) return null;
	const safeHour = Math.max(0, Math.min(23, hour));
	const safeMin = Math.max(0, Math.min(59, minute));
	const safeSec = Math.max(0, Math.min(59, second));
	const dt = new Date(year, month - 1, day, safeHour, safeMin, safeSec);
	const mm = pad2(month);
	const dd = pad2(day);
	return {
		year,
		month,
		day,
		hour: safeHour,
		minute: safeMin,
		second: safeSec,
		hasTime,
		dateKey: `${year}-${mm}-${dd}`,
		monthDay: `${mm}-${dd}`,
		yearMonth: `${year}-${mm}`,
		timestamp: dt.getTime(),
		timeLabel: hasTime ? `${pad2(safeHour)}:${pad2(safeMin)}` : null,
	};
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseMonthName(name: string): number | null {
	const lower = name.toLowerCase();
	const enIdx = MONTHS_EN_LONG.indexOf(lower);
	if (enIdx !== -1) return enIdx + 1;
	const enShort = MONTHS_EN_SHORT.indexOf(lower.slice(0, 3));
	if (enShort !== -1) return enShort + 1;

	const deMap: Record<string, number> = {
		januar: 1,
		februar: 2,
		märz: 3,
		maerz: 3,
		mrz: 3,
		april: 4,
		mai: 5,
		juni: 6,
		juli: 7,
		august: 8,
		september: 9,
		oktober: 10,
		november: 11,
		dezember: 12,
	};
	if (deMap[lower]) return deMap[lower];
	const deShortIdx = MONTHS_DE_SHORT.indexOf(lower.slice(0, 3));
	if (deShortIdx !== -1) {
		if (lower.startsWith("mär") || lower.startsWith("mrz")) return 3;
	}
	return null;
}

interface TokenCapture {
	kind: "YYYY" | "YY" | "MMMM" | "MMM" | "MM" | "M" | "DD" | "D" | "HH" | "mm" | "ss" | "IGNORE";
}

export function parseDateFromRelativePath(
	relativePathWithoutExt: string,
	format: string
): ParsedJournalDate | null {
	const cleanPath = relativePathWithoutExt.replace(/^\/+|\/+$/g, "");
	const cleanFormat = (format || "YYYY-MM-DD").trim().replace(/^\/+|\/+$/g, "");
	if (!cleanPath || !cleanFormat) return null;

	const target = cleanFormat.includes("/")
		? cleanPath
		: cleanPath.split("/").pop() || cleanPath;

	const captures: TokenCapture[] = [];
	let regexStr = "^";
	let i = 0;

	while (i < cleanFormat.length) {
		if (cleanFormat[i] === "[") {
			const closeIdx = cleanFormat.indexOf("]", i + 1);
			if (closeIdx !== -1) {
				regexStr += escapeRegex(cleanFormat.slice(i + 1, closeIdx));
				i = closeIdx + 1;
				continue;
			}
		}

		const rest = cleanFormat.slice(i);
		if (rest.startsWith("YYYY")) {
			captures.push({ kind: "YYYY" });
			regexStr += "(\\d{4})";
			i += 4;
		} else if (rest.startsWith("YY")) {
			captures.push({ kind: "YY" });
			regexStr += "(\\d{2})";
			i += 2;
		} else if (rest.startsWith("MMMM")) {
			captures.push({ kind: "MMMM" });
			regexStr += "([A-Za-zÄÖÜäöüß]+)";
			i += 4;
		} else if (rest.startsWith("MMM")) {
			captures.push({ kind: "MMM" });
			regexStr += "([A-Za-zÄÖÜäöüß]{3,4})";
			i += 3;
		} else if (rest.startsWith("MM")) {
			captures.push({ kind: "MM" });
			regexStr += "(\\d{2})";
			i += 2;
		} else if (rest.startsWith("M")) {
			captures.push({ kind: "M" });
			regexStr += "(\\d{1,2})";
			i += 1;
		} else if (rest.startsWith("dddd") || rest.startsWith("ddd")) {
			const len = rest.startsWith("dddd") ? 4 : 3;
			captures.push({ kind: "IGNORE" });
			regexStr += "([A-Za-zÄÖÜäöüß.]+)";
			i += len;
		} else if (rest.startsWith("DD")) {
			captures.push({ kind: "DD" });
			regexStr += "(\\d{2})";
			i += 2;
		} else if (rest.startsWith("D")) {
			captures.push({ kind: "D" });
			regexStr += "(\\d{1,2})";
			i += 1;
		} else if (rest.startsWith("HH")) {
			captures.push({ kind: "HH" });
			regexStr += "(\\d{2})";
			i += 2;
		} else if (rest.startsWith("mm")) {
			captures.push({ kind: "mm" });
			regexStr += "(\\d{2})";
			i += 2;
		} else if (rest.startsWith("ss")) {
			captures.push({ kind: "ss" });
			regexStr += "(\\d{2})";
			i += 2;
		} else {
			regexStr += escapeRegex(cleanFormat[i]);
			i += 1;
		}
	}

	regexStr += "$";
	const match = new RegExp(regexStr, "i").exec(target);
	if (!match) return null;

	let year: number | null = null;
	let month: number | null = null;
	let day: number | null = null;
	let hour = 12;
	let minute = 0;
	let second = 0;
	let hasTime = false;

	for (let idx = 0; idx < captures.length; idx++) {
		const val = match[idx + 1];
		const kind = captures[idx].kind;
		if (kind === "YYYY") year = Number(val);
		else if (kind === "YY") year = 2000 + Number(val);
		else if (kind === "MM" || kind === "M") month = Number(val);
		else if (kind === "MMMM" || kind === "MMM") month = parseMonthName(val);
		else if (kind === "DD" || kind === "D") day = Number(val);
		else if (kind === "HH") {
			hour = Number(val);
			hasTime = true;
		} else if (kind === "mm") {
			minute = Number(val);
			hasTime = true;
		} else if (kind === "ss") {
			second = Number(val);
			hasTime = true;
		}
	}

	if (year === null || month === null || day === null) return null;
	return buildParsedDate(year, month, day, hour, minute, second, hasTime);
}

export function parseFrontmatterDateValue(raw: unknown): ParsedJournalDate | null {
	if (!raw) return null;
	if (raw instanceof Date && !isNaN(raw.getTime())) {
		const hasTime = raw.getHours() !== 0 || raw.getMinutes() !== 0;
		return buildParsedDate(
			raw.getFullYear(),
			raw.getMonth() + 1,
			raw.getDate(),
			hasTime ? raw.getHours() : 12,
			raw.getMinutes(),
			raw.getSeconds(),
			hasTime
		);
	}
	const str = String(raw).trim();
	const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s_](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(str);
	if (isoMatch) {
		const year = Number(isoMatch[1]);
		const month = Number(isoMatch[2]);
		const day = Number(isoMatch[3]);
		const hasTime = isoMatch[4] !== undefined;
		const hour = hasTime ? Number(isoMatch[4]) : 12;
		const minute = hasTime ? Number(isoMatch[5]) : 0;
		const second = isoMatch[6] !== undefined ? Number(isoMatch[6]) : 0;
		return buildParsedDate(year, month, day, hour, minute, second, hasTime);
	}
	return null;
}

export function formatDateWithPattern(
	date: Date,
	format: string,
	lang: "en" | "de" = "en"
): string {
	const cleanFormat = (format || "YYYY-MM-DD").trim();
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const wd = date.getDay();
	const hour = date.getHours();
	const minute = date.getMinutes();
	const second = date.getSeconds();

	let out = "";
	let i = 0;
	while (i < cleanFormat.length) {
		if (cleanFormat[i] === "[") {
			const closeIdx = cleanFormat.indexOf("]", i + 1);
			if (closeIdx !== -1) {
				out += cleanFormat.slice(i + 1, closeIdx);
				i = closeIdx + 1;
				continue;
			}
		}
		const rest = cleanFormat.slice(i);
		if (rest.startsWith("YYYY")) {
			out += String(year);
			i += 4;
		} else if (rest.startsWith("YY")) {
			out += pad2(year % 100);
			i += 2;
		} else if (rest.startsWith("MMMM")) {
			out += (lang === "de" ? MONTHS_DE_CAPITAL : MONTHS_EN_CAPITAL)[month - 1];
			i += 4;
		} else if (rest.startsWith("MMM")) {
			out += (lang === "de" ? MONTHS_DE_CAPITAL : MONTHS_EN_CAPITAL)[month - 1].slice(0, 3);
			i += 3;
		} else if (rest.startsWith("MM")) {
			out += pad2(month);
			i += 2;
		} else if (rest.startsWith("M")) {
			out += String(month);
			i += 1;
		} else if (rest.startsWith("dddd")) {
			out += (lang === "de" ? WEEKDAYS_DE_FORMAT : WEEKDAYS_EN_FORMAT)[wd];
			i += 4;
		} else if (rest.startsWith("ddd")) {
			out += (lang === "de" ? WEEKDAYS_DE_SHORT : WEEKDAYS_EN_SHORT)[wd];
			i += 3;
		} else if (rest.startsWith("DD")) {
			out += pad2(day);
			i += 2;
		} else if (rest.startsWith("D")) {
			out += String(day);
			i += 1;
		} else if (rest.startsWith("HH")) {
			out += pad2(hour);
			i += 2;
		} else if (rest.startsWith("mm")) {
			out += pad2(minute);
			i += 2;
		} else if (rest.startsWith("ss")) {
			out += pad2(second);
			i += 2;
		} else {
			out += cleanFormat[i];
			i += 1;
		}
	}
	return out;
}

export function getTodayDateKey(now = new Date()): string {
	return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
