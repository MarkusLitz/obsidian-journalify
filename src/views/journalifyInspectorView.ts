import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type JournalifyPlugin from "../main";
import { resolveUiLanguage, t } from "../i18n";
import { getOrCreateDailyNoteForDate } from "../services/sourceResolver";
import { InspectorPanelController } from "../components/inspectorPanel";
import { JournalifyMainView, VIEW_TYPE_JOURNALIFY } from "./journalifyMainView";

export const VIEW_TYPE_JOURNALIFY_INSPECTOR = "journalify-inspector-view";

export class JournalifyInspectorView extends ItemView {
	plugin: JournalifyPlugin;
	private controller: InspectorPanelController | null = null;
	private unsubscribe: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: JournalifyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_JOURNALIFY_INSPECTOR;
	}

	getDisplayText(): string {
		const strings = t(this.plugin.settings.uiLanguage);
		return `${strings.pluginTitle} · ${strings.inspectorCalendarTab}`;
	}

	getIcon(): string {
		return "calendar-heart";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("journalify-sidebar-inspector-root");

		this.controller = new InspectorPanelController(
			this.app,
			this.contentEl,
			() => this.plugin.settings,
			this.plugin.index,
			{
				onJumpToEntry: (entry) => {
					void (async () => {
						const openFeedLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_JOURNALIFY);
						if (openFeedLeaves.length > 0 && openFeedLeaves[0].view instanceof JournalifyMainView) {
							await this.app.workspace.revealLeaf(openFeedLeaves[0]);
							await openFeedLeaves[0].view.jumpToEntry(entry.filePath);
							return;
						}
						const abstract = this.app.vault.getAbstractFileByPath(entry.filePath);
						if (abstract instanceof TFile) {
							await this.app.workspace.getLeaf(false).openFile(abstract);
						}
					})();
				},
				onCreateOrOpenDate: (y, m, d) => {
					void (async () => {
						const targetDate = new Date(y, m - 1, d, 12, 0, 0);
						const source = this.plugin.index.getActiveSource();
						const { file } = await getOrCreateDailyNoteForDate(
							this.app,
							source,
							targetDate,
							resolveUiLanguage(this.plugin.settings.uiLanguage)
						);
						await this.app.workspace.getLeaf(false).openFile(file);
					})();
				},
				onTabChange: () => {
					void this.plugin.saveSettings();
				},
			}
		);

		this.unsubscribe?.();
		this.unsubscribe = this.plugin.index.onChange(() => {
			void this.controller?.render();
		});

		await this.controller.render();
	}

	async refresh(): Promise<void> {
		await this.controller?.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}
}
