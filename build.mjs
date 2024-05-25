import * as esbuild from 'esbuild';

async function buildEntrypoint(entrypointFilename, env) {
	console.log("building ", entrypointFilename, " for ", env, "...");

	const minify = env === "prod";
	await esbuild.build({
		entryPoints: [`src/${entrypointFilename}.ts`],
		bundle: true,
		outfile: `pages/src/${entrypointFilename}.js`,
		minify: !!minify,
		define: {
			"process.env.ENVIRONMENT": `"${env}"`,
			"process.env.SCRIPT": `"${entrypointFilename}"`,
		}
	});

	return entrypointFilename;
}

export async function build(env) {
	const builds = [
		buildEntrypoint("popup-main", env),
		buildEntrypoint("background-main", env),
		buildEntrypoint("content-main", env),
		buildEntrypoint("styles", env),
		buildEntrypoint("index-main", env),
	];

	const results = await Promise.allSettled(builds);
	for (const res of results) {
		if (res.status === "rejected") {
			console.log("Build failed:", res.reason);
		} else {
			console.log("Build succeeded:", res.value);
		}
	}

	console.log("DONE!");
}
