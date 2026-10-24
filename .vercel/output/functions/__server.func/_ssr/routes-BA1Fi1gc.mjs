import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-BA1Fi1gc.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function Home() {
	const frame = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		const node = frame.current;
		if (!node) return;
		const focus = () => node.focus();
		node.addEventListener("load", focus);
		const onKey = (event) => {
			const target = node.contentWindow;
			if (!target) return;
			target.postMessage({
				type: "key",
				down: event.type === "keydown",
				code: event.code
			}, window.location.origin);
		};
		window.addEventListener("keydown", onKey);
		window.addEventListener("keyup", onKey);
		return () => {
			node.removeEventListener("load", focus);
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("keyup", onKey);
		};
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "fixed inset-0 bg-[#0E1314]",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("iframe", {
			ref: frame,
			title: "赵王城 · 黄昏第一版",
			src: "/zhaowangcheng.html",
			className: "h-full w-full border-0",
			tabIndex: 0
		})
	});
}
//#endregion
export { Home as component };
