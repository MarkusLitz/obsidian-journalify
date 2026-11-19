import { classifyMediaTarget } from "./mediaExtractor";

export interface PreparedCardPreview {
	previewMarkdown: string;
	expandedMarkdown: string;
	isFolded: boolean;
	isCompletelyEmpty: boolean;
}

export function stripExtractedMediaFromBody(
	markdownBody: string,
	stripImages: boolean,
	stripAudioVideo = true
): string {
	const lines = markdownBody.split(/\r?\n/);
	let inFence = false;
	let fenceMarker = "";

	const processedLines = lines.map((line) => {
		const fenceMatch = /^(\s*)(```+|~~~+)/.exec(line);
		if (fenceMatch) {
			const marker = fenceMatch[2].slice(0, 3);
			if (!inFence) {
				inFence = true;
				fenceMarker = marker;
			} else if (marker === fenceMarker) {
				inFence = false;
				fenceMarker = "";
			}
			return line;
		}
		if (inFence) return line;

		let updated = line;

		updated = updated.replace(/!\[\[([^\]\n]+)\]\]/g, (full, inner: string) => {
			const target = inner.split("|")[0].trim();
			const kind = classifyMediaTarget(target);
			if (kind === "image" && stripImages) return "";
			if ((kind === "audio" || kind === "video") && stripAudioVideo) return "";
			return full;
		});

		updated = updated.replace(/!\[([^\]]*)\]\(([^)\n]+)\)/g, (full, _alt: string, urlPart: string) => {
			const cleanUrl = urlPart.replace(/\s+["'][^"']*["']$/, "").replace(/^<|>$/g, "").trim();
			const kind = classifyMediaTarget(cleanUrl) ?? (/^https?:\/\//i.test(cleanUrl) ? "image" : null);
			if (kind === "image" && stripImages) return "";
			if ((kind === "audio" || kind === "video") && stripAudioVideo) return "";
			return full;
		});

		if (stripImages) {
			updated = updated.replace(/<img\b[^>]*>/gi, "");
		}

		return updated;
	});

	let joined = processedLines.join("\n");

	if (stripImages) {
		joined = joined.replace(/<a\b[^>]*>\s*<\/a>/gi, "");
		joined = joined.replace(/<div\b[^>]*>\s*<\/div>/gi, "");
	}

	joined = joined.replace(/\n{3,}/g, "\n\n").trim();
	return joined;
}

export interface FoldOptions {
	aggregateInlineImages: boolean;
	collapseLongEntries: boolean;
	collapseMaxLines: number;
	collapseAfterHr: boolean;
	hasAnyMedia: boolean;
}

export function prepareCardBodyContent(
	rawBody: string,
	options: FoldOptions
): PreparedCardPreview {
	const cleanedFull = stripExtractedMediaFromBody(rawBody, options.aggregateInlineImages, true);
	const isCompletelyEmpty = cleanedFull.trim().length === 0 && !options.hasAnyMedia;

	if (cleanedFull.trim().length === 0) {
		return {
			previewMarkdown: "",
			expandedMarkdown: "",
			isFolded: false,
			isCompletelyEmpty,
		};
	}

	let preview = cleanedFull;
	let isFolded = false;

	if (options.collapseAfterHr) {
		const lines = preview.split("\n");
		let inFence = false;
		let hrLineIndex = -1;
		let nonEmptyBeforeHr = 0;

		for (let i = 0; i < lines.length; i++) {
			const trimmed = lines[i].trim();
			if (/^(```|~~~)/.test(trimmed)) {
				inFence = !inFence;
				continue;
			}
			if (!inFence && /^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
				if (nonEmptyBeforeHr > 0 && i < lines.length - 1) {
					hrLineIndex = i;
					break;
				}
			} else if (trimmed.length > 0) {
				nonEmptyBeforeHr++;
			}
		}

		if (hrLineIndex !== -1) {
			const afterContent = lines.slice(hrLineIndex + 1).join("\n").trim();
			if (afterContent.length > 0) {
				preview = lines.slice(0, hrLineIndex).join("\n").trim();
				isFolded = true;
			}
		}
	}

	if (options.collapseLongEntries && options.collapseMaxLines > 0) {
		const lines = preview.split("\n");
		if (lines.length > options.collapseMaxLines) {
			let cutIdx = options.collapseMaxLines;
			let inFence = false;
			for (let i = 0; i < cutIdx; i++) {
				if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence;
			}
			while (inFence && cutIdx < lines.length) {
				if (/^\s*(```|~~~)/.test(lines[cutIdx])) {
					inFence = false;
				}
				cutIdx++;
			}
			if (cutIdx < lines.length) {
				preview = lines.slice(0, cutIdx).join("\n").trim();
				isFolded = true;
			}
		}
	}

	return {
		previewMarkdown: preview,
		expandedMarkdown: cleanedFull,
		isFolded,
		isCompletelyEmpty,
	};
}

const TASK_LINE_REGEX = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([^\]])(\]\s*.*)$/;

export function toggleNthTaskInBody(
	markdownBody: string,
	taskOccurrenceIndex: number,
	checked?: boolean
): { updatedBody: string; changed: boolean } {
	const lines = markdownBody.split(/\r?\n/);
	let inFence = false;
	let currentTaskIdx = 0;
	let changed = false;

	const outLines = lines.map((line) => {
		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
			return line;
		}
		if (inFence) return line;

		const m = TASK_LINE_REGEX.exec(line);
		if (!m) return line;

		if (currentTaskIdx === taskOccurrenceIndex) {
			currentTaskIdx++;
			const currentChar = m[2];
			const isCurrentlyChecked = currentChar.trim().length > 0;
			const targetChecked = checked !== undefined ? checked : !isCurrentlyChecked;
			const nextChar = targetChecked ? "x" : " ";
			if (nextChar !== currentChar) {
				changed = true;
			}
			return `${m[1]}${nextChar}${m[3]}`;
		}

		currentTaskIdx++;
		return line;
	});

	return {
		updatedBody: outLines.join("\n"),
		changed,
	};
}
