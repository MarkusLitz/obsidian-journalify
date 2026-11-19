import { App, CachedMetadata, TFile, TFolder } from "obsidian";
import {
	JournalEntryIndexItem,
	JournalFilterState,
	JournalifySettings,
	MoodScore,
	SortOrder,
} from "../types";
import {
	ParsedJournalDate,
	getTodayDateKey,
	pad2,
	parseDateFromRelativePath,
	parseFrontmatterDateValue,
} from "../parser/dateUtils";
import { extractMappedProperties } from "../parser/propertyMapper";
import { classifyMediaTarget } from "../parser/mediaExtractor";
import {
	EffectiveJournalSource,
	matchFileToSourceFolder,
	resolveEffectiveProfileSource,
} from "./sourceResolver";

export interface MonthlySummaryStats {
	year: number;
	month: number;
	totalEntries: number;
	averageMood: number | null;
	moodCounts: Record<MoodScore, number>;
	dailyPoints: Array<{ day: number; dateKey: string; avgScore: number; emoji: string; filePath: string }>;
}

export class JournalIndex {
	private app: App;
	private getSettings: () => JournalifySettings;
	private entriesByPath = new Map<string, JournalEntryIndexItem>();
	private listeners = new Set<() => void>();

	constructor(app: App, getSettings: () => JournalifySettings) {
		this.app = app;
		this.getSettings = getSettings;
	}

	onChange(cb: () => void): () => void {
		this.listeners.add(cb);
		return () => this.listeners.delete(cb);
	}

	private emitChange(): void {
		for (const cb of this.listeners) {
			cb();
		}
	}

	getActiveSource(): EffectiveJournalSource {
		const settings = this.getSettings();
		const active =
			settings.profiles.find((p) => p.id === settings.activeProfileId) || settings.profiles[0];
		return resolveEffectiveProfileSource(this.app, active);
	}

	rebuild(): void {
		this.entriesByPath.clear();
		const source = this.getActiveSource();
		const files = this.collectSourceFiles(source);
		for (const file of files) {
			const item = this.buildIndexItem(file, source);
			if (item) {
				this.entriesByPath.set(file.path, item);
			}
		}
		this.emitChange();
	}

	private collectSourceFiles(source: EffectiveJournalSource): TFile[] {
		const folderPath = source.folder || "/";
		const rootFolder = this.app.vault.getFolderByPath(folderPath);
		if (!rootFolder) {
			return [];
		}

		const files: TFile[] = [];
		const stack: TFolder[] = [rootFolder];
		while (stack.length > 0) {
			const current = stack.pop();
			if (!current) continue;
			for (const child of current.children) {
				if (child instanceof TFile) {
					if (child.extension.toLowerCase() === "md") {
						files.push(child);
					}
				} else if (source.includeSubfolders && child instanceof TFolder) {
					stack.push(child);
				}
			}
		}
		return files;
	}

	updateFile(file: TFile): void {
		const source = this.getActiveSource();
		const item = this.buildIndexItem(file, source);
		if (item) {
			this.entriesByPath.set(file.path, item);
		} else {
			this.entriesByPath.delete(file.path);
		}
		this.emitChange();
	}

	removePath(path: string): void {
		if (this.entriesByPath.delete(path)) {
			this.emitChange();
		}
	}

	renamePath(oldPath: string, file: TFile): void {
		this.entriesByPath.delete(oldPath);
		this.updateFile(file);
	}

	private buildIndexItem(
		file: TFile,
		source: EffectiveJournalSource
	): JournalEntryIndexItem | null {
		const settings = this.getSettings();
		const relativeWithoutExt = matchFileToSourceFolder(
			file.path,
			source.folder,
			source.includeSubfolders
		);
		if (relativeWithoutExt === null) return null;

		const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
		const mapped = extractMappedProperties(cache?.frontmatter, settings.propertyMapping);

		let parsedDate: ParsedJournalDate | null = parseDateFromRelativePath(
			relativeWithoutExt,
			source.dateFormat
		);
		if (!parsedDate && settings.useDateFrontmatterFallback && mapped.rawDate !== undefined) {
			parsedDate = parseFrontmatterDateValue(mapped.rawDate);
		}
		if (!parsedDate) return null;

		const tagSet = new Set<string>();
		if (cache?.tags) {
			for (const t of cache.tags) {
				const clean = t.tag.replace(/^#+/, "").trim();
				if (clean) tagSet.add(clean);
			}
		}
		const fmRecord: Record<string, unknown> | undefined = cache?.frontmatter;
		const fmTags: unknown = fmRecord?.tags ?? fmRecord?.tag;
		if (Array.isArray(fmTags)) {
			for (const rawT of fmTags) {
				const clean = String(rawT).replace(/^#+/, "").trim();
				if (clean) tagSet.add(clean);
			}
		} else if (typeof fmTags === "string") {
			for (const part of fmTags.split(/[,;\s]+/)) {
				const clean = part.replace(/^#+/, "").trim();
				if (clean) tagSet.add(clean);
			}
		}

		const cachedEmbeds: string[] = [];
		if (cache?.embeds) {
			for (const emb of cache.embeds) {
				const kind = classifyMediaTarget(emb.link);
				if (kind === "image" || kind === "audio" || kind === "video") {
					cachedEmbeds.push(emb.link);
				}
			}
		}

		let taskCount = 0;
		let completedTaskCount = 0;
		if (cache?.listItems) {
			for (const li of cache.listItems) {
				if (li.task !== undefined) {
					taskCount++;
					if (li.task.trim().length > 0) completedTaskCount++;
				}
			}
		}

		return {
			filePath: file.path,
			basename: file.basename,
			dateKey: parsedDate.dateKey,
			monthDay: parsedDate.monthDay,
			yearMonth: parsedDate.yearMonth,
			year: parsedDate.year,
			month: parsedDate.month,
			day: parsedDate.day,
			timestamp: parsedDate.timestamp,
			timeLabel: parsedDate.timeLabel,
			size: file.stat.size,
			mtime: file.stat.mtime,
			mood: mapped.mood,
			weather: mapped.weather,
			locations: mapped.locations,
			people: mapped.people,
			tags: Array.from(tagSet),
			starred: mapped.starred,
			frontmatterImages: mapped.frontmatterImages,
			cachedEmbeds,
			hasMedia: mapped.frontmatterImages.length > 0 || cachedEmbeds.length > 0,
			taskCount,
			completedTaskCount,
		};
	}

	getEntryByPath(path: string): JournalEntryIndexItem | undefined {
		return this.entriesByPath.get(path);
	}

	getEntriesForDateKey(dateKey: string): JournalEntryIndexItem[] {
		const list: JournalEntryIndexItem[] = [];
		for (const item of this.entriesByPath.values()) {
			if (item.dateKey === dateKey) list.push(item);
		}
		list.sort((a, b) => b.timestamp - a.timestamp || a.filePath.localeCompare(b.filePath));
		return list;
	}

	getAllEntries(sortOrder: SortOrder = "desc", includeEmpty = false): JournalEntryIndexItem[] {
		const out: JournalEntryIndexItem[] = [];
		for (const item of this.entriesByPath.values()) {
			if (!includeEmpty && item.size === 0) continue;
			out.push(item);
		}
		out.sort((a, b) => {
			const diff = sortOrder === "desc" ? b.timestamp - a.timestamp : a.timestamp - b.timestamp;
			return diff !== 0 ? diff : a.filePath.localeCompare(b.filePath);
		});
		return out;
	}

	async queryEntries(
		filter: JournalFilterState,
		sortOrder: SortOrder,
		hideEmptyNotes: boolean
	): Promise<JournalEntryIndexItem[]> {
		const base = this.getAllEntries(sortOrder, !hideEmptyNotes);
		const q = filter.query.trim().toLowerCase();

		const metaFiltered = base.filter((item) => {
			if (filter.onlyStarred && !item.starred) return false;
			if (filter.onlyWithMedia && !item.hasMedia) return false;
			if (filter.moodScore !== null && item.mood?.score !== filter.moodScore) return false;
			if (filter.moodEmoji !== null && item.mood?.emoji !== filter.moodEmoji) return false;
			if (filter.tag !== null && !item.tags.some((t) => t.toLowerCase() === filter.tag!.toLowerCase())) {
				return false;
			}
			if (
				filter.location !== null &&
				!item.locations.some((l) => l.toLowerCase() === filter.location!.toLowerCase())
			) {
				return false;
			}
			if (
				filter.person !== null &&
				!item.people.some((p) => p.toLowerCase() === filter.person!.toLowerCase())
			) {
				return false;
			}
			return true;
		});

		if (!q) return metaFiltered;

		const results: JournalEntryIndexItem[] = [];
		for (const item of metaFiltered) {
			const metaBlob = [
				item.dateKey,
				item.basename,
				item.mood?.raw ?? "",
				item.weather ?? "",
				...item.tags,
				...item.locations,
				...item.people,
			]
				.join(" ")
				.toLowerCase();

			if (metaBlob.includes(q)) {
				results.push(item);
				continue;
			}

			const abstract = this.app.vault.getAbstractFileByPath(item.filePath);
			if (abstract instanceof TFile) {
				const content = await this.app.vault.cachedRead(abstract);
				if (content.toLowerCase().includes(q)) {
					results.push(item);
				}
			}
		}

		return results;
	}

	getDistinctTags(): string[] {
		const counts = new Map<string, number>();
		for (const item of this.entriesByPath.values()) {
			for (const t of item.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
		}
		return Array.from(counts.entries())
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([k]) => k);
	}

	getDistinctLocations(): string[] {
		const counts = new Map<string, number>();
		for (const item of this.entriesByPath.values()) {
			for (const loc of item.locations) counts.set(loc, (counts.get(loc) ?? 0) + 1);
		}
		return Array.from(counts.entries())
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([k]) => k);
	}

	getDistinctPeople(): string[] {
		const counts = new Map<string, number>();
		for (const item of this.entriesByPath.values()) {
			for (const p of item.people) counts.set(p, (counts.get(p) ?? 0) + 1);
		}
		return Array.from(counts.entries())
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([k]) => k);
	}

	getMonthlySummary(year: number, month: number, hideEmpty = true): MonthlySummaryStats {
		const ym = `${year}-${pad2(month)}`;
		const moodCounts: Record<MoodScore, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
		const byDay = new Map<number, JournalEntryIndexItem[]>();
		let totalEntries = 0;
		let moodSum = 0;
		let moodItems = 0;

		for (const item of this.entriesByPath.values()) {
			if (hideEmpty && item.size === 0) continue;
			if (item.yearMonth !== ym) continue;
			totalEntries++;
			const arr = byDay.get(item.day) ?? [];
			arr.push(item);
			byDay.set(item.day, arr);

			if (item.mood) {
				moodCounts[item.mood.score]++;
				moodSum += item.mood.score;
				moodItems++;
			}
		}

		const dailyPoints: MonthlySummaryStats["dailyPoints"] = [];
		const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);
		for (const day of sortedDays) {
			const dayItems = byDay.get(day)!;
			dayItems.sort((a, b) => b.timestamp - a.timestamp);
			const scored = dayItems.filter((d) => d.mood !== null);
			const avgScore =
				scored.length > 0
					? scored.reduce((acc, cur) => acc + cur.mood!.score, 0) / scored.length
					: 3.5;
			const emoji = scored[0]?.mood?.emoji ?? "";
			dailyPoints.push({
				day,
				dateKey: dayItems[0].dateKey,
				avgScore,
				emoji,
				filePath: dayItems[0].filePath,
			});
		}

		return {
			year,
			month,
			totalEntries,
			averageMood: moodItems > 0 ? moodSum / moodItems : null,
			moodCounts,
			dailyPoints,
		};
	}

	getOnThisDayEntries(referenceDate = new Date(), hideEmpty = true): JournalEntryIndexItem[] {
		const targetMonthDay = `${pad2(referenceDate.getMonth() + 1)}-${pad2(referenceDate.getDate())}`;
		const currentYear = referenceDate.getFullYear();
		const matches: JournalEntryIndexItem[] = [];

		for (const item of this.entriesByPath.values()) {
			if (hideEmpty && item.size === 0) continue;
			if (item.monthDay === targetMonthDay && item.year < currentYear) {
				matches.push(item);
			}
		}

		matches.sort((a, b) => b.year - a.year || b.timestamp - a.timestamp);
		return matches;
	}

	getCurrentStreak(now = new Date(), hideEmpty = true): number {
		const activeDateKeys = new Set<string>();
		for (const item of this.entriesByPath.values()) {
			if (hideEmpty && item.size === 0) continue;
			activeDateKeys.add(item.dateKey);
		}

		const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
		const todayKey = getTodayDateKey(cursor);
		if (!activeDateKeys.has(todayKey)) {
			cursor.setDate(cursor.getDate() - 1);
			if (!activeDateKeys.has(getTodayDateKey(cursor))) {
				return 0;
			}
		}

		let streak = 0;
		while (activeDateKeys.has(getTodayDateKey(cursor))) {
			streak++;
			cursor.setDate(cursor.getDate() - 1);
		}
		return streak;
	}
}
