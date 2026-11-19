import { ExtractedMediaItem, MediaKind } from "../types";

const IMAGE_EXTENSIONS = new Set([
	"jpg",
	"jpeg",
	"png",
	"gif",
	"webp",
	"svg",
	"bmp",
	"avif",
	"heic",
]);

const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "wav", "ogg", "oga", "flac", "aac", "opus"]);

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "mkv", "ogv", "m4v"]);

export function classifyMediaTarget(target: string): MediaKind | null {
	const clean = target.split("#")[0].split("?")[0].trim();
	const lower = clean.toLowerCase();

	if (/^https?:\/\/drive\.google\.com\/thumbnail\b/i.test(clean)) {
		return "image";
	}
	if (/^data:image\//i.test(clean)) {
		return "image";
	}

	const dotIdx = lower.lastIndexOf(".");
	if (dotIdx === -1) return null;
	const ext = lower.slice(dotIdx + 1);
	if (IMAGE_EXTENSIONS.has(ext)) return "image";
	if (AUDIO_EXTENSIONS.has(ext)) return "audio";
	if (VIDEO_EXTENSIONS.has(ext)) return "video";
	return null;
}

export function isExternalUrl(src: string): boolean {
	return /^(https?:\/\/|data:|blob:)/i.test(src.trim());
}

export function maskFencedCodeBlocks(markdown: string): string {
	return markdown.replace(/^(?:```|~~~)[\s\S]*?^(?:```|~~~)/gm, (block) =>
		block.replace(/[^\n]/g, " ")
	);
}

export function extractAllMediaFromNote(
	markdownBody: string,
	frontmatterImages: string[] = []
): ExtractedMediaItem[] {
	const results: ExtractedMediaItem[] = [];
	const seenKeys = new Set<string>();

	const pushUnique = (item: ExtractedMediaItem) => {
		const normKey = `${item.kind}:${item.src.trim()}`;
		if (!item.src.trim() || seenKeys.has(normKey)) return;
		seenKeys.add(normKey);
		results.push(item);
	};

	for (const fmImg of frontmatterImages) {
		const cleaned = fmImg.trim();
		if (!cleaned) continue;
		pushUnique({
			kind: "image",
			src: cleaned,
			isExternal: isExternalUrl(cleaned),
			alt: "",
			fromFrontmatter: true,
		});
	}

	const masked = maskFencedCodeBlocks(markdownBody);

	interface RawHit {
		index: number;
		item: ExtractedMediaItem;
	}
	const hits: RawHit[] = [];

	const wikiRegex = /!\[\[([^\]\n]+)\]\]/g;
	let m: RegExpExecArray | null;
	while ((m = wikiRegex.exec(masked)) !== null) {
		const inner = m[1];
		const pipeIdx = inner.indexOf("|");
		const target = (pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)).trim();
		const modifier = pipeIdx === -1 ? "" : inner.slice(pipeIdx + 1).trim();
		const kind = classifyMediaTarget(target);
		if (!kind) continue;
		const alt = /^\d+(?:x\d+)?$/.test(modifier) ? "" : modifier;
		hits.push({
			index: m.index,
			item: {
				kind,
				src: target,
				isExternal: isExternalUrl(target),
				alt,
				fromFrontmatter: false,
			},
		});
	}

	const mdImgRegex = /!\[([^\]]*)\]\(([^)\n]+)\)/g;
	while ((m = mdImgRegex.exec(masked)) !== null) {
		const alt = m[1].trim();
		let rawUrl = m[2].trim();
		if (rawUrl.startsWith("<") && rawUrl.includes(">")) {
			rawUrl = rawUrl.slice(1, rawUrl.indexOf(">"));
		} else {
			rawUrl = rawUrl.replace(/\s+["'][^"']*["']$/, "").trim();
		}
		const kind = classifyMediaTarget(rawUrl) ?? (isExternalUrl(rawUrl) ? "image" : null);
		if (!kind) continue;
		hits.push({
			index: m.index,
			item: {
				kind,
				src: rawUrl,
				isExternal: isExternalUrl(rawUrl),
				alt,
				fromFrontmatter: false,
			},
		});
	}

	const htmlImgRegex = /<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi;
	while ((m = htmlImgRegex.exec(masked)) !== null) {
		const fullTag = m[0];
		const src = m[1].trim();
		const altMatch = /\balt=["']([^"']*)["']/i.exec(fullTag);
		const alt = altMatch ? altMatch[1].trim() : "";
		hits.push({
			index: m.index,
			item: {
				kind: "image",
				src,
				isExternal: isExternalUrl(src),
				alt,
				fromFrontmatter: false,
				rawHtmlSrc: src,
			},
		});
	}

	hits.sort((a, b) => a.index - b.index);
	for (const h of hits) {
		pushUnique(h.item);
	}

	return results;
}
