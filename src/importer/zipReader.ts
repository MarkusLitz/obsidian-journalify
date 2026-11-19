export interface ZipEntryInfo {
	name: string;
	compressionMethod: number;
	compressedSize: number;
	uncompressedSize: number;
	localHeaderOffset: number;
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL_DIR = 0x02014b50;
const SIG_LOCAL_FILE = 0x04034b50;

const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const LEN_BASE = [
	3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115,
	131, 163, 195, 227, 258,
];
const LEN_EXTRA = [
	0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
	1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537,
	2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
	0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12,
	13, 13,
];

interface HuffmanTable {
	counts: Int32Array;
	symbols: Int32Array;
}

function buildHuffmanTable(lengths: ArrayLike<number>): HuffmanTable {
	const maxBits = 15;
	const counts = new Int32Array(maxBits + 1);
	for (let i = 0; i < lengths.length; i++) {
		const len = lengths[i];
		if (len > 0) counts[len]++;
	}
	const offsets = new Int32Array(maxBits + 1);
	let total = 0;
	for (let bits = 1; bits <= maxBits; bits++) {
		offsets[bits] = total;
		total += counts[bits];
	}
	const symbols = new Int32Array(Math.max(1, total));
	for (let sym = 0; sym < lengths.length; sym++) {
		const len = lengths[sym];
		if (len > 0) {
			symbols[offsets[len]++] = sym;
		}
	}
	return { counts, symbols };
}

const FIXED_LIT_LENGTHS = (() => {
	const arr = new Uint8Array(288);
	for (let i = 0; i <= 143; i++) arr[i] = 8;
	for (let i = 144; i <= 255; i++) arr[i] = 9;
	for (let i = 256; i <= 279; i++) arr[i] = 7;
	for (let i = 280; i <= 287; i++) arr[i] = 8;
	return arr;
})();

const FIXED_DIST_LENGTHS = (() => {
	const arr = new Uint8Array(32);
	arr.fill(5);
	return arr;
})();

const FIXED_LIT_TABLE = buildHuffmanTable(FIXED_LIT_LENGTHS);
const FIXED_DIST_TABLE = buildHuffmanTable(FIXED_DIST_LENGTHS);

export function inflateRawSync(src: Uint8Array, expectedSize = 0): Uint8Array {
	let bytePos = 0;
	let bitBuf = 0;
	let bitCount = 0;

	const ensureBits = (n: number) => {
		while (bitCount < n) {
			const nextByte = bytePos < src.length ? src[bytePos++] : 0;
			bitBuf |= nextByte << bitCount;
			bitCount += 8;
		}
	};

	const readBits = (n: number): number => {
		if (n === 0) return 0;
		ensureBits(n);
		const val = bitBuf & ((1 << n) - 1);
		bitBuf >>>= n;
		bitCount -= n;
		return val;
	};

	const decodeSymbol = (table: HuffmanTable): number => {
		let code = 0;
		let first = 0;
		let index = 0;
		for (let len = 1; len <= 15; len++) {
			ensureBits(1);
			code |= bitBuf & 1;
			bitBuf >>>= 1;
			bitCount -= 1;
			const count = table.counts[len];
			if (code - count < first) {
				return table.symbols[index + (code - first)];
			}
			index += count;
			first = (first + count) << 1;
			code <<= 1;
		}
		throw new Error("Invalid DEFLATE Huffman code.");
	};

	let out = new Uint8Array(Math.max(256, expectedSize || src.length * 3));
	let outPos = 0;

	const ensureOutCapacity = (extra: number) => {
		if (outPos + extra <= out.length) return;
		let nextLen = out.length * 2;
		while (nextLen < outPos + extra) nextLen *= 2;
		const grown = new Uint8Array(nextLen);
		grown.set(out.subarray(0, outPos));
		out = grown;
	};

	let isFinal = 0;
	while (!isFinal) {
		isFinal = readBits(1);
		const btype = readBits(2);

		if (btype === 0) {
			bitBuf = 0;
			bitCount = 0;
			if (bytePos + 4 > src.length) throw new Error("Truncated uncompressed DEFLATE block.");
			const len = src[bytePos] | (src[bytePos + 1] << 8);
			bytePos += 4;
			ensureOutCapacity(len);
			out.set(src.subarray(bytePos, bytePos + len), outPos);
			outPos += len;
			bytePos += len;
			continue;
		}

		let litTable: HuffmanTable;
		let distTable: HuffmanTable;

		if (btype === 1) {
			litTable = FIXED_LIT_TABLE;
			distTable = FIXED_DIST_TABLE;
		} else if (btype === 2) {
			const hlit = readBits(5) + 257;
			const hdist = readBits(5) + 1;
			const hclen = readBits(4) + 4;

			const clLengths = new Uint8Array(19);
			for (let i = 0; i < hclen; i++) {
				clLengths[CL_ORDER[i]] = readBits(3);
			}
			const clTable = buildHuffmanTable(clLengths);

			const totalCodes = hlit + hdist;
			const lengths = new Uint8Array(totalCodes);
			let idx = 0;
			while (idx < totalCodes) {
				const sym = decodeSymbol(clTable);
				if (sym < 16) {
					lengths[idx++] = sym;
				} else if (sym === 16) {
					const prev = idx > 0 ? lengths[idx - 1] : 0;
					const rep = 3 + readBits(2);
					for (let r = 0; r < rep && idx < totalCodes; r++) lengths[idx++] = prev;
				} else if (sym === 17) {
					const rep = 3 + readBits(3);
					for (let r = 0; r < rep && idx < totalCodes; r++) lengths[idx++] = 0;
				} else if (sym === 18) {
					const rep = 11 + readBits(7);
					for (let r = 0; r < rep && idx < totalCodes; r++) lengths[idx++] = 0;
				}
			}

			litTable = buildHuffmanTable(lengths.subarray(0, hlit));
			distTable = buildHuffmanTable(lengths.subarray(hlit, totalCodes));
		} else {
			throw new Error(`Invalid DEFLATE block type: ${btype}`);
		}

		while (true) {
			const sym = decodeSymbol(litTable);
			if (sym === 256) break;
			if (sym < 256) {
				ensureOutCapacity(1);
				out[outPos++] = sym;
			} else {
				const lenIdx = sym - 257;
				const length = LEN_BASE[lenIdx] + readBits(LEN_EXTRA[lenIdx]);
				const distSym = decodeSymbol(distTable);
				const distance = DIST_BASE[distSym] + readBits(DIST_EXTRA[distSym]);

				ensureOutCapacity(length);
				let copySrc = outPos - distance;
				for (let k = 0; k < length; k++) {
					out[outPos++] = out[copySrc++];
				}
			}
		}
	}

	return out.subarray(0, outPos);
}

export class ZipArchive {
	private bytes: Uint8Array;
	private view: DataView;
	private entries: Map<string, ZipEntryInfo> = new Map();
	private lowerCaseMap: Map<string, string> = new Map();

	constructor(buffer: ArrayBuffer | Uint8Array) {
		this.bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
		this.view = new DataView(
			this.bytes.buffer,
			this.bytes.byteOffset,
			this.bytes.byteLength
		);
		this.parseCentralDirectory();
	}

	private parseCentralDirectory(): void {
		const len = this.bytes.byteLength;
		if (len < 22) {
			throw new Error("Invalid ZIP archive: file too small.");
		}

		const minPos = Math.max(0, len - 65557);
		let eocdOffset = -1;
		for (let pos = len - 22; pos >= minPos; pos--) {
			if (this.view.getUint32(pos, true) === SIG_EOCD) {
				eocdOffset = pos;
				break;
			}
		}
		if (eocdOffset < 0) {
			throw new Error("Invalid ZIP archive: End of Central Directory not found.");
		}

		const totalEntries = this.view.getUint16(eocdOffset + 10, true);
		const cdOffset = this.view.getUint32(eocdOffset + 16, true);

		const decoder = new TextDecoder("utf-8");
		let ptr = cdOffset;

		for (let i = 0; i < totalEntries && ptr + 46 <= len; i++) {
			const sig = this.view.getUint32(ptr, true);
			if (sig !== SIG_CENTRAL_DIR) break;

			const compressionMethod = this.view.getUint16(ptr + 10, true);
			const compressedSize = this.view.getUint32(ptr + 20, true);
			const uncompressedSize = this.view.getUint32(ptr + 24, true);
			const fileNameLen = this.view.getUint16(ptr + 28, true);
			const extraLen = this.view.getUint16(ptr + 30, true);
			const commentLen = this.view.getUint16(ptr + 32, true);
			const localHeaderOffset = this.view.getUint32(ptr + 42, true);

			const nameBytes = this.bytes.subarray(ptr + 46, ptr + 46 + fileNameLen);
			const rawName = decoder.decode(nameBytes).replace(/\\/g, "/").replace(/^\/+/, "");

			if (!rawName.endsWith("/")) {
				const info: ZipEntryInfo = {
					name: rawName,
					compressionMethod,
					compressedSize,
					uncompressedSize,
					localHeaderOffset,
				};
				this.entries.set(rawName, info);
				this.lowerCaseMap.set(rawName.toLowerCase(), rawName);
			}

			ptr += 46 + fileNameLen + extraLen + commentLen;
		}
	}

	listFiles(): string[] {
		return Array.from(this.entries.keys());
	}

	private resolveEntry(path: string): ZipEntryInfo | undefined {
		const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
		const direct = this.entries.get(normalized);
		if (direct) return direct;

		const lower = this.lowerCaseMap.get(normalized.toLowerCase());
		return lower ? this.entries.get(lower) : undefined;
	}

	hasFile(path: string): boolean {
		return Boolean(this.resolveEntry(path));
	}

	async readBytes(path: string): Promise<Uint8Array> {
		const entry = this.resolveEntry(path);
		if (!entry) {
			throw new Error(`ZIP entry not found: ${path}`);
		}

		const ptr = entry.localHeaderOffset;
		if (ptr + 30 > this.bytes.byteLength) {
			throw new Error(`Corrupt local header offset for ${entry.name}`);
		}
		const sig = this.view.getUint32(ptr, true);
		if (sig !== SIG_LOCAL_FILE) {
			throw new Error(`Invalid local file header for ${entry.name}`);
		}

		const fileNameLen = this.view.getUint16(ptr + 26, true);
		const extraLen = this.view.getUint16(ptr + 28, true);
		const dataStart = ptr + 30 + fileNameLen + extraLen;
		const dataEnd = dataStart + entry.compressedSize;
		const slice = this.bytes.subarray(dataStart, dataEnd);

		if (entry.compressionMethod === 0) {
			return new Uint8Array(slice);
		}
		if (entry.compressionMethod === 8) {
			return inflateRawSync(slice, entry.uncompressedSize);
		}
		throw new Error(
			`Unsupported ZIP compression method (${entry.compressionMethod}) for ${entry.name}`
		);
	}

	async readText(path: string): Promise<string> {
		const bytes = await this.readBytes(path);
		return new TextDecoder("utf-8").decode(bytes);
	}
}
