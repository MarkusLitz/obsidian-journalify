import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import esbuild from "esbuild";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "journalify-test-"));
const obsidianStubFile = path.join(tmpDir, "obsidian-stub.ts");
const entryFile = path.join(tmpDir, "bundle-entry.ts");
const outFile = path.join(tmpDir, "bundle.mjs");

fs.writeFileSync(
	obsidianStubFile,
	`
let mockLanguage = "en";
export function __setMockLanguage(lang: string): void { mockLanguage = lang; }
export function getLanguage(): string { return mockLanguage; }
export class TAbstractFile { path = ""; }
export class TFile extends TAbstractFile {
	basename = "";
	extension = "md";
	stat = { mtime: 0, size: 0 };
}
export class TFolder extends TAbstractFile { children: TAbstractFile[] = []; }
export function normalizePath(p: string): string {
	return p.replace(/\\\\+/g, "/").replace(/\\/+/g, "/").replace(/^\\/|\\/$/g, "");
}
export async function requestUrl(): Promise<never> {
	throw new Error("Network stub");
}
`
);

const projectRoot = process.cwd();
fs.writeFileSync(
	entryFile,
	`
export * from ${JSON.stringify(path.join(projectRoot, "src/types.ts"))};
export * from ${JSON.stringify(path.join(projectRoot, "src/i18n.ts"))};
export * from ${JSON.stringify(path.join(projectRoot, "src/parser/dateUtils.ts"))};
export * from ${JSON.stringify(path.join(projectRoot, "src/parser/frontmatterSplit.ts"))};
export * from ${JSON.stringify(path.join(projectRoot, "src/parser/propertyMapper.ts"))};
export * from ${JSON.stringify(path.join(projectRoot, "src/parser/mediaExtractor.ts"))};
export * from ${JSON.stringify(path.join(projectRoot, "src/parser/contentFolding.ts"))};
export * from ${JSON.stringify(path.join(projectRoot, "src/services/sourceResolver.ts"))};
export * from ${JSON.stringify(path.join(projectRoot, "src/services/journalIndex.ts"))};
export * from ${JSON.stringify(path.join(projectRoot, "src/services/entryMutator.ts"))};
export * from ${JSON.stringify(path.join(projectRoot, "src/services/weatherService.ts"))};
export * from ${JSON.stringify(path.join(projectRoot, "src/importer/zipReader.ts"))};
export * from ${JSON.stringify(path.join(projectRoot, "src/importer/dayOneImporter.ts"))};
export { TFile, TFolder, __setMockLanguage } from "obsidian";
`
);

await esbuild.build({
	entryPoints: [entryFile],
	bundle: true,
	format: "esm",
	platform: "node",
	target: "es2021",
	outfile: outFile,
	alias: {
		obsidian: obsidianStubFile,
	},
});

const mod = await import(outFile);

test.after(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("i18n resolves auto language from Obsidian getLanguage() and respects explicit overrides", () => {
	mod.__setMockLanguage("de-DE");
	assert.equal(mod.resolveUiLanguage("auto"), "de");
	assert.equal(mod.resolveUiLanguage("en"), "en");

	mod.__setMockLanguage("en-US");
	assert.equal(mod.resolveUiLanguage("auto"), "en");
	assert.equal(mod.resolveUiLanguage("de"), "de");
});

test("dateUtils parses flat, weekday-suffixed, nested, and escaped date patterns accurately", () => {
	const simple = mod.parseDateFromRelativePath("2026-11-18", "YYYY-MM-DD");
	assert.equal(simple?.dateKey, "2026-11-18");
	assert.equal(simple?.monthDay, "11-18");

	const withWeekdayDe = mod.parseDateFromRelativePath("2026-11-18_Mittwoch", "YYYY-MM-DD_dddd");
	assert.equal(withWeekdayDe?.dateKey, "2026-11-18");

	const nested = mod.parseDateFromRelativePath(
		"2026/11-November/2026-11-18",
		"YYYY/MM-MMMM/YYYY-MM-DD"
	);
	assert.equal(nested?.dateKey, "2026-11-18");

	const escaped = mod.parseDateFromRelativePath("Entry 2026-03-05", "[Entry] YYYY-MM-DD");
	assert.equal(escaped?.dateKey, "2026-03-05");

	const invalid = mod.parseDateFromRelativePath("2026-02-30", "YYYY-MM-DD");
	assert.equal(invalid, null);

	const fmDate = mod.parseFrontmatterDateValue("2026-11-18T14:35:00");
	assert.equal(fmDate?.dateKey, "2026-11-18");
	assert.equal(fmDate?.timeLabel, "14:35");
});

test("frontmatterSplit preserves complex foreign YAML byte-for-byte when updating body", () => {
	const original = [
		"---",
		"mood: 😊",
		"tasks:",
		"  - id: tp-123",
		"    title: Keep foreign plugin data safe",
		"    status: open",
		"---",
		"Morning walk in the park.",
		"",
		"---",
		"Scratchpad below horizontal rule.",
	].join("\n");

	const split = mod.splitFrontmatterAndBody(original);
	assert.equal(split.frontmatterLineCount, 7);
	assert.ok(split.frontmatterBlock.includes("id: tp-123"));
	assert.ok(split.body.startsWith("Morning walk in the park."));

	const recombined = mod.combineFrontmatterAndBody(split.frontmatterBlock, "Updated diary body.");
	assert.ok(
		recombined.includes("    title: Keep foreign plugin data safe\n    status: open\n---\nUpdated diary body.")
	);
});

test("propertyMapper normalizes emojis, EN/DE words, numeric mood scales, and wiki-links", () => {
	assert.equal(mod.normalizeMoodValue("🤩")?.score, 5);
	assert.equal(mod.normalizeMoodValue("glücklich")?.score, 4);
	assert.equal(mod.normalizeMoodValue("😊 Glücklich")?.label, "Glücklich");
	assert.equal(mod.normalizeMoodValue("Ausgeglichen")?.score, 3);
	assert.equal(mod.normalizeMoodValue("8/10")?.score, 4);
	assert.equal(mod.normalizeMoodValue(1)?.score, 1);

	const mapped = mod.extractMappedProperties(
		{
			stimmung: "🤩 Großartig",
			wetter: "☀️ 14°C",
			ort: "[[München]]",
			personen: ["[[Anna Schmidt|Anna]]", "Max"],
			cover: "![[hero.jpg|600]]",
			favorite: true,
		},
		mod.DEFAULT_PROPERTY_MAPPING
	);

	assert.equal(mapped.mood?.score, 5);
	assert.equal(mapped.weather, "☀️ 14°C");
	assert.deepEqual(mapped.locations, ["München"]);
	assert.deepEqual(mapped.people, ["Anna", "Max"]);
	assert.deepEqual(mapped.frontmatterImages, ["hero.jpg"]);
	assert.equal(mapped.starred, true);
});

test("mediaExtractor and contentFolding extract media, ignore code blocks, deduplicate, and toggle tasks", () => {
	const body = [
		"Great afternoon walk!",
		"![[forest.jpg|400]]",
		"![Espresso](https://example.com/coffee.png)",
		'<div style="text-align:center"><a href="https://drive.google.com/x"><img src="https://drive.google.com/thumbnail?id=abc123" alt="DrivePhoto" /></a></div>',
		"![[voice-note.m4a]]",
		"```markdown",
		"![[ignored-in-codeblock.jpg]]",
		"- [ ] task inside codeblock must not toggle",
		"```",
		"- [ ] First real task",
		"- [x] Second real task",
		"---",
		"Technical notes below divider that should fold in feed preview.",
	].join("\n");

	const media = mod.extractAllMediaFromNote(body, ["cover.webp"]);
	assert.deepEqual(
		media.map((m) => `${m.kind}:${m.src}`),
		[
			"image:cover.webp",
			"image:forest.jpg",
			"image:https://example.com/coffee.png",
			"image:https://drive.google.com/thumbnail?id=abc123",
			"audio:voice-note.m4a",
		]
	);

	const folded = mod.prepareCardBodyContent(body, {
		aggregateInlineImages: true,
		collapseLongEntries: true,
		collapseMaxLines: 25,
		collapseAfterHr: true,
		hasAnyMedia: true,
	});

	assert.equal(folded.isFolded, true);
	assert.ok(!folded.previewMarkdown.includes("![[forest.jpg"));
	assert.ok(!folded.previewMarkdown.includes("Technical notes below divider"));
	assert.ok(folded.expandedMarkdown.includes("Technical notes below divider"));
	assert.ok(folded.previewMarkdown.includes("![[ignored-in-codeblock.jpg]]"));

	const toggled = mod.toggleNthTaskInBody(body, 0);
	assert.equal(toggled.changed, true);
	assert.ok(toggled.updatedBody.includes("- [x] First real task"));
	assert.ok(toggled.updatedBody.includes("- [ ] task inside codeblock must not toggle"));
});

test("JournalIndex indexes MetadataCache entries, hides 0-byte files, computes streaks & On This Day", async () => {
	const makeFile = (filePath, size, content, cache) => {
		const f = new mod.TFile();
		f.path = filePath;
		f.basename = path.basename(filePath, ".md");
		f.stat = { mtime: Date.now(), size };
		f._content = content;
		f._cache = cache;
		return f;
	};

	const files = [
		makeFile("Journal/2026-11-18.md", 120, "Today note", {
			frontmatter: { mood: "😊", location: "Berlin", starred: true },
			tags: [{ tag: "#autumn" }],
		}),
		makeFile("Journal/2026-11-17.md", 85, "Yesterday note", {
			frontmatter: { mood: "😌" },
		}),
		makeFile("Journal/2026-11-16.md", 0, "", {}),
		makeFile("Journal/2025-11-18.md", 200, "Last year memory on Nov 18", {
			frontmatter: { mood: "🤩" },
		}),
	];

	const byPath = new Map(files.map((f) => [f.path, f]));
	const mockApp = {
		vault: {
			getMarkdownFiles: () => files,
			getAbstractFileByPath: (p) => byPath.get(p) ?? null,
			cachedRead: async (f) => f._content,
		},
		metadataCache: {
			getFileCache: (f) => f._cache ?? null,
		},
	};

	const settings = structuredClone(mod.DEFAULT_SETTINGS);
	settings.profiles[0].folder = "Journal";
	settings.profiles[0].autoSyncDailyNotesConfig = false;

	const index = new mod.JournalIndex(mockApp, () => settings);
	index.rebuild();

	const visible = index.getAllEntries("desc", false);
	assert.equal(visible.length, 3);

	const streak = index.getCurrentStreak(new Date(2026, 10, 18, 12, 0, 0), true);
	assert.equal(streak, 2);

	const otd = index.getOnThisDayEntries(new Date(2026, 10, 18, 12, 0, 0), true);
	assert.equal(otd.length, 1);
	assert.equal(otd[0].year, 2025);

	const filtered = await index.queryEntries(
		{
			...mod.createEmptyFilterState(),
			onlyStarred: true,
			query: "today",
		},
		"desc",
		true
	);
	assert.equal(filtered.length, 1);
	assert.equal(filtered[0].dateKey, "2026-11-18");
});

function buildTestZipBuffer(entries) {
	const localParts = [];
	const centralParts = [];
	let offset = 0;

	for (const item of entries) {
		const nameBytes = Buffer.from(item.name, "utf8");
		const uncompressed = Buffer.isBuffer(item.data)
			? item.data
			: Buffer.from(item.data, "utf8");
		const compressed = zlib.deflateRawSync(uncompressed);

		const localHeader = Buffer.alloc(30);
		localHeader.writeUInt32LE(0x04034b50, 0);
		localHeader.writeUInt16LE(20, 4);
		localHeader.writeUInt16LE(0, 6);
		localHeader.writeUInt16LE(8, 8);
		localHeader.writeUInt32LE(0, 14);
		localHeader.writeUInt32LE(compressed.length, 18);
		localHeader.writeUInt32LE(uncompressed.length, 22);
		localHeader.writeUInt16LE(nameBytes.length, 26);
		localHeader.writeUInt16LE(0, 28);

		const centralHeader = Buffer.alloc(46);
		centralHeader.writeUInt32LE(0x02014b50, 0);
		centralHeader.writeUInt16LE(20, 4);
		centralHeader.writeUInt16LE(20, 6);
		centralHeader.writeUInt16LE(0, 8);
		centralHeader.writeUInt16LE(8, 10);
		centralHeader.writeUInt32LE(0, 16);
		centralHeader.writeUInt32LE(compressed.length, 20);
		centralHeader.writeUInt32LE(uncompressed.length, 24);
		centralHeader.writeUInt16LE(nameBytes.length, 28);
		centralHeader.writeUInt16LE(0, 30);
		centralHeader.writeUInt16LE(0, 32);
		centralHeader.writeUInt32LE(offset, 42);

		localParts.push(localHeader, nameBytes, compressed);
		centralParts.push(centralHeader, nameBytes);
		offset += 30 + nameBytes.length + compressed.length;
	}

	const cdBuf = Buffer.concat(centralParts);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(entries.length, 8);
	eocd.writeUInt16LE(entries.length, 10);
	eocd.writeUInt32LE(cdBuf.length, 12);
	eocd.writeUInt32LE(offset, 16);

	const full = Buffer.concat([...localParts, cdBuf, eocd]);
	return full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength);
}

test("DayOneImporter extracts DEFLATE .zip archive, rewrites photos, merges same-day entries & prevents duplicates", async () => {
	const fakeJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
	const dayOneJson = JSON.stringify({
		entries: [
			{
				uuid: "UUID-MORNING-1",
				creationDate: "2026-10-12T08:15:00Z",
				timeZone: "Europe/Berlin",
				text: "Morning espresso\\. Feeling great\\!\n\n![](dayone-moment://PHOTO_ID_1)",
				starred: true,
				tags: ["travel", "italy"],
				weather: { conditionsDescription: "Sunny", temperatureCelsius: 19.4 },
				location: { placeName: "Piazza", localityName: "Rome", country: "Italy" },
				photos: [{ identifier: "PHOTO_ID_1", md5: "ab12cd34", type: "jpeg" }],
			},
			{
				uuid: "UUID-EVENING-2",
				creationDate: "2026-10-12T19:45:00Z",
				timeZone: "Europe/Berlin",
				text: "Evening walk by the river\\.",
				tags: ["walk"],
			},
		],
	});

	const zipArrayBuffer = buildTestZipBuffer([
		{ name: "Journal.json", data: dayOneJson },
		{ name: "photos/ab12cd34.jpeg", data: fakeJpegBytes },
	]);

	const vaultFiles = new Map();
	const vaultFolders = new Set();

	const mockApp = {
		vault: {
			getAbstractFileByPath: (p) => {
				if (vaultFiles.has(p)) return vaultFiles.get(p);
				if (vaultFolders.has(p)) {
					const tf = new mod.TFolder();
					tf.path = p;
					return tf;
				}
				return null;
			},
			createFolder: async (p) => {
				vaultFolders.add(p);
			},
			createBinary: async (p, ab) => {
				const f = new mod.TFile();
				f.path = p;
				f._binary = new Uint8Array(ab);
				vaultFiles.set(p, f);
				return f;
			},
			create: async (p, text) => {
				const f = new mod.TFile();
				f.path = p;
				f._text = text;
				vaultFiles.set(p, f);
				return f;
			},
			cachedRead: async (f) => f._text ?? "",
			process: async (f, fn) => {
				f._text = fn(f._text ?? "");
				return f._text;
			},
		},
	};

	const importOpts = {
		targetFolder: "ImportedJournal",
		attachmentFolder: "ImportedJournal/Attachments",
		mergeSameDay: true,
		dateFormat: "YYYY-MM-DD",
		propertyMapping: mod.DEFAULT_PROPERTY_MAPPING,
	};

	const firstRun = await mod.importDayOneArchive(
		mockApp,
		"DayOneExport.zip",
		zipArrayBuffer,
		importOpts
	);

	assert.equal(firstRun.importedEntries, 2);
	assert.equal(firstRun.createdNotes, 1);
	assert.equal(firstRun.extractedAttachments, 1);
	assert.equal(firstRun.skippedDuplicates, 0);

	const createdNote = vaultFiles.get("ImportedJournal/2026-10-12.md");
	assert.ok(createdNote, "Merged daily note should exist");
	assert.ok(createdNote._text.includes("![[dayone-ab12cd34.jpeg]]"));
	assert.ok(createdNote._text.includes("Morning espresso. Feeling great!"));
	assert.ok(createdNote._text.includes("## 10:15"));
	assert.ok(createdNote._text.includes("## 21:45"));
	assert.ok(createdNote._text.includes("starred: true"));

	const extractedImg = vaultFiles.get("ImportedJournal/Attachments/dayone-ab12cd34.jpeg");
	assert.deepEqual(Buffer.from(extractedImg._binary), fakeJpegBytes);

	const secondRun = await mod.importDayOneArchive(
		mockApp,
		"DayOneExport.zip",
		zipArrayBuffer,
		importOpts
	);
	assert.equal(secondRun.importedEntries, 0);
	assert.equal(secondRun.skippedDuplicates, 2);
});

test("sourceResolver detects Periodic Notes / Core Daily Notes and expands templates without breaking Templater", async () => {
	const mockApp = {
		plugins: {
			getPlugin: (id) =>
				id === "periodic-notes"
					? {
							settings: {
								daily: {
									enabled: true,
									folder: "Journals",
									format: "YYYY/MM/YYYY-MM-DD",
									template: "Templates/Daily.md",
								},
							},
					  }
					: null,
		},
	};

	const detected = mod.detectVaultDailyNotesConfig(mockApp);
	assert.equal(detected.source, "periodic-notes");
	assert.equal(detected.folder, "Journals");
	assert.equal(detected.dateFormat, "YYYY/MM/YYYY-MM-DD");

	const rawTpl = "# {{title}}\nCreated: {{date:DD.MM.YYYY}} at {{time}}\n<% tp.date.now() %>";
	const expanded = mod.expandTemplateVariables(
		rawTpl,
		new Date(2026, 10, 18, 9, 5, 0),
		"2026-11-18",
		"de"
	);
	assert.equal(expanded, "# 2026-11-18\nCreated: 18.11.2026 at 09:05\n<% tp.date.now() %>");
});

test("EntryMutator and describeWmoWeatherCode handle frontmatter mutations and WMO codes cleanly", async () => {
	const fmStore = { existingKey: "untouched" };
	const file = new mod.TFile();
	file.path = "Journal/2026-11-18.md";
	let rawText = "---\nexistingKey: untouched\n---\n- [ ] Buy coffee\n";

	const mockApp = {
		fileManager: {
			processFrontMatter: async (_f, cb) => {
				cb(fmStore);
			},
		},
		vault: {
			process: async (_f, cb) => {
				rawText = cb(rawText);
				return rawText;
			},
		},
	};

	const mutator = new mod.EntryMutator(mockApp, () => mod.DEFAULT_PROPERTY_MAPPING);
	await mutator.setMood(file, "😊 Happy");
	await mutator.setLocations(file, ["Munich", "Park"]);
	await mutator.toggleStarred(file, true);
	await mutator.toggleTaskCheckbox(file, 0, true);

	assert.equal(fmStore.existingKey, "untouched");
	assert.equal(fmStore.mood, "😊 Happy");
	assert.deepEqual(fmStore.location, ["Munich", "Park"]);
	assert.equal(fmStore.starred, true);
	assert.ok(rawText.includes("- [x] Buy coffee"));

	assert.equal(mod.describeWmoWeatherCode(0).emoji, "☀️");
	assert.equal(mod.describeWmoWeatherCode(63).emoji, "🌧️");
	assert.equal(mod.describeWmoWeatherCode(75).emoji, "❄️");
	assert.equal(mod.describeWmoWeatherCode(95).emoji, "⛈️");
});
