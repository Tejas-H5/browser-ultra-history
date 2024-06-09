import * as esbuild from 'esbuild';

async function buildEntrypoint(entrypointFilename, env, watch) {
	const minify = env === "prod";
	const ctx = await esbuild.context({
		entryPoints: [`src/${entrypointFilename}.ts`],
		bundle: true,
		outfile: `pages/src/${entrypointFilename}.js`,
		minify: !!minify,
		define: {
			"process.env.ENVIRONMENT": `"${env}"`,
			"process.env.SCRIPT": `"${entrypointFilename}"`,
		}
	});

	if (watch) {
		console.log("watching", entrypointFilename, "...");
		await ctx.watch();
	} else {
		console.log("building ", entrypointFilename, " for ", env, "...");
		try {
			await ctx.rebuild();
		} catch(e) {
			throw e;
		} finally {
			await ctx.dispose();
		}
	}

	return entrypointFilename;
}

export async function build(env, watch = false) {
	const builds = [
		buildEntrypoint("popup-main", env, watch),
		buildEntrypoint("background-main", env, watch),
		buildEntrypoint("content-main", env, watch),
		buildEntrypoint("styles", env, watch),
		buildEntrypoint("index-main", env, watch),
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
