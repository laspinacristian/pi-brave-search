// The Brave Search API endpoints behind each search type: request parameters and plain-text rendering.

export const SEARCH_TYPES = ["web", "news", "videos", "images"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export interface SearchParams {
	query: string;
	type?: SearchType;
	tokens?: number;
	count?: number;
	freshness?: string;
	country?: string;
	sites?: string[];
}

interface LlmContext {
	grounding?: { generic?: { url: string; title: string; snippets: string[] }[] };
	sources?: Record<string, { age?: string[] }>;
}
interface NewsResults {
	results?: { title: string; url: string; description?: string; age?: string; meta_url?: { hostname?: string }; extra_snippets?: string[] }[];
}
interface VideoResults {
	results?: { title: string; url: string; description?: string; age?: string; video?: { duration?: string; views?: number; creator?: string } }[];
}
interface ImageResults {
	results?: { title: string; url: string; properties?: { url?: string; width?: number; height?: number } }[];
}

interface Endpoint<T> {
	path: string;
	query(params: SearchParams): Record<string, string | number | undefined>;
	render(data: T): string[];
}

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

/** One result: a numbered title line, then its non-empty details. */
const entry = (index: number, title: string, ...lines: (string | undefined)[]) => [`--- [${index + 1}] ${plainText(title)}`, ...lines.filter((line) => line !== undefined)].join("\n");
const joined = (...parts: (string | number | undefined)[]) => parts.filter((part) => part !== undefined && part !== "").join(" · ");

/** Passages most relevant to the query, already extracted from each page. */
const web: Endpoint<LlmContext> = {
	path: "llm/context",
	query: ({ query, tokens = 4096, count = 20, freshness, country, sites }) => ({
		q: query,
		count,
		maximum_number_of_urls: count,
		maximum_number_of_tokens: tokens,
		freshness,
		country: country?.toLowerCase(),
		goggles: onlySites(sites),
	}),
	render: ({ grounding, sources = {} }) =>
		(grounding?.generic ?? []).map((r, i) => {
			const date = sources[r.url]?.age?.[1];
			return entry(i, r.title, date ? `${r.url} (${date})` : r.url, "", r.snippets.join("\n\n").trim());
		}),
};

const news: Endpoint<NewsResults> = {
	path: "news/search",
	query: ({ query, count = 10, freshness, country, sites }) => ({ q: query, count, freshness, country: country?.toLowerCase(), goggles: onlySites(sites), extra_snippets: "true" }),
	render: ({ results = [] }) =>
		results.map((r, i) => entry(i, r.title, joined(r.url, r.meta_url?.hostname, r.age), "", [r.description, ...(r.extra_snippets ?? [])].map(plainText).filter(Boolean).join("\n\n"))),
};

const videos: Endpoint<VideoResults> = {
	path: "videos/search",
	query: ({ query, count = 10, freshness, country }) => ({ q: query, count, freshness, country: country?.toLowerCase() }),
	render: ({ results = [] }) =>
		results.map((r, i) => {
			const views = r.video?.views ? `${Intl.NumberFormat("en", { notation: "compact" }).format(r.video.views)} views` : undefined;
			return entry(i, r.title, joined(r.url, r.video?.duration, r.video?.creator, views, r.age), r.description ? plainText(r.description) : undefined);
		}),
};

const images: Endpoint<ImageResults> = {
	path: "images/search",
	query: ({ query, count = 10, country }) => ({ q: query, count, country: country?.toLowerCase() }),
	render: ({ results = [] }) =>
		results.map((r, i) => {
			const size = r.properties?.width ? ` (${r.properties.width}×${r.properties.height})` : "";
			return entry(i, r.title, `${r.properties?.url ?? r.url}${size}`, `from ${r.url}`);
		}),
};

/** Query string of a request, without the parameters left unset. */
export function queryString(values: Record<string, string | number | undefined>): string {
	const entries = Object.entries(values).filter((pair): pair is [string, string | number] => pair[1] !== undefined);
	return new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString();
}

/** Search with Brave: one rendered entry per result. */
export function search(params: SearchParams, apiKey: string, signal?: AbortSignal): Promise<string[]> {
	switch (params.type ?? "web") {
		case "web":
			return request(web, params, apiKey, signal);
		case "news":
			return request(news, params, apiKey, signal);
		case "videos":
			return request(videos, params, apiKey, signal);
		case "images":
			return request(images, params, apiKey, signal);
	}
}

async function request<T>(endpoint: Endpoint<T>, params: SearchParams, apiKey: string, signal?: AbortSignal): Promise<string[]> {
	const response = await fetch(`https://api.search.brave.com/res/v1/${endpoint.path}?${queryString(endpoint.query(params))}`, {
		headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
		signal,
	});
	if (!response.ok) {
		const detail = ((await response.json().catch(() => undefined)) as { error?: { detail?: string } } | undefined)?.error?.detail;
		throw new Error(`Brave Search API: HTTP ${response.status}${detail ? ` (${detail})` : ""}`);
	}
	return endpoint.render((await response.json()) as T);
}

/** Exposed for tests: rendering of each endpoint's response. */
export const render = { web: web.render, news: news.render, videos: videos.render, images: images.render };
