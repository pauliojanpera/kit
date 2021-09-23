import { Adapter } from '@sveltejs/kit';
import { BuildOptions } from 'esbuild';

interface AdapterOptions {
	assets_prefix?: string,
	scheduled_route?: string,
	esbuild?: (options: BuildOptions) => Promise<BuildOptions> | BuildOptions;
}

declare function plugin(options?: AdapterOptions): Adapter;
export = plugin;
