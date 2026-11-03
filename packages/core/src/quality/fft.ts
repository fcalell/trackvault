// In-place iterative radix-2 FFT with cached twiddles and bit reversal.
export class FFT {
	readonly size: number;
	private readonly cos: Float64Array;
	private readonly sin: Float64Array;
	private readonly rev: Uint32Array;

	constructor(size: number) {
		if (size < 2 || (size & (size - 1)) !== 0)
			throw new Error("FFT size must be a power of two");
		this.size = size;
		this.cos = new Float64Array(size / 2);
		this.sin = new Float64Array(size / 2);
		for (let i = 0; i < size / 2; i++) {
			this.cos[i] = Math.cos((2 * Math.PI * i) / size);
			this.sin[i] = -Math.sin((2 * Math.PI * i) / size);
		}
		this.rev = new Uint32Array(size);
		const bits = Math.log2(size);
		for (let i = 0; i < size; i++) {
			let r = 0;
			for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
			this.rev[i] = r;
		}
	}

	transform(re: Float64Array, im: Float64Array): void {
		const n = this.size;
		for (let i = 0; i < n; i++) {
			const j = this.rev[i] as number;
			if (j > i) {
				const tr = re[i] as number;
				re[i] = re[j] as number;
				re[j] = tr;
				const ti = im[i] as number;
				im[i] = im[j] as number;
				im[j] = ti;
			}
		}
		for (let len = 2; len <= n; len <<= 1) {
			const half = len >> 1;
			const step = n / len;
			for (let start = 0; start < n; start += len) {
				for (let k = 0; k < half; k++) {
					const wr = this.cos[k * step] as number;
					const wi = this.sin[k * step] as number;
					const a = start + k;
					const b = a + half;
					const xr = (re[b] as number) * wr - (im[b] as number) * wi;
					const xi = (re[b] as number) * wi + (im[b] as number) * wr;
					re[b] = (re[a] as number) - xr;
					im[b] = (im[a] as number) - xi;
					re[a] = (re[a] as number) + xr;
					im[a] = (im[a] as number) + xi;
				}
			}
		}
	}
}

export interface Spectrum {
	// Mean power per bin (0..size/2), linear.
	power: Float64Array;
	frames: number;
	binHz: number;
}

// Hann-windowed mean power spectrum of mono float samples.
export function meanSpectrum(
	samples: Float32Array,
	sampleRate: number,
	size = 4096,
	hop = size / 2,
	into?: Spectrum,
): Spectrum {
	const fft = new FFT(size);
	const window = new Float64Array(size);
	for (let i = 0; i < size; i++)
		window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
	const re = new Float64Array(size);
	const im = new Float64Array(size);
	const power = into?.power ?? new Float64Array(size / 2 + 1);
	let frames = into?.frames ?? 0;
	for (let off = 0; off + size <= samples.length; off += hop) {
		for (let i = 0; i < size; i++) {
			re[i] = (samples[off + i] as number) * (window[i] as number);
			im[i] = 0;
		}
		fft.transform(re, im);
		for (let k = 0; k <= size / 2; k++) {
			power[k] =
				(power[k] as number) +
				((re[k] as number) ** 2 + (im[k] as number) ** 2) / (size * size);
		}
		frames++;
	}
	return { power, frames, binHz: sampleRate / size };
}
