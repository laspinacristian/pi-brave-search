import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { onlySites, plainText, queryString, render } from "../extensions/search.ts";

describe("requests", () => {
	test("leave unset parameters out of the query string", () => {
		assert.equal(queryString({ q: "rust async", count: 5, freshness: undefined }), "q=rust+async&count=5");
	});

	test("restrict results to sites with a Goggle", () => {
		assert.equal(onlySites(["docs.rs", "doc.rust-lang.org"]), "$discard\n$boost=1,site=docs.rs\n$boost=1,site=doc.rust-lang.org");
		assert.equal(onlySites([]), undefined);
	});
});

describe("plainText", () => {
	test("strips tags and decodes entities", () => {
		assert.equal(plainText("Use <strong>pg_combinebackup</strong> &amp; it&#39;s &#x2014; done"), "Use pg_combinebackup & it's — done");
	});
});

describe("render", () => {
	test("web: source line with date, then the passages", () => {
		const data = {
			grounding: { generic: [{ url: "https://a.dev/x", title: "A &amp; B", snippets: ["one", "two"] }] },
			sources: { "https://a.dev/x": { age: ["Monday", "2026-10-05", "1 day ago"] } },
		};
		assert.deepEqual(render.web(data), ["--- [1] A & B\nhttps://a.dev/x (2026-10-05)\n\none\n\ntwo"]);
	});

	test("news: outlet and age, description and extra snippets", () => {
		const data = { results: [{ title: "T", url: "https://n.it/1", meta_url: { hostname: "n.it" }, age: "2 hours ago", description: "<strong>D</strong>", extra_snippets: ["E"] }] };
		assert.deepEqual(render.news(data), ["--- [1] T\nhttps://n.it/1 · n.it · 2 hours ago\n\nD\n\nE"]);
	});

	test("videos: duration, channel and views", () => {
		const data = { results: [{ title: "V", url: "https://youtu.be/x", video: { duration: "13:57", creator: "C", views: 88110 } }] };
		assert.deepEqual(render.videos(data), ["--- [1] V\nhttps://youtu.be/x · 13:57 · C · 88K views"]);
	});

	test("images: image URL with size, and its page", () => {
		const data = { results: [{ title: "I", url: "https://p.com", properties: { url: "https://p.com/i.png", width: 320, height: 240 } }] };
		assert.deepEqual(render.images(data), ["--- [1] I\nhttps://p.com/i.png (320×240)\nfrom https://p.com"]);
	});
});
