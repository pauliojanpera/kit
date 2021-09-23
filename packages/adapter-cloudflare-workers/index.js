import fs from 'fs';
import { execSync } from 'child_process';
import esbuild from 'esbuild';
import toml from '@iarna/toml';
import { generate_worker } from './worker_generator.js';

/**
 * @typedef {import('esbuild').BuildOptions} BuildOptions
 */

/** @type {import('.')} */
export default function ({
	assets_prefix = '',
	scheduled_route = '',
	esbuild: esbuild_config = undefined
}) {
	return {
		name: '@sveltejs/adapter-cloudflare-workers',

		async adapt({ utils }) {
			const { site } = validate_config(utils);

			const bucket = site['bucket'];
			const entrypoint = site['entry-point'] || 'workers-site';

			utils.rimraf(bucket);
			utils.rimraf(entrypoint);

			const worker_path = '.svelte-kit/cloudflare-workers';

			utils.log.minor('Generating worker...');
			/** @type {BuildOptions} */
			const default_build_options = {
				...generate_worker({
					// TODO hardcoding the relative location makes this brittle
					app_js_path: '../output/server/app.js',
					worker_path,
					assets_prefix,
					scheduled_route
				}),
				outfile: `${entrypoint}/index.js`
			};

			// TODO would be cool if we could make this step unnecessary somehow
			utils.log.info('Installing worker dependencies...');
			const stdout = execSync('npm install', { cwd: worker_path });
			utils.log.info(stdout.toString());

			const build_options = esbuild_config
				? await esbuild_config(default_build_options)
				: default_build_options;

			await esbuild.build(build_options);

			fs.writeFileSync(`${entrypoint}/package.json`, JSON.stringify({ main: 'index.js' }));

			utils.log.info('Prerendering static pages...');
			await utils.prerender({
				dest: bucket
			});

			utils.log.minor('Copying assets...');
			utils.copy_static_files(bucket + assets_prefix);
			utils.copy_client_files(bucket + assets_prefix);
		}
	};
}

function validate_config(utils) {
	if (fs.existsSync('wrangler.toml')) {
		let wrangler_config;

		try {
			wrangler_config = toml.parse(fs.readFileSync('wrangler.toml', 'utf-8'));
		} catch (err) {
			err.message = `Error parsing wrangler.toml: ${err.message}`;
			throw err;
		}

		if (!wrangler_config.site || !wrangler_config.site['bucket']) {
			throw new Error(
				'You must specify site.bucket in wrangler.toml. Consult https://developers.cloudflare.com/workers/platform/sites/configuration'
			);
		}

		return wrangler_config;
	}

	utils.log.error(
		'Consult https://developers.cloudflare.com/workers/platform/sites/configuration on how to setup your site'
	);

	utils.log(
		`
		Sample wrangler.toml:

		name = "<your-site-name>"
		type = "javascript"
		account_id = "<your-account-id>"
		workers_dev = true
		route = ""
		zone_id = ""

		[site]
		bucket = "./.cloudflare/assets"
		entry-point = "./.cloudflare/worker"`
			.replace(/^\t+/gm, '')
			.trim()
	);

	throw new Error('Missing a wrangler.toml file');
}
