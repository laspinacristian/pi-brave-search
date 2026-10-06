// The Brave Search API endpoints behind each search type: request parameters and plain-text rendering.

import { setTimeout as sleep } from "node:timers/promises";

export const SEARCH_TYPES = ["web", "news"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export interface SearchParams {
	query: string;
	type?: SearchType;
	tokens?: number;
	count?: number;
	freshness?: string;
	country?: string;
	language?: string;
	sites?: string[];
}

interface LlmContext {
	grounding?: { generic?: { url: string; title: string; snippets: string[] }[] };
	sources?: Record<string, { age?: string[] }>;
}
interface NewsResults {
	results?: { title: string; url: string; description?: string; age?: string; meta_url?: { hostname?: string }; extra_snippets?: string[] }[];
}

interface Endpoint<T> {
	path: string;
	query(params: SearchParams): Record<string, string | number | undefined>;
	render(data: T): string[];
}

/** Retries after HTTP 429 (the per-second limit), waiting for the window to reset. */
const MAX_RETRIES = 2;

/** A Goggle that keeps only these domains. */
export const onlySites = (sites?: string[]) => (sites?.length ? ["$discard", ...sites.map((site) => `$boost=1,site=${site}`)].join("\n") : undefined);

/** Brave returns titles and descriptions as HTML, with <strong> around the matched words. */
export function plainText(html = ""): string {
	const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
	return html
		.replace(/<[^>]*>/g, "")
		.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
			if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
			return String.fromCodePoint(code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1)));
		})
		.trim();
}

/** One result: a numbered title line, then its details. */
const entry = (index: number, title: string, ...lines: string[]) => [`--- [${index + 1}] ${plainText(title)}`, ...lines].join("\n");

/** Passages most relevant to the query, already extracted from each page. */
const web: Endpoint<LlmContext> = {
	path: "llm/context",
	query: ({ query, tokens = 4096, count = 20, freshness, country, language, sites }) => ({
		q: query,
		count,
		maximum_number_of_urls: count,
		maximum_number_of_tokens: tokens,
		freshness,
		country: country?.toLowerCase(),
		search_lang: language?.toLowerCase(),
		goggles: onlySites(sites),
	}),
	render: ({ grounding, sources = {} }) =>
		(grounding?.generic ?? []).map((r, i) => {
			const date = sources[r.url]?.age?.[1];
			return entry(i, r.title, date ? `${r.url} (${date})` : r.url, "", r.snippets.join("\n\n").trim());
		}),
};

/** Recent articles from news outlets. */
const news: Endpoint<NewsResults> = {
	path: "news/search",
	query: ({ query, count = 10, freshness, country, language, sites }) => ({
		q: query,
		count,
		freshness,
		country: country?.toLowerCase(),
		search_lang: language?.toLowerCase(),
		goggles: onlySites(sites),
		extra_snippets: "true",
	}),
	render: ({ results = [] }) =>
		results.map((r, i) => {
			const source = [r.url, r.meta_url?.hostname, r.age].filter(Boolean).join(" · ");
			const text = [r.description, ...(r.extra_snippets ?? [])].map(plainText).filter(Boolean).join("\n\n");
			return entry(i, r.title, source, "", text);
		}),
};

/** Query string of a request, without the parameters left unset. */
export function queryString(values: Record<string, string | number | undefined>): string {
	const entries = Object.entries(values).filter((pair): pair is [string, string | number] => pair[1] !== undefined);
	return new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString();
}

/**
 * How long to wait before retrying a 429, from the rate-limit headers ("<per second>, <per month>"),
 * or undefined when a longer quota is exhausted and waiting would not help. A limit of 0 means unlimited.
 */
export function retryDelayMs(headers: Headers): number | undefined {
	const values = (name: string) => (headers.get(name) ?? "").split(",").map((value) => Number(value.trim()));
	const limits = values("x-ratelimit-limit");
	const remaining = values("x-ratelimit-remaining");
	if (limits.some((limit, i) => i > 0 && limit > 0 && remaining[i] === 0)) return undefined;
	const reset = values("x-ratelimit-reset")[0];
	return Math.max(1, Number.isFinite(reset) ? reset : 1) * 1000;
}

/** Search with Brave: one rendered entry per result. */
export function search(params: SearchParams, apiKey: string, signal?: AbortSignal): Promise<string[]> {
	switch (params.type ?? "web") {
		case "web":
			return request(web, params, apiKey, signal);
		case "news":
			return request(news, params, apiKey, signal);
	}
}

async function request<T>(endpoint: Endpoint<T>, params: SearchParams, apiKey: string, signal?: AbortSignal): Promise<string[]> {
	const url = `https://api.search.brave.com/res/v1/${endpoint.path}?${queryString(endpoint.query(params))}`;
	for (let attempt = 0; ; attempt++) {
		const response = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": apiKey }, signal });
		if (response.ok) return endpoint.render((await response.json()) as T);

		const delay = response.status === 429 && attempt < MAX_RETRIES ? retryDelayMs(response.headers) : undefined;
		if (delay !== undefined) {
			await sleep(delay, undefined, { signal });
			continue;
		}
		const detail = ((await response.json().catch(() => undefined)) as { error?: { detail?: string } } | undefined)?.error?.detail;
		throw new Error(`Brave Search API: HTTP ${response.status}${detail ? ` (${detail})` : ""}`);
	}
}

/** Exposed for tests: rendering of each endpoint's response. */
export const render = { web: web.render, news: news.render };
