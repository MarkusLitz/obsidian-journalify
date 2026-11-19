import { App, Modal, TFile, setIcon } from "obsidian";
import { UiLanguage } from "../types";
import { t } from "../i18n";

export interface LightboxSlide {
	url: string;
	caption: string;
	dateHeading: string;
	filePath: string;
}

export class LightboxModal extends Modal {
	private slides: LightboxSlide[];
	private currentIndex: number;
	private lang: UiLanguage;
	private onJumpToNote?: (filePath: string) => void;
	private zoomed = false;
	private imgEl: HTMLImageElement | null = null;
	private captionEl: HTMLElement | null = null;
	private counterEl: HTMLElement | null = null;

	constructor(
		app: App,
		slides: LightboxSlide[],
		initialIndex: number,
		lang: UiLanguage,
		onJumpToNote?: (filePath: string) => void
	) {
		super(app);
		this.slides = slides;
		this.currentIndex = Math.max(0, Math.min(slides.length - 1, initialIndex));
		this.lang = lang;
		this.onJumpToNote = onJumpToNote;
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("journalify-lightbox-modal");
		contentEl.empty();
		contentEl.addClass("journalify-lightbox-content");

		const strings = t(this.lang);

		const topBar = contentEl.createDiv({ cls: "journalify-lightbox-topbar" });
		this.counterEl = topBar.createDiv({ cls: "journalify-lightbox-counter" });

		const actions = topBar.createDiv({ cls: "journalify-lightbox-actions" });
		if (this.onJumpToNote) {
			const jumpBtn = actions.createEl("button", {
				cls: "journalify-btn journalify-btn-subtle",
				text: strings.lightboxOpenNote,
			});
			jumpBtn.addEventListener("click", () => {
				const active = this.slides[this.currentIndex];
				if (active && this.onJumpToNote) {
					this.close();
					this.onJumpToNote(active.filePath);
				}
			});
		}

		const closeBtn = actions.createEl("button", {
			cls: "journalify-icon-btn",
			attr: { "aria-label": strings.lightboxClose },
		});
		setIcon(closeBtn, "x");
		closeBtn.addEventListener("click", () => this.close());

		const stage = contentEl.createDiv({ cls: "journalify-lightbox-stage" });

		if (this.slides.length > 1) {
			const prevBtn = stage.createEl("button", {
				cls: "journalify-lightbox-nav journalify-lightbox-prev",
				attr: { "aria-label": "Previous" },
			});
			setIcon(prevBtn, "chevron-left");
			prevBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.step(-1);
			});
		}

		const imgWrap = stage.createDiv({ cls: "journalify-lightbox-img-wrap" });
		this.imgEl = imgWrap.createEl("img", { cls: "journalify-lightbox-img" });
		this.imgEl.addEventListener("click", () => {
			this.zoomed = !this.zoomed;
			this.imgEl?.toggleClass("is-zoomed", this.zoomed);
		});

		if (this.slides.length > 1) {
			const nextBtn = stage.createEl("button", {
				cls: "journalify-lightbox-nav journalify-lightbox-next",
				attr: { "aria-label": "Next" },
			});
			setIcon(nextBtn, "chevron-right");
			nextBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.step(1);
			});
		}

		this.captionEl = contentEl.createDiv({ cls: "journalify-lightbox-caption" });

		this.scope.register([], "ArrowLeft", () => {
			this.step(-1);
			return false;
		});
		this.scope.register([], "ArrowRight", () => {
			this.step(1);
			return false;
		});

		this.renderCurrentSlide();
	}

	private step(delta: number): void {
		if (this.slides.length <= 1) return;
		this.zoomed = false;
		this.currentIndex = (this.currentIndex + delta + this.slides.length) % this.slides.length;
		this.renderCurrentSlide();
	}

	private renderCurrentSlide(): void {
		const slide = this.slides[this.currentIndex];
		if (!slide || !this.imgEl) return;
		this.imgEl.removeClass("is-zoomed");
		this.imgEl.src = slide.url;
		this.imgEl.alt = slide.caption || slide.dateHeading;

		if (this.counterEl) {
			this.counterEl.setText(
				this.slides.length > 1
					? `${this.currentIndex + 1} / ${this.slides.length}  ·  ${slide.dateHeading}`
					: slide.dateHeading
			);
		}
		if (this.captionEl) {
			this.captionEl.setText(slide.caption || "");
			this.captionEl.toggleClass("is-hidden", !slide.caption);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export function resolveMediaUrl(app: App, src: string, sourceNotePath: string, isExternal: boolean): string | null {
	if (isExternal) return src;
	const clean = src.split("#")[0].trim();
	const dest = app.metadataCache.getFirstLinkpathDest(clean, sourceNotePath);
	if (dest instanceof TFile) {
		return app.vault.getResourcePath(dest);
	}
	const direct = app.vault.getAbstractFileByPath(clean);
	if (direct instanceof TFile) {
		return app.vault.getResourcePath(direct);
	}
	return null;
}
