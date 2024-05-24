import * as esbuild from 'esbuild';

async function buildEntrypoint(entrypointFilename, env) {
	console.log("building ", entrypointFilename, " for ", env, "...");

	const minify = env === "prod";
	await esbuild.build({
		entryPoints: [`src/${entrypointFilename}.ts`],
		bundle: true,
		outfile: `dist/${entrypointFilename}.js`,
		minify: !!minify,
		define: {
			"process.env.ENVIRONMENT": `"${env}"`,
			"process.env.SCRIPT": `"${entrypointFilename}"`,
		}
	});
}

export async function build(env) {
	await buildEntrypoint("popup-main", env);
	await buildEntrypoint("background-main", env);
	await buildEntrypoint("content-main", env);

	console.log("DONE!");
}
