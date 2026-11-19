import { App, Modal, Notice, Setting } from "obsidian";
import { DayOneImportOptions, JournalifySettings } from "../types";
import { t } from "../i18n";
import { importDayOneArchive } from "../importer/dayOneImporter";

export class DayOneImportModal extends Modal {
	private settings: JournalifySettings;
	private defaultFolder: string;
	private defaultDateFormat: string;
	private onComplete: () => void;

	constructor(
		app: App,
		settings: JournalifySettings,
		defaultFolder: string,
		defaultDateFormat: string,
		onComplete: () => void
	) {
		super(app);
		this.settings = settings;
		this.defaultFolder = defaultFolder;
		this.defaultDateFormat = defaultDateFormat;
		this.onComplete = onComplete;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("journalify-dayone-modal");

		const strings = t(this.settings.uiLanguage);
		this.setTitle(strings.dayOneModalTitle);

		let selectedFile: File | null = null;
		let targetFolder = this.defaultFolder || "Daily Notes";
		let attachmentFolder = targetFolder ? `${targetFolder}/Attachments` : "Attachments";
		let mergeSameDay = true;

		const fileSetting = new Setting(contentEl).setName(strings.dayOneSelectFile);
		const fileInput = fileSetting.controlEl.createEl("input", {
			type: "file",
			attr: { accept: ".zip,.json,application/zip,application/json" },
		});
		fileInput.addEventListener("change", () => {
			selectedFile = fileInput.files?.[0] ?? null;
		});

		new Setting(contentEl)
			.setName(strings.dayOneTargetFolder)
			.addText((txt) =>
				txt.setValue(targetFolder).onChange((v) => {
					targetFolder = v.trim();
				})
			);

		new Setting(contentEl)
			.setName(strings.dayOneAttachmentFolder)
			.addText((txt) =>
				txt.setValue(attachmentFolder).onChange((v) => {
					attachmentFolder = v.trim();
				})
			);

		new Setting(contentEl)
			.setName(strings.dayOneMergeSameDay)
			.setDesc(strings.dayOneMergeSameDayDesc)
			.addToggle((tg) =>
				tg.setValue(mergeSameDay).onChange((v) => {
					mergeSameDay = v;
				})
			);

		const statusEl = contentEl.createDiv({ cls: "journalify-import-status" });

		const footer = contentEl.createDiv({ cls: "journalify-modal-footer" });
		const startBtn = footer.createEl("button", {
			cls: "journalify-btn journalify-btn-primary",
			text: strings.dayOneStartImport,
		});

		startBtn.addEventListener("click", () => {
			void (async () => {
				if (!selectedFile) {
					new Notice(strings.dayOneSelectFile);
					return;
				}
				startBtn.disabled = true;
				statusEl.setText(strings.dayOneImporting);

				try {
					const buffer = await selectedFile.arrayBuffer();
					const opts: DayOneImportOptions = {
						targetFolder,
						attachmentFolder,
						mergeSameDay,
						dateFormat: this.defaultDateFormat || "YYYY-MM-DD",
						propertyMapping: this.settings.propertyMapping,
					};

					const report = await importDayOneArchive(
						this.app,
						selectedFile.name,
						buffer,
						opts,
						(cur, tot) => {
							statusEl.setText(`${strings.dayOneImporting} (${cur} / ${tot})`);
						}
					);

					const msg = strings.dayOneSuccessSummary(
						report.importedEntries,
						report.createdNotes + report.updatedNotes,
						report.extractedAttachments,
						report.skippedDuplicates
					);
					new Notice(msg, 6000);
					this.onComplete();
					this.close();
				} catch (err) {
					statusEl.setText(`Error: ${(err as Error).message}`);
					startBtn.disabled = false;
				}
			})();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
