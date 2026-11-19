import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import {
	DEFAULT_PROFILE,
	DEFAULT_PROPERTY_MAPPING,
	DEFAULT_SETTINGS,
	JournalifySettings,
} from "./types";
import { resolveUiLanguage, t } from "./i18n";
import { getOrCreateDailyNoteForDate } from "./services/sourceResolver";
import { JournalIndex } from "./services/journalIndex";
import { EntryMutator } from "./services/entryMutator";
import {
	JournalifyMainView,
	VIEW_TYPE_JOURNALIFY,
} from "./views/journalifyMainView";
import {
	JournalifyInspectorView,
	VIEW_TYPE_JOURNALIFY_INSPECTOR,
} from "./views/journalifyInspectorView";
import { DayOneImportModal } from "./components/dayOneModal";
import { closeActivePopover } from "./components/metadataPopovers";
import { JournalifySettingTab } from "./settings";

export default class JournalifyPlugin extends Plugin {
	settings: JournalifySettings = { ...DEFAULT_SETTINGS };
	index!: JournalIndex;
	mutator!: EntryMutator;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.index = new JournalIndex(this.app, () => this.settings);
		this.mutator = new EntryMutator(this.app, () => this.settings.propertyMapping);

		this.registerView(
			VIEW_TYPE_JOURNALIFY,
			(leaf: WorkspaceLeaf) => new JournalifyMainView(leaf, this)
		);

		this.registerView(
			VIEW_TYPE_JOURNALIFY_INSPECTOR,
			(leaf: WorkspaceLeaf) => new JournalifyInspectorView(leaf, this)
		);

		this.addRibbonIcon("book-open", "Journalify", () => {
			void this.activateMainView();
		});

		const strings = () => t(this.settings.uiLanguage);

		this.addCommand({
			id: "open-feed",
			name: strings().openFeedCommand,
			callback: () => {
				void this.activateMainView();
			},
		});

		this.addCommand({
			id: "open-inspector",
			name: strings().openInspectorCommand,
			callback: () => {
				void this.activateRightInspectorView();
			},
		});

		this.addCommand({
			id: "create-or-open-today",
			name: strings().createTodayCommand,
			callback: () => {
				void (async () => {
					const source = this.index.getActiveSource();
					const { file } = await getOrCreateDailyNoteForDate(
						this.app,
						source,
						new Date(),
						resolveUiLanguage(this.settings.uiLanguage)
					);
					this.index.updateFile(file);
					await this.activateMainView(file.path);
				})();
			},
		});

		this.addCommand({
			id: "import-day-one",
			name: strings().importDayOneCommand,
			callback: () => {
				const source = this.index.getActiveSource();
				new DayOneImportModal(
					this.app,
					this.settings,
					source.folder,
					source.dateFormat,
					() => {
						this.index.rebuild();
						void this.refreshOpenViews();
					}
				).open();
			},
		});

		this.addSettingTab(new JournalifySettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.index.rebuild();
			void this.refreshOpenViews();
		});

		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file instanceof TFile) {
					this.index.updateFile(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile) {
					this.index.updateFile(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.index.removePath(file.path);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile) {
					this.index.renamePath(oldPath, file);
				} else {
					this.index.removePath(oldPath);
				}
			})
		);
	}

	onunload(): void {
		closeActivePopover();
	}

	async activateMainView(jumpToFilePath?: string): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_JOURNALIFY);

		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({
				type: VIEW_TYPE_JOURNALIFY,
				active: true,
			});
		}

		await workspace.revealLeaf(leaf);
		if (jumpToFilePath && leaf.view instanceof JournalifyMainView) {
			await leaf.view.jumpToEntry(jumpToFilePath);
		}
	}

	async activateRightInspectorView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_JOURNALIFY_INSPECTOR);
		let leaf: WorkspaceLeaf | null = existing[0] ?? null;

		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({
				type: VIEW_TYPE_JOURNALIFY_INSPECTOR,
				active: true,
			});
		}

		await workspace.revealLeaf(leaf);
	}

	async refreshOpenViews(): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_JOURNALIFY)) {
			if (leaf.view instanceof JournalifyMainView) {
				await leaf.view.renderFullShell();
			}
		}
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_JOURNALIFY_INSPECTOR)) {
			if (leaf.view instanceof JournalifyInspectorView) {
				await leaf.view.refresh();
			}
		}
	}

	async loadSettings(): Promise<void> {
		const raw = (await this.loadData()) as Partial<JournalifySettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw || {});
		this.settings.propertyMapping = Object.assign(
			{},
			DEFAULT_PROPERTY_MAPPING,
			raw?.propertyMapping || {}
		);
		this.settings.weather = Object.assign(
			{},
			DEFAULT_SETTINGS.weather,
			raw?.weather || {}
		);
		if (!Array.isArray(this.settings.profiles) || this.settings.profiles.length === 0) {
			this.settings.profiles = [{ ...DEFAULT_PROFILE }];
		}
		if (!this.settings.profiles.some((p) => p.id === this.settings.activeProfileId)) {
			this.settings.activeProfileId = this.settings.profiles[0].id;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
