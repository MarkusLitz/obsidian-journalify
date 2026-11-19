export interface SplitNoteContent {
	frontmatterBlock: string;
	body: string;
	frontmatterLineCount: number;
}

const FRONTMATTER_REGEX = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

export function splitFrontmatterAndBody(rawMarkdown: string): SplitNoteContent {
	if (!rawMarkdown.startsWith("---\n") && !rawMarkdown.startsWith("---\r\n")) {
		return {
			frontmatterBlock: "",
			body: rawMarkdown,
			frontmatterLineCount: 0,
		};
	}

	const emptyMatch = /^---\r?\n---(?:\r?\n|$)/.exec(rawMarkdown);
	if (emptyMatch) {
		const block = emptyMatch[0];
		const lines = block.endsWith("\n")
			? block.split(/\r?\n/).length - 1
			: block.split(/\r?\n/).length;
		return {
			frontmatterBlock: block,
			body: rawMarkdown.slice(block.length),
			frontmatterLineCount: lines,
		};
	}

	const match = FRONTMATTER_REGEX.exec(rawMarkdown);
	if (!match) {
		return {
			frontmatterBlock: "",
			body: rawMarkdown,
			frontmatterLineCount: 0,
		};
	}

	const block = match[0];
	const lines = block.endsWith("\n")
		? block.split(/\r?\n/).length - 1
		: block.split(/\r?\n/).length;

	return {
		frontmatterBlock: block,
		body: rawMarkdown.slice(block.length),
		frontmatterLineCount: lines,
	};
}

export function combineFrontmatterAndBody(frontmatterBlock: string, newBody: string): string {
	if (!frontmatterBlock) {
		return newBody;
	}
	const ensuredBlock = frontmatterBlock.endsWith("\n")
		? frontmatterBlock
		: `${frontmatterBlock}\n`;
	return `${ensuredBlock}${newBody}`;
}

export function formatYamlScalar(val: string | number | boolean): string {
	if (typeof val === "boolean" || typeof val === "number") {
		return String(val);
	}
	const trimmed = val.trim();
	if (
		trimmed === "" ||
		/[:#[\]{}&*!|>'"%@`\n\r]/.test(trimmed) ||
		/^(true|false|null|~|\d+(\.\d+)?)$/i.test(trimmed)
	) {
		return `"${trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
	}
	return trimmed;
}

export function serializeYamlFrontmatter(fields: Record<string, unknown>): string {
	const lines: string[] = ["---"];
	for (const [key, val] of Object.entries(fields)) {
		if (val === undefined || val === null || val === "") continue;
		if (Array.isArray(val)) {
			if (val.length === 0) continue;
			lines.push(`${key}:`);
			for (const item of val) {
				lines.push(`  - ${formatYamlScalar(String(item))}`);
			}
		} else if (typeof val === "boolean" || typeof val === "number") {
			lines.push(`${key}: ${val}`);
		} else {
			lines.push(`${key}: ${formatYamlScalar(String(val))}`);
		}
	}
	lines.push("---", "");
	return lines.join("\n");
}
