import { App, TFile } from "obsidian";
import { PropertyMapping } from "../types";
import { combineFrontmatterAndBody, splitFrontmatterAndBody } from "../parser/frontmatterSplit";
import { toggleNthTaskInBody } from "../parser/contentFolding";

export class EntryMutator {
	private app: App;
	private getMapping: () => PropertyMapping;

	constructor(app: App, getMapping: () => PropertyMapping) {
		this.app = app;
		this.getMapping = getMapping;
	}

	async setMood(file: TFile, moodValue: string | null): Promise<void> {
		const key = this.getMapping().moodKey || "mood";
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (!moodValue || !moodValue.trim()) {
				delete fm[key];
			} else {
				fm[key] = moodValue.trim();
			}
		});
	}

	async setWeather(file: TFile, weatherValue: string | null): Promise<void> {
		const key = this.getMapping().weatherKey || "weather";
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (!weatherValue || !weatherValue.trim()) {
				delete fm[key];
			} else {
				fm[key] = weatherValue.trim();
			}
		});
	}

	async setLocations(file: TFile, locations: string[]): Promise<void> {
		const key = this.getMapping().locationKey || "location";
		const cleaned = locations.map((s) => s.trim()).filter(Boolean);
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (cleaned.length === 0) {
				delete fm[key];
			} else if (cleaned.length === 1) {
				fm[key] = cleaned[0];
			} else {
				fm[key] = cleaned;
			}
		});
	}

	async setPeople(file: TFile, people: string[]): Promise<void> {
		const key = this.getMapping().peopleKey || "people";
		const cleaned = people.map((s) => s.trim()).filter(Boolean);
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (cleaned.length === 0) {
				delete fm[key];
			} else if (cleaned.length === 1) {
				fm[key] = cleaned[0];
			} else {
				fm[key] = cleaned;
			}
		});
	}

	async toggleStarred(file: TFile, nextStarred: boolean): Promise<void> {
		const key = this.getMapping().starredKey || "starred";
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (nextStarred) {
				fm[key] = true;
			} else {
				delete fm[key];
			}
		});
	}

	async updateBodyPreservingFrontmatter(file: TFile, nextBody: string): Promise<void> {
		await this.app.vault.process(file, (rawContent) => {
			const { frontmatterBlock } = splitFrontmatterAndBody(rawContent);
			return combineFrontmatterAndBody(frontmatterBlock, nextBody);
		});
	}

	async toggleTaskCheckbox(
		file: TFile,
		taskOccurrenceIndex: number,
		checked?: boolean
	): Promise<boolean> {
		let didChange = false;
		await this.app.vault.process(file, (rawContent) => {
			const { frontmatterBlock, body } = splitFrontmatterAndBody(rawContent);
			const { updatedBody, changed } = toggleNthTaskInBody(body, taskOccurrenceIndex, checked);
			didChange = changed;
			if (!changed) return rawContent;
			return combineFrontmatterAndBody(frontmatterBlock, updatedBody);
		});
		return didChange;
	}

	async attachMediaFileToNote(noteFile: TFile, fileName: string, buffer: ArrayBuffer): Promise<TFile> {
		const safeName = fileName.replace(/[\\/:*?"<>|]/g, "_");
		const destPath = await this.app.fileManager.getAvailablePathForAttachment(
			safeName,
			noteFile.path
		);
		const attachmentFile = await this.app.vault.createBinary(destPath, buffer);
		const markdownLink = this.app.fileManager.generateMarkdownLink(
			attachmentFile,
			noteFile.path,
			"",
			""
		);
		const embedLink = markdownLink.startsWith("!") ? markdownLink : `!${markdownLink}`;

		await this.app.vault.process(noteFile, (cur) => {
			const sep = cur.length > 0 && !cur.endsWith("\n") ? "\n\n" : cur.length > 0 ? "\n" : "";
			return `${cur}${sep}${embedLink}\n`;
		});

		return attachmentFile;
	}
}
