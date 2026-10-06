import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { SEARCH_TYPES, type SearchType, search } from "./search.ts";

const parameters = Type.Object({
	query: Type.String({
		description:
			'A precise question or keywords. Include versions, error messages and names verbatim. Operators: "exact phrase", -exclude, site:example.com, filetype:pdf, intitle:word, lang:it, OR.',
	}),
	type: Type.Optional(StringEnum(SEARCH_TYPES, { description: "web (default): passages from web pages; news: recent articles from news outlets" })),
	tokens: Type.Optional(
		Type.Integer({
			minimum: 1024,
			maximum: 32768,
			description: "web only: approximate size of the result. 1024 for a quick fact, 4096 (default) for most questions, 8192-16384 for in-depth research",
		}),
	),
	count: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: "Maximum number of sources or results (default: 20 for web, 10 for news)" })),
	freshness: Type.Optional(Type.String({ description: "Only recent results: pd (24 hours), pw (week), pm (month), py (year), or a range like 2025-01-01to2025-06-30" })),
	country: Type.Optional(Type.String({ description: "Two-letter country code of the results, e.g. IT (default: US)" })),
	language: Type.Optional(Type.String({ description: "Language of the results, e.g. it (default: en)" })),
	sites: Type.Optional(Type.Array(Type.String(), { description: "Search only these domains, e.g. ['docs.rs', 'doc.rust-lang.org']" })),
});

interface Details {
	type: SearchType;
	results: number;
}

export default function braveSearch(pi: ExtensionAPI) {
	pi.registerTool<typeof parameters, Details>({
		name: "brave_search",
		label: "Brave Search",
		description: [
			"Search the web with Brave.",
			"type 'web' (default) returns, for each source, the passages most relevant to the query, already extracted from the page (text, code, tables): usually enough to answer without opening any page.",
			"type 'news' returns recent articles from news outlets.",
			"Each result comes with its URL and publication date, to cite it or to read the whole page or a video transcript by fetching its URL.",
			"Results default to the US and English: set country and language for topics tied to a country or language.",
		].join(" "),
		promptSnippet: "Search the web with Brave: relevant passages from many sources in one call, or recent news",
		promptGuidelines: [
			"Use brave_search when the answer depends on information that may be newer than your training data, or that you are not sure about.",
			"When a search concerns a country or a language other than the US and English (the user's, or the topic's), set its country and language parameters.",
		],
		parameters,
		annotations: { readOnlyHint: true, openWorldHint: true },

		async execute(_toolCallId, params, signal) {
			const apiKey = process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY;
			if (!apiKey) {
				throw new Error('BRAVE_API_KEY is not set. Create a key at https://api-dashboard.search.brave.com ("Free AI" plan) and export it in the environment Pi runs in.');
			}
			const results = await search(params, apiKey, signal);
			return {
				content: [{ type: "text", text: results.length ? results.join("\n\n") : "No results found." }],
				details: { type: params.type ?? "web", results: results.length },
			};
		},
	});
}
