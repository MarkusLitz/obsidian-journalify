import { App, TFile, TFolder, normalizePath } from "obsidian";
import { JournalProfile, UiLanguage } from "../types";
import { formatDateWithPattern, pad2 } from "../parser/dateUtils";

export interface DetectedDailyNotesConfig {
	source: "periodic-notes" | "daily-notes" | null;
	folder: string;
	dateFormat: string;
	templatePath: string;
}

interface InternalAppWithPlugins extends App {
	internalPlugins?: {
		getPluginById?: (id: string) => {
			enabled?: boolean;
			instance?: {
				options?: {
					folder?: string;
					format?: string;
					template?: string;
				};
			};
		} | null;
	};
	plugins?: {
		getPlugin?: (id: string) => {
			settings?: {
				daily?: {
					enabled?: boolean;
					folder?: string;
					format?: string;
					template?: string;
				};
			};
		} | null;
	};
}

export function detectVaultDailyNotesConfig(app: App): DetectedDailyNotesConfig {
	const extApp = app as InternalAppWithPlugins;

	try {
		const periodic = extApp.plugins?.getPlugin?.("periodic-notes");
		const daily = periodic?.settings?.daily;
		if (daily && daily.enabled !== false && (daily.folder !== undefined || daily.format !== undefined)) {
			return {
				source: "periodic-notes",
				folder: normalizeFolder(daily.folder || ""),
				dateFormat: (daily.format || "YYYY-MM-DD").trim() || "YYYY-MM-DD",
				templatePath: normalizeOptionalPath(daily.template || ""),
			};
		}
	} catch {
		// Ignore and fall back to core Daily Notes
	}

	try {
		const coreDaily = extApp.internalPlugins?.getPluginById?.("daily-notes");
		const opts = coreDaily?.instance?.options;
		if (coreDaily?.enabled !== false && opts) {
			return {
				source: "daily-notes",
				folder: normalizeFolder(opts.folder || ""),
				dateFormat: (opts.format || "YYYY-MM-DD").trim() || "YYYY-MM-DD",
				templatePath: normalizeOptionalPath(opts.template || ""),
			};
		}
	} catch {
		// Ignore
	}

	return {
		source: null,
		folder: "",
		dateFormat: "YYYY-MM-DD",
		templatePath: "",
	};
}

export function normalizeFolder(folder: string): string {
	const trimmed = folder.trim().replace(/^\/+|\/+$/g, "");
	return trimmed ? normalizePath(trimmed) : "";
}

function normalizeOptionalPath(p: string): string {
	const trimmed = p.trim().replace(/^\/+|\/+$/g, "");
	return trimmed ? normalizePath(trimmed) : "";
}

export interface EffectiveJournalSource {
	folder: string;
	dateFormat: string;
	templatePath: string;
	includeSubfolders: boolean;
}

export function resolveEffectiveProfileSource(
	app: App,
	profile: JournalProfile
): EffectiveJournalSource {
	if (profile.autoSyncDailyNotesConfig) {
		const detected = detectVaultDailyNotesConfig(app);
		if (detected.source !== null) {
			return {
				folder: profile.folder.trim() ? normalizeFolder(profile.folder) : detected.folder,
				dateFormat:
					profile.dateFormat.trim() && profile.dateFormat !== "YYYY-MM-DD"
						? profile.dateFormat.trim()
						: detected.dateFormat,
				templatePath: profile.templatePath.trim()
					? normalizeOptionalPath(profile.templatePath)
					: detected.templatePath,
				includeSubfolders: profile.includeSubfolders,
			};
		}
	}

	return {
		folder: normalizeFolder(profile.folder),
		dateFormat: (profile.dateFormat || "YYYY-MM-DD").trim() || "YYYY-MM-DD",
		templatePath: normalizeOptionalPath(profile.templatePath),
		includeSubfolders: profile.includeSubfolders,
	};
}

export function matchFileToSourceFolder(
	filePath: string,
	folder: string,
	includeSubfolders: boolean
): string | null {
	if (!filePath.toLowerCase().endsWith(".md")) return null;

	const cleanFolder = folder.replace(/^\/+|\/+$/g, "");
	let relativeWithExt: string;

	if (!cleanFolder) {
		relativeWithExt = filePath;
	} else {
		const prefix = `${cleanFolder}/`;
		if (!filePath.startsWith(prefix)) return null;
		relativeWithExt = filePath.slice(prefix.length);
	}

	if (!includeSubfolders && relativeWithExt.includes("/")) {
		return null;
	}

	return relativeWithExt.slice(0, -3);
}

export function expandTemplateVariables(
	templateContent: string,
	targetDate: Date,
	noteTitle: string,
	lang: UiLanguage = "en"
): string {
	return templateContent
		.replace(/\{\{\s*title\s*\}\}/gi, noteTitle)
		.replace(/\{\{\s*date(?::([^}]+))?\s*\}\}/gi, (_m, fmt?: string) =>
			formatDateWithPattern(targetDate, fmt ? fmt.trim() : "YYYY-MM-DD", lang)
		)
		.replace(/\{\{\s*time(?::([^}]+))?\s*\}\}/gi, (_m, fmt?: string) =>
			fmt
				? formatDateWithPattern(targetDate, fmt.trim(), lang)
				: `${pad2(targetDate.getHours())}:${pad2(targetDate.getMinutes())}`
		);
}

export async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const clean = normalizeFolder(folderPath);
	if (!clean) return;
	const parts = clean.split("/");
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		const existing = app.vault.getAbstractFileByPath(current);
		if (!existing) {
			await app.vault.createFolder(current);
		} else if (!(existing instanceof TFolder)) {
			throw new Error(`Path "${current}" already exists as a file.`);
		}
	}
}

async function readOptionalTemplate(app: App, templatePath: string): Promise<string> {
	if (!templatePath) return "";
	const candidates = [templatePath, `${templatePath}.md`];
	for (const candidate of candidates) {
		const normalized = normalizePath(candidate);
		const abstract = app.vault.getAbstractFileByPath(normalized);
		if (abstract instanceof TFile) {
			return await app.vault.cachedRead(abstract);
		}
	}
	return "";
}

export async function getOrCreateDailyNoteForDate(
	app: App,
	source: EffectiveJournalSource,
	targetDate: Date,
	lang: UiLanguage,
	initialBodyAppend = ""
): Promise<{ file: TFile; created: boolean }> {
	const relativeWithoutExt = formatDateWithPattern(targetDate, source.dateFormat, lang);
	const fullPath = normalizePath(
		source.folder ? `${source.folder}/${relativeWithoutExt}.md` : `${relativeWithoutExt}.md`
	);

	const existing = app.vault.getAbstractFileByPath(fullPath);
	if (existing instanceof TFile) {
		if (initialBodyAppend.trim()) {
			await app.vault.process(existing, (cur) => {
				const sep = cur.length > 0 && !cur.endsWith("\n") ? "\n\n" : cur.length > 0 ? "\n" : "";
				return `${cur}${sep}${initialBodyAppend.trim()}\n`;
			});
		}
		return { file: existing, created: false };
	}

	const slashIdx = fullPath.lastIndexOf("/");
	if (slashIdx !== -1) {
		await ensureFolderExists(app, fullPath.slice(0, slashIdx));
	}

	const basename = (slashIdx === -1 ? fullPath : fullPath.slice(slashIdx + 1)).replace(/\.md$/i, "");
	const rawTemplate = await readOptionalTemplate(app, source.templatePath);
	let initialContent = rawTemplate
		? expandTemplateVariables(rawTemplate, targetDate, basename, lang)
		: "";

	if (initialBodyAppend.trim()) {
		const sep =
			initialContent.length > 0 && !initialContent.endsWith("\n")
				? "\n\n"
				: initialContent.length > 0
				? "\n"
				: "";
		initialContent = `${initialContent}${sep}${initialBodyAppend.trim()}\n`;
	}

	const createdFile = await app.vault.create(fullPath, initialContent);
	return { file: createdFile, created: true };
}
