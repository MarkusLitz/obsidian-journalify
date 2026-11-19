import { App, TFile, normalizePath } from "obsidian";
import { DayOneEntry, DayOneImportOptions, DayOneImportReport } from "../types";
import { formatDateWithPattern, pad2 } from "../parser/dateUtils";
import { serializeYamlFrontmatter } from "../parser/frontmatterSplit";
import { ensureFolderExists } from "../services/sourceResolver";
import { ZipArchive } from "./zipReader";

interface LocalEntryTimestamp {
	date: Date;
	dateKey: string;
	timeLabel: string;
	isoLocal: string;
}

export function resolveDayOneEntryTimestamp(
	creationDateIso: string,
	timeZone?: string
): LocalEntryTimestamp {
	const rawDate = new Date(creationDateIso);
	if (isNaN(rawDate.getTime())) {
		const fallback = new Date();
		return {
			date: fallback,
			dateKey: `${fallback.getFullYear()}-${pad2(fallback.getMonth() + 1)}-${pad2(fallback.getDate())}`,
			timeLabel: "12:00",
			isoLocal: fallback.toISOString(),
		};
	}

	if (timeZone) {
		try {
			const fmt = new Intl.DateTimeFormat("en-CA", {
				timeZone,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				hourCycle: "h23",
			});
			const parts = fmt.formatToParts(rawDate);
			const getPart = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
			const y = Number(getPart("year"));
			const m = Number(getPart("month"));
			const d = Number(getPart("day"));
			const hh = Number(getPart("hour")) % 24;
			const mm = Number(getPart("minute"));
			const ss = Number(getPart("second"));
			const localConstructed = new Date(y, m - 1, d, hh, mm, ss);
			return {
				date: localConstructed,
				dateKey: `${y}-${pad2(m)}-${pad2(d)}`,
				timeLabel: `${pad2(hh)}:${pad2(mm)}`,
				isoLocal: `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`,
			};
		} catch {
			// Fall back to system local time if timezone identifier is unrecognized
		}
	}

	const y = rawDate.getFullYear();
	const m = rawDate.getMonth() + 1;
	const d = rawDate.getDate();
	const hh = rawDate.getHours();
	const mm = rawDate.getMinutes();
	const ss = rawDate.getSeconds();
	return {
		date: rawDate,
		dateKey: `${y}-${pad2(m)}-${pad2(d)}`,
		timeLabel: `${pad2(hh)}:${pad2(mm)}`,
		isoLocal: `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`,
	};
}

export function formatDayOneWeather(weather?: DayOneEntry["weather"]): string | null {
	if (!weather) return null;
	const desc = (weather.conditionsDescription || "").trim();
	const code = (weather.weatherCode || desc).toLowerCase();

	let emoji = "⛅";
	if (/clear|sunny|fair/.test(code)) emoji = "☀️";
	else if (/storm|thunder/.test(code)) emoji = "⛈️";
	else if (/snow|sleet|blizzard|flurries/.test(code)) emoji = "❄️";
	else if (/rain|drizzle|shower/.test(code)) emoji = "🌧️";
	else if (/fog|mist|haze/.test(code)) emoji = "🌫️";
	else if (/overcast|cloudy/.test(code) && !/partly/.test(code)) emoji = "☁️";

	const tempPart =
		typeof weather.temperatureCelsius === "number"
			? `${Math.round(weather.temperatureCelsius)}°C`
			: "";

	const parts = [emoji, tempPart, desc].filter(Boolean);
	return parts.length > 0 ? parts.join(" ") : null;
}

export function formatDayOneLocation(loc?: DayOneEntry["location"]): string | null {
	if (!loc) return null;
	const seen = new Set<string>();
	const parts: string[] = [];
	for (const candidate of [loc.placeName, loc.localityName, loc.country]) {
		const c = (candidate || "").trim();
		if (c && !seen.has(c.toLowerCase())) {
			seen.add(c.toLowerCase());
			parts.push(c);
		}
	}
	return parts.length > 0 ? parts.slice(0, 2).join(", ") : null;
}

export function cleanDayOneMarkdownText(
	rawText: string,
	mediaByIdentifier: Map<string, string>
): string {
	let text = rawText.replace(/\r\n/g, "\n");
	const referencedIds = new Set<string>();

	text = text.replace(
		/!\[([^\]]*)\]\(dayone-moment:(?:\/\/|\/(?:audio|video|photo)\/)([A-Za-z0-9_-]+)\)/gi,
		(_full, caption: string, id: string) => {
			const mappedFile = mediaByIdentifier.get(id) ?? mediaByIdentifier.get(id.toLowerCase());
			if (!mappedFile) return "";
			referencedIds.add(id.toLowerCase());
			const cleanCap = caption.trim();
			return cleanCap ? `![[${mappedFile}|${cleanCap}]]` : `![[${mappedFile}]]`;
		}
	);

	text = text.replace(/\\([.!()[\]#+-])/g, "$1");

	const unreferencedEmbeds: string[] = [];
	for (const [idKey, fileName] of mediaByIdentifier.entries()) {
		if (idKey === idKey.toLowerCase() && !referencedIds.has(idKey)) {
			unreferencedEmbeds.push(`![[${fileName}]]`);
		}
	}

	if (unreferencedEmbeds.length > 0) {
		const sep = text.trim().length > 0 ? "\n\n" : "";
		text = `${text.trim()}${sep}${unreferencedEmbeds.join("\n")}`;
	}

	return text.trim();
}

function findArchiveFileForDayOneAsset(
	zipFiles: string[],
	folderHint: string,
	md5?: string,
	identifier?: string,
	extHint?: string
): string | null {
	const candidates = [md5, identifier].filter((x): x is string => Boolean(x && x.trim()));
	for (const token of candidates) {
		const lowerToken = token.toLowerCase();
		const matchInFolder = zipFiles.find((f) => {
			const lf = f.toLowerCase();
			return (
				lf.includes(`${folderHint}/`) &&
				(lf.endsWith(`/${lowerToken}.${(extHint || "").toLowerCase()}`) ||
					lf.includes(`/${lowerToken}.`))
			);
		});
		if (matchInFolder) return matchInFolder;

		const anyMatch = zipFiles.find((f) => {
			const base = (f.split("/").pop() || "").toLowerCase();
			return base.startsWith(`${lowerToken}.`);
		});
		if (anyMatch) return anyMatch;
	}
	return null;
}

export function parseDayOneJsonString(jsonText: string): DayOneEntry[] {
	const parsed = JSON.parse(jsonText) as { entries?: DayOneEntry[] } | DayOneEntry[];
	if (Array.isArray(parsed)) return parsed;
	if (parsed && Array.isArray(parsed.entries)) return parsed.entries;
	throw new Error("No valid Day One 'entries' array found in JSON.");
}

export async function importDayOneArchive(
	app: App,
	fileName: string,
	buffer: ArrayBuffer,
	options: DayOneImportOptions,
	onProgress?: (current: number, total: number) => void
): Promise<DayOneImportReport> {
	const report: DayOneImportReport = {
		importedEntries: 0,
		createdNotes: 0,
		updatedNotes: 0,
		skippedDuplicates: 0,
		extractedAttachments: 0,
		errors: [],
	};

	let zip: ZipArchive | null = null;
	const allEntries: DayOneEntry[] = [];

	if (fileName.toLowerCase().endsWith(".zip")) {
		zip = new ZipArchive(buffer);
		const jsonPaths = zip
			.listFiles()
			.filter((p) => p.toLowerCase().endsWith(".json") && !p.startsWith("__MACOSX/"));
		if (jsonPaths.length === 0) {
			throw new Error("No Day One .json file found inside the ZIP archive.");
		}
		for (const jp of jsonPaths) {
			try {
				const txt = await zip.readText(jp);
				const entries = parseDayOneJsonString(txt);
				allEntries.push(...entries);
			} catch (err) {
				report.errors.push(`Failed reading ${jp}: ${(err as Error).message}`);
			}
		}
	} else {
		const txt = new TextDecoder("utf-8").decode(new Uint8Array(buffer));
		allEntries.push(...parseDayOneJsonString(txt));
	}

	if (allEntries.length === 0) {
		return report;
	}

	const cleanTargetFolder = options.targetFolder.trim().replace(/^\/+|\/+$/g, "");
	const cleanAttachFolder = (options.attachmentFolder.trim() || "Attachments").replace(
		/^\/+|\/+$/g,
		""
	);

	if (cleanTargetFolder) await ensureFolderExists(app, cleanTargetFolder);
	if (zip && cleanAttachFolder) await ensureFolderExists(app, cleanAttachFolder);

	const zipFileList = zip ? zip.listFiles() : [];

	interface PreparedEntry {
		entry: DayOneEntry;
		uuid: string;
		ts: LocalEntryTimestamp;
		bodyMarkdown: string;
		weather: string | null;
		location: string | null;
		tags: string[];
		starred: boolean;
		firstPhotoName: string | null;
	}

	const preparedList: PreparedEntry[] = [];

	for (let idx = 0; idx < allEntries.length; idx++) {
		const entry = allEntries[idx];
		if (!entry || !entry.creationDate) continue;
		onProgress?.(idx + 1, allEntries.length);

		const uuid = (entry.uuid || `dayone-${idx}-${entry.creationDate}`).trim();
		const ts = resolveDayOneEntryTimestamp(entry.creationDate, entry.timeZone);
		const mediaById = new Map<string, string>();
		let firstPhotoName: string | null = null;

		if (zip) {
			const archive = zip;
			const extractGroup = async (
				items: Array<{ identifier: string; md5?: string; type?: string }> | undefined,
				folderHint: string,
				defaultExt: string
			) => {
				if (!items) return;
				for (const meta of items) {
					const zipEntryPath = findArchiveFileForDayOneAsset(
						zipFileList,
						folderHint,
						meta.md5,
						meta.identifier,
						meta.type
					);
					if (!zipEntryPath) continue;
					const ext = (zipEntryPath.split(".").pop() || meta.type || defaultExt).toLowerCase();
					const baseToken = (meta.md5 || meta.identifier).toLowerCase();
					const outName = `dayone-${baseToken}.${ext}`;
					const vaultMediaPath = normalizePath(
						cleanAttachFolder ? `${cleanAttachFolder}/${outName}` : outName
					);

					if (!app.vault.getAbstractFileByPath(vaultMediaPath)) {
						const bytes = await archive.readBytes(zipEntryPath);
						const copy = new Uint8Array(bytes.byteLength);
						copy.set(bytes);
						await app.vault.createBinary(vaultMediaPath, copy.buffer);
						report.extractedAttachments++;
					}

					mediaById.set(meta.identifier.toLowerCase(), outName);
					if (folderHint === "photos" && !firstPhotoName) {
						firstPhotoName = outName;
					}
				}
			};

			await extractGroup(entry.photos, "photos", "jpg");
			await extractGroup(entry.audios, "audios", "m4a");
			await extractGroup(entry.videos, "videos", "mp4");
		}

		const bodyMarkdown = cleanDayOneMarkdownText(entry.text || "", mediaById);
		const cleanTags = (entry.tags || [])
			.map((t) =>
				t
					.trim()
					.replace(/^#+/, "")
					.replace(/\s+/g, "-")
			)
			.filter(Boolean);

		preparedList.push({
			entry,
			uuid,
			ts,
			bodyMarkdown,
			weather: formatDayOneWeather(entry.weather),
			location: formatDayOneLocation(entry.location),
			tags: cleanTags,
			starred: Boolean(entry.starred),
			firstPhotoName,
		});
	}

	preparedList.sort((a, b) => a.ts.date.getTime() - b.ts.date.getTime());

	const pm = options.propertyMapping;

	if (options.mergeSameDay) {
		const byDay = new Map<string, PreparedEntry[]>();
		for (const p of preparedList) {
			const arr = byDay.get(p.ts.dateKey) ?? [];
			arr.push(p);
			byDay.set(p.ts.dateKey, arr);
		}

		for (const [, dayEntries] of byDay.entries()) {
			const first = dayEntries[0];
			const relPath = formatDateWithPattern(first.ts.date, options.dateFormat || "YYYY-MM-DD");
			const fullNotePath = normalizePath(
				cleanTargetFolder ? `${cleanTargetFolder}/${relPath}.md` : `${relPath}.md`
			);

			const slashIdx = fullNotePath.lastIndexOf("/");
			if (slashIdx !== -1) {
				await ensureFolderExists(app, fullNotePath.slice(0, slashIdx));
			}

			const existing = app.vault.getAbstractFileByPath(fullNotePath);
			if (existing instanceof TFile) {
				const existingText = await app.vault.cachedRead(existing);
				const freshEntries = dayEntries.filter(
					(e) => !existingText.includes(`dayone-uuid:${e.uuid}`) && !existingText.includes(e.uuid)
				);
				report.skippedDuplicates += dayEntries.length - freshEntries.length;
				if (freshEntries.length === 0) continue;

				const blocks = freshEntries.map((e) => {
					const header = `## ${e.ts.timeLabel}`;
					const metaLine = [e.weather, e.location ? `📍 ${e.location}` : ""]
						.filter(Boolean)
						.join(" · ");
					const uuidComment = `<!-- dayone-uuid:${e.uuid} -->`;
					return [header, metaLine, e.bodyMarkdown, uuidComment].filter(Boolean).join("\n\n");
				});

				await app.vault.process(existing, (cur) => {
					const sep = cur.trim().length > 0 ? "\n\n---\n\n" : "";
					return `${cur.trimEnd()}${sep}${blocks.join("\n\n---\n\n")}\n`;
				});
				report.importedEntries += freshEntries.length;
				report.updatedNotes++;
			} else {
				const combinedTags = Array.from(new Set(dayEntries.flatMap((d) => d.tags)));
				const anyStarred = dayEntries.some((d) => d.starred);
				const primaryWeather = dayEntries.find((d) => d.weather)?.weather ?? undefined;
				const allLocations = Array.from(
					new Set(dayEntries.map((d) => d.location).filter((x): x is string => Boolean(x)))
				);
				const uuids = dayEntries.map((d) => d.uuid);

				const fmFields: Record<string, unknown> = {
					[pm.dateKey || "date"]: first.ts.dateKey,
					[pm.weatherKey || "weather"]: primaryWeather,
					[pm.locationKey || "location"]:
						allLocations.length === 1
							? allLocations[0]
							: allLocations.length > 1
							? allLocations
							: undefined,
					[pm.starredKey || "starred"]: anyStarred ? true : undefined,
					tags: combinedTags.length > 0 ? combinedTags : undefined,
					dayone_uuids: uuids,
				};

				const fmYaml = serializeYamlFrontmatter(fmFields);
				const bodySections =
					dayEntries.length === 1
						? dayEntries[0].bodyMarkdown
						: dayEntries
								.map((e) => {
									const subMeta = [e.weather, e.location ? `📍 ${e.location}` : ""]
										.filter(Boolean)
										.join(" · ");
									return [`## ${e.ts.timeLabel}`, subMeta, e.bodyMarkdown]
										.filter(Boolean)
										.join("\n\n");
								})
								.join("\n\n");

				await app.vault.create(fullNotePath, `${fmYaml}${bodySections}\n`);
				report.importedEntries += dayEntries.length;
				report.createdNotes++;
			}
		}
	} else {
		for (const p of preparedList) {
			const timeSuffix = p.ts.timeLabel.replace(":", "");
			const baseRel = `${formatDateWithPattern(
				p.ts.date,
				options.dateFormat || "YYYY-MM-DD"
			)}_${timeSuffix}`;
			let candidatePath = normalizePath(
				cleanTargetFolder ? `${cleanTargetFolder}/${baseRel}.md` : `${baseRel}.md`
			);

			const slashIdx = candidatePath.lastIndexOf("/");
			if (slashIdx !== -1) {
				await ensureFolderExists(app, candidatePath.slice(0, slashIdx));
			}

			const existing = app.vault.getAbstractFileByPath(candidatePath);
			if (existing instanceof TFile) {
				const existingText = await app.vault.cachedRead(existing);
				if (existingText.includes(p.uuid)) {
					report.skippedDuplicates++;
					continue;
				}
				let counter = 2;
				while (app.vault.getAbstractFileByPath(candidatePath)) {
					candidatePath = normalizePath(
						cleanTargetFolder
							? `${cleanTargetFolder}/${baseRel}-${counter}.md`
							: `${baseRel}-${counter}.md`
					);
					counter++;
				}
			}

			const fmFields: Record<string, unknown> = {
				[pm.dateKey || "date"]: p.ts.isoLocal,
				[pm.weatherKey || "weather"]: p.weather ?? undefined,
				[pm.locationKey || "location"]: p.location ?? undefined,
				[pm.starredKey || "starred"]: p.starred ? true : undefined,
				tags: p.tags.length > 0 ? p.tags : undefined,
				dayone_uuid: p.uuid,
			};

			const fmYaml = serializeYamlFrontmatter(fmFields);
			await app.vault.create(candidatePath, `${fmYaml}${p.bodyMarkdown}\n`);
			report.importedEntries++;
			report.createdNotes++;
		}
	}

	return report;
}
