import type { StatPathEntry } from "../types/stats";

/**
 * Extract stat path entries from a <select> element in an NCAA.com stat page.
 *
 * NCAA stat pages have two dropdowns:
 *   #select-container-individual — individual stat categories
 *   #select-container-team       — team stat categories
 *
 * Each option's value is a relative path like /stats/soccer-men/d1/current/individual/421
 */
export function parseStatSelect(
	document: Document,
	selectId: string,
	pathType: "individual" | "team",
): StatPathEntry[] {
	const select = document.getElementById(selectId) as HTMLSelectElement | null;
	if (!select) {
		return [];
	}

	const entries: StatPathEntry[] = [];

	for (const option of select.options) {
		const value = option.value?.trim();
		const label = option.textContent?.trim();

		// Skip empty/placeholder options (e.g., "Select an Individual Statistic")
		if (!value || !label || /^select\b/i.test(label)) {
			continue;
		}

		// Extract the numeric ID from the URL
		// e.g., /stats/soccer-men/d1/current/individual/421
		const match = value.match(/\/current\/(individual|team)\/(\d+)/);
		if (!match) {
			continue;
		}

		entries.push({
			id: match[2],
			label,
			path: `${pathType}/${match[2]}`,
		});
	}

	return entries;
}
