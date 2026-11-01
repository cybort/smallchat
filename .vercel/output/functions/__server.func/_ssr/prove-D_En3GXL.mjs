import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/prove-D_En3GXL.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var proveSockets_createServerFn_handler = createServerRpc({
	id: "b9af0695afd87b7f3eb911e01f2d3f448b280198bda37e48a2838009c1aa1d8b",
	name: "proveSockets",
	filename: "src/lib/xianhua/prove.ts"
}, (opts) => proveSockets.__executeServer(opts));
var proveSockets = createServerFn({ method: "POST" }).validator((data) => {
	if (data.profile !== "talk" && data.profile !== "dense") throw new Error("档位不对");
	if (typeof data.payload !== "string" || data.payload.length < 1 || data.payload.length > 2e3) throw new Error("内容太短或太长");
	return {
		profile: data.profile,
		payload: data.payload
	};
}).handler(proveSockets_createServerFn_handler, async ({ data }) => {
	const { proveTcp } = await import("./node-host.server-dSO1w_O2.mjs");
	return proveTcp(data.profile, data.payload);
});
//#endregion
export { proveSockets_createServerFn_handler };
