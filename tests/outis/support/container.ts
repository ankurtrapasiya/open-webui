import { execFileSync } from 'node:child_process';

// The test container (started by scripts/outis-regression.sh) and its image, for checks that
// look inside the image or start a second, differently configured instance.
export function container(): string {
	const name = process.env.OUTIS_CONTAINER;
	if (!name) throw new Error('OUTIS_CONTAINER is not set; run the suite through scripts/outis-regression.sh');
	return name;
}

export function image(): string {
	const img = process.env.OUTIS_IMAGE;
	if (!img) throw new Error('OUTIS_IMAGE is not set; run the suite through scripts/outis-regression.sh');
	return img;
}

// Runs a command inside the test container and returns stdout.
export function inContainer(args: string[], opts: { workdir?: string; allowFail?: boolean } = {}): string {
	try {
		return execFileSync('docker', ['exec', ...(opts.workdir ? ['-w', opts.workdir] : []), container(), ...args], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		});
	} catch (e: any) {
		if (opts.allowFail) return e.stdout ?? '';
		throw new Error(`docker exec ${args.join(' ')} failed: ${e.stderr ?? e.message}`);
	}
}

// Runs Python inside the container with the backend importable, and parses its JSON output.
export function python<T = unknown>(code: string): T {
	const out = inContainer(['python', '-c', code], { workdir: '/app/backend' });
	const last = out.trim().split('\n').pop()!;
	return JSON.parse(last) as T;
}

// True if some file of the built frontend contains the text.
export function bundleContains(text: string): boolean {
	const out = inContainer(['grep', '-rlF', '--include=*.js', text, '/app/build'], { allowFail: true });
	return out.trim().length > 0;
}
